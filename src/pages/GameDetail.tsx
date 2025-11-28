import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  XCircle,
  Play,
} from "lucide-react";
import { SimilarGemsSection } from "@/components/SimilarGemsSection";
import { supabase } from "@/integrations/supabase/client";


// Returns the tags that should be displayed on the detail page.
// Priority: analysis.labels (AI labels) -> fallback to raw tags.
const getDisplayTags = (
  game: { analysis?: { labels?: string[] }; tags?: string[] },
  limit?: number
): string[] => {
  const baseTags =
    (game.analysis?.labels && game.analysis.labels.length > 0
      ? game.analysis.labels
      : game.tags ?? []) || [];

  if (!limit || baseTags.length <= limit) {
    return baseTags;
  }

  return baseTags.slice(0, limit);
};

// gemLabel のバリエーション（将来の拡張も考えて一元管理）
type GemLabel =
  | "Hidden Gem"
  | "Improved Hidden Gem"
  | "Emerging Gem"
  | "Highly rated but not hidden"
  | "Not a hidden gem";

interface AnalysisData {
  hiddenGemVerdict?: "Yes" | "No" | "Unknown";
  summary?: string;
  labels?: string[];
  pros?: string[];
  cons?: string[];
  riskScore?: number;
  bugRisk?: number;
  refundMentions?: number;
  reviewQualityScore?: number;
  // ★ 追加: 統計ベースの「隠れた名作度」スコア
  statGemScore?: number;
  // 追加: 「今と昔」系の情報
  currentStateSummary?: string | null;
  historicalIssuesSummary?: string | null;
  stabilityTrend?:
  | "Improving"
  | "Stable"
  | "Deteriorating"
  | "Unknown"
  | null;
  hasImprovedSinceLaunch?: boolean | null;

  // ★ 追加: 「現在の状態」「過去の問題」の信頼度（analyze-game から来る）
  currentStateReliability?: "high" | "medium" | "low" | null;
  historicalIssuesReliability?: "high" | "medium" | "low" | null;

  // ★ 追加: プレイヤータイプ（ポジ／ネガ）
  audiencePositive?: {
    id: string;
    label: string;
    description?: string;
  }[];
  audienceNegative?: {
    id: string;
    label: string;
    description?: string;
  }[];
}

interface SteamScreenshot {
  type?: "image" | "video"; // search-hidden-gems から "video" が来る想定。省略時は image 扱い
  thumbnail?: string;
  full?: string;
}

interface GameDetailState {
  appId?: string | number;
  title?: string;
  gameData?: {
    appId: number;
    title: string;
    positiveRatio: number;
    totalReviews: number;
    estimatedOwners: number;
    price: number;
    averagePlaytime: number;
    tags?: string[];
    steamUrl?: string;
    reviewScoreDesc?: string;
    gemLabel?: GemLabel;
    analysis?: AnalysisData;
    screenshots?: SteamScreenshot[];
    releaseDate?: string | null;
    releaseYear?: number | null;
    headerImage?: string | null;
  };
  analysis?: AnalysisData;
  analysisData?: AnalysisData;
  // Legacy props for backward compatibility
  gemLabel?: GemLabel;
  hiddenGemVerdict?: string;
  summary?: string;
  labels?: string[];
  pros?: string[];
  cons?: string[];
  riskScore?: number;
  bugRisk?: number;
  refundMentions?: number;
  reviewQualityScore?: number;
  positiveRatio?: number;
  totalReviews?: number;
  estimatedOwners?: number;
  price?: number;
  averagePlaytime?: number;
  tags?: string[];
  steamUrl?: string;
  reviewScoreDesc?: string;
  screenshots?: SteamScreenshot[];
  releaseDate?: string | null;
  releaseYear?: number | null;
  // ★ 追加: レガシー経由で headerImage を直接持たせる場合用
  headerImage?: string | null;
  // レガシー経由でも拾えるようにしておく
  currentStateSummary?: string;
  historicalIssuesSummary?: string;
  stabilityTrend?: "Improving" | "Stable" | "Deteriorating" | "Unknown";
  hasImprovedSinceLaunch?: boolean;
}

type GameData = NonNullable<GameDetailState["gameData"]>;

export default function GameDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const game = location.state as GameDetailState;

  // Steam 側の最新情報で上書きするための state
  const [liveGameData, setLiveGameData] = useState<GameData | null>(null);
  const [isLoadingSteam, setIsLoadingSteam] = useState(false);
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState(0);
  const [invalidMediaSrcs, setInvalidMediaSrcs] = useState<string[]>([]);


  // ★ 追加: analyze-game の結果と状態
  const [remoteAnalysis, setRemoteAnalysis] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);


  // ★ 追加: GameDetail に遷移したときに AI 解析を走らせる
  useEffect(() => {
    if (!game) return;

    const existingAnalysis: AnalysisData | undefined =
      game.gameData?.analysis || game.analysis || game.analysisData;

    // 新仕様（今と昔モデル）の情報がすでに入っているかどうかをチェック
    const hasNewModelAnalysis =
      !!existingAnalysis &&
      (
        existingAnalysis.currentStateSummary ||              // 現在の状態
        existingAnalysis.historicalIssuesSummary ||          // 過去の問題
        typeof existingAnalysis.stabilityTrend === "string" ||  // 安定度トレンド
        typeof existingAnalysis.hasImprovedSinceLaunch === "boolean" // 改善フラグ
      );

    // 新モデルの解析がすでにある場合は再解析しない
    if (hasNewModelAnalysis) {
      return;
    }

    // すでに fetch 済み or 実行中なら何もしない
    if (isAnalyzing || remoteAnalysis) return;

    let cancelled = false;

    const run = async () => {
      setIsAnalyzing(true);
      setAnalysisError(null);

      // GameDetailState から analyze-game に渡すための GameData を組み立て
      const source = game.gameData ?? {
        appId: (game.appId as number) || 0,
        title: game.title || "Unknown Game",
        positiveRatio: game.positiveRatio || 0,
        totalReviews: game.totalReviews || 0,
        estimatedOwners: game.estimatedOwners || 0,
        price: game.price || 0,
        averagePlaytime: game.averagePlaytime || 0,
        tags: game.tags || [],
        steamUrl: game.steamUrl,
        reviewScoreDesc: game.reviewScoreDesc,
        releaseDate: game.releaseDate ?? null,
        releaseYear: game.releaseYear ?? null,
      };

      const payload = {
        title: source.title,
        appId: source.appId,
        positiveRatio: source.positiveRatio,
        totalReviews: source.totalReviews,
        estimatedOwners: source.estimatedOwners,
        recentPlayers: 0, // GameDetailState には無いので 0 で補完
        price: source.price,
        averagePlaytime: source.averagePlaytime,
        lastUpdated: source.releaseDate || new Date().toISOString(),
        releaseDate: source.releaseDate,
        tags: source.tags ?? [],
        // reviews / earlyReviews / recentReviews を扱う場合はここに追加する
      };

      const { data, error } = await supabase.functions.invoke<AnalysisData>(
        "analyze-game",
        { body: payload }
      );

      if (cancelled) return;

      if (error) {
        console.error("analyze-game error:", error);
        setAnalysisError(error.message ?? "AI解析に失敗しました");
        setIsAnalyzing(false);
        return;
      }

      if (!data) {
        setAnalysisError("AI解析結果を取得できませんでした");
        setIsAnalyzing(false);
        return;
      }

      // ★ analyze-game から返ってきた HiddenGemAnalysis をそのまま反映
      setRemoteAnalysis(data);
      setIsAnalyzing(false);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [game, isAnalyzing, remoteAnalysis]);


  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      // When there is no navigation history (e.g. direct open), go back to Home
      navigate("/");
    }
  };

  if (!game) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No game data available</p>
          <Button onClick={() => navigate("/")}>Return to Analyzer</Button>
        </Card>
      </div>
    );
  }

  // Extract data from new structure or fall back to legacy structure
  const gameData: GameData =
    game.gameData ??
    ({
      appId: game.appId || 0,
      title: game.title || "Unknown Game",
      positiveRatio: game.positiveRatio || 0,
      totalReviews: game.totalReviews || 0,
      estimatedOwners: game.estimatedOwners || 0,
      price: game.price || 0,
      averagePlaytime: game.averagePlaytime || 0,
      tags: game.tags || [],
      steamUrl: game.steamUrl,
      reviewScoreDesc: game.reviewScoreDesc,
      // fallback 側にも gemLabel / analysis を用意しておく
      gemLabel: game.gemLabel as GameData["gemLabel"],
      analysis: (game.analysis as AnalysisData) ??
        (game.analysisData as GameData["analysis"]),
      screenshots: game.screenshots as GameData["screenshots"],
      releaseDate: game.releaseDate ?? null,
      releaseYear: game.releaseYear ?? null,
      // ★ 追加: レガシー経路なら top-level の headerImage を拾う
      headerImage: game.headerImage ?? null,
    } as GameData);

  // Steam から取得した最新情報があれば優先する
  const baseGame = liveGameData ?? gameData;

  // まずは DB / navigation state から来ている既存の解析を組み立てる
  const primaryAnalysis: AnalysisData | undefined =
    gameData.analysis ?? game.analysis ?? game.analysisData;

  const baseAnalysisData: AnalysisData = {
    // まずは Supabase から来た新しい analysis をそのまま土台にする
    ...(primaryAnalysis ?? {}),

    // その上で、足りない項目だけ legacy から埋める
    hiddenGemVerdict:
      primaryAnalysis?.hiddenGemVerdict ??
      (game.hiddenGemVerdict as AnalysisData["hiddenGemVerdict"]),
    summary: primaryAnalysis?.summary ?? game.summary,
    labels: primaryAnalysis?.labels ?? game.labels,
    pros: primaryAnalysis?.pros ?? game.pros,
    cons: primaryAnalysis?.cons ?? game.cons,
    riskScore: primaryAnalysis?.riskScore ?? game.riskScore,
    bugRisk: primaryAnalysis?.bugRisk ?? game.bugRisk,
    refundMentions:
      primaryAnalysis?.refundMentions ?? game.refundMentions,
    reviewQualityScore:
      primaryAnalysis?.reviewQualityScore ?? game.reviewQualityScore,
    currentStateSummary:
      primaryAnalysis?.currentStateSummary ?? game.currentStateSummary,
    historicalIssuesSummary:
      primaryAnalysis?.historicalIssuesSummary ??
      game.historicalIssuesSummary,
    stabilityTrend:
      primaryAnalysis?.stabilityTrend ??
      (game.stabilityTrend as AnalysisData["stabilityTrend"]),
    hasImprovedSinceLaunch:
      primaryAnalysis?.hasImprovedSinceLaunch ??
      game.hasImprovedSinceLaunch,
  };

  // ★ analyze-game の結果があれば、それを最優先で使う
  const analysisData: AnalysisData = remoteAnalysis ?? baseAnalysisData;



  // Safe fallback arrays for fields that may be undefined
  const pros = Array.isArray(analysisData.pros) ? analysisData.pros : [];
  const cons = Array.isArray(analysisData.cons) ? analysisData.cons : [];
  const labels = Array.isArray(analysisData.labels) ? analysisData.labels : [];

  // プレイヤータイプ配列を安全に整形するヘルパー
  const normalizeAudienceSegmentList = (
    value: AnalysisData["audiencePositive"]
  ) => {
    if (!Array.isArray(value)) return [];
    const result: { id: string; label: string; description?: string }[] = [];

    for (const item of value) {
      if (!item) continue;

      if (typeof (item as any) === "string") {
        const label = (item as unknown as string).trim();
        if (!label) continue;
        result.push({
          id: label.toLowerCase().replace(/\s+/g, "_").slice(0, 48),
          label,
        });
        continue;
      }

      if (typeof item === "object") {
        const label =
          typeof item.label === "string" && item.label.trim()
            ? item.label.trim()
            : typeof item.id === "string" && item.id.trim()
              ? item.id.trim()
              : "";
        if (!label) continue;

        const id =
          typeof item.id === "string" && item.id.trim()
            ? item.id.trim()
            : label.toLowerCase().replace(/\s+/g, "_").slice(0, 48);

        const description =
          typeof item.description === "string" && item.description.trim()
            ? item.description.trim()
            : undefined;

        result.push({ id, label, ...(description ? { description } : {}) });
      }
    }

    return result;
  };

  const audiencePositive = normalizeAudienceSegmentList(
    analysisData.audiencePositive
  );
  const audienceNegative = normalizeAudienceSegmentList(
    analysisData.audienceNegative
  );


  // Safe values with defaults
  const title = baseGame.title || "Unknown Game";
  const summary =
    analysisData.summary ||
    "レビューが少ないか、まだ十分な情報がないため、AIによる要約は生成されていません。";

  const hiddenGemVerdict = analysisData.hiddenGemVerdict ?? "Unknown";

  const normalizeSectionText = (value?: string | null) =>
    typeof value === "string" ? value.trim() : "";

  const currentStateText = normalizeSectionText(
    analysisData.currentStateSummary
  );
  const historicalIssuesText = normalizeSectionText(
    analysisData.historicalIssuesSummary
  );
  const SECTION_MIN_CHARS = 12;

  const shouldShowCurrentState =
    currentStateText.length >= SECTION_MIN_CHARS;
  const shouldShowHistoricalIssues =
    historicalIssuesText.length >= SECTION_MIN_CHARS;

  const stabilityTrend =
    typeof analysisData.stabilityTrend === "string"
      ? analysisData.stabilityTrend
      : "Unknown";
  const hasImprovedSinceLaunch = analysisData.hasImprovedSinceLaunch ?? null;


  const reviewQualityScore =
    typeof analysisData.reviewQualityScore === "number"
      ? analysisData.reviewQualityScore
      : null;

  // ★ 統計ベースの隠れた名作度スコア（1〜10）
  const statGemScore =
    typeof analysisData.statGemScore === "number"
      ? analysisData.statGemScore
      : null;

  // …price / tags などの定義の前でOK
  const aiGemScore = statGemScore ?? reviewQualityScore ?? null;


  const riskScore =
    typeof analysisData.riskScore === "number"
      ? analysisData.riskScore
      : null;

  const bugRisk =
    typeof analysisData.bugRisk === "number" ? analysisData.bugRisk : null;

  const refundMentions =
    typeof analysisData.refundMentions === "number"
      ? analysisData.refundMentions
      : null;

  const positiveRatio = baseGame.positiveRatio || 0;
  const totalReviews = baseGame.totalReviews || 0;
  const estimatedOwners = baseGame.estimatedOwners || 0;
  const price = baseGame.price || 0;
  const averagePlaytime = baseGame.averagePlaytime || 0;
  // 平均プレイ時間（分） → 時間（x.x h）へ変換
  const averagePlaytimeHours =
    averagePlaytime > 0 ? (averagePlaytime / 60).toFixed(1) : "N/A";

  const tags = baseGame.tags || [];
  const steamUrl = baseGame.steamUrl;
  const reviewScoreDesc = baseGame.reviewScoreDesc;

  const releaseDateValue =
    baseGame.releaseDate ?? game.releaseDate ?? null;
  const releaseYearValue =
    baseGame.releaseYear ?? game.releaseYear ?? null;
  const formattedReleaseDate =
    releaseDateValue
      ? new Date(releaseDateValue).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
      : releaseYearValue
        ? String(releaseYearValue)
        : null;

  const isFree = price === 0;
  const normalizedPrice =
    typeof price === "number" && Number.isFinite(price) ? price : 0;
  const priceDisplay =
    normalizedPrice === 0 ? "Free" : `$${normalizedPrice.toFixed(2)}`;
  const positiveRatioDisplay = Math.round(positiveRatio);

  const effectiveAppId = baseGame.appId || game.appId || 0;
  const appIdStr = String(effectiveAppId);
  // ★ 追加: DB や navigation state から渡ってきた header_image を優先
  const explicitHeaderImage =
    liveGameData?.headerImage ??
    baseGame.headerImage ??
    game.headerImage ??
    null;

  // 従来の appId ベースの header.jpg（フォールバック用）
  const fallbackHeaderImageUrl =
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;

  // 最終的に <img src> に渡す URL
  const headerImageUrl =
    explicitHeaderImage && explicitHeaderImage.trim() !== ""
      ? explicitHeaderImage
      : fallbackHeaderImageUrl;

  const screenshots: SteamScreenshot[] =
    (liveGameData?.screenshots ??
      baseGame.screenshots ??
      game.screenshots ??
      []) as SteamScreenshot[];

  // ギャラリー用メディアリスト（画像＋動画）
  // 無効扱いになった URL (full / thumbnail) はここで除外する
  const mediaItems: SteamScreenshot[] = screenshots.filter((item) => {
    const fullSrc = item?.full;
    const thumbSrc = item?.thumbnail;
    if (!fullSrc && !thumbSrc) return false;
    if (fullSrc && invalidMediaSrcs.includes(fullSrc)) return false;
    if (thumbSrc && invalidMediaSrcs.includes(thumbSrc)) return false;
    return true;
  });

  const hasMedia = mediaItems.length > 0;

  // activeScreenshotIndex をメディア数の範囲に収める
  const clampedActiveIndex = hasMedia
    ? Math.min(Math.max(activeScreenshotIndex, 0), mediaItems.length - 1)
    : 0;

  const activeMedia = hasMedia ? mediaItems[clampedActiveIndex] : undefined;
  const activeMediaSrc =
    activeMedia?.full || activeMedia?.thumbnail || undefined;


  const gemLabel: GemLabel | undefined =
    baseGame.gemLabel ||
    game.gemLabel ||
    (hiddenGemVerdict === "Yes" ? "Hidden Gem" : undefined);

  // Tags to display under the title (same logic as GameCard / Home)
  const displayTags = getDisplayTags({ analysis: analysisData, tags });

  const getScoreColor = (score: number | null) => {
    const value = score ?? 0;
    if (value >= 7) return "text-destructive";
    if (value >= 4) return "text-warning";
    return "text-success";
  };

  // タイトル付近に出す「安定度バッジ」の内容を決める
  const getStabilityBadge = () => {
    const isImproving =
      stabilityTrend === "Improving" || hasImprovedSinceLaunch === true;
    const isStable = stabilityTrend === "Stable";
    const isDeteriorating = stabilityTrend === "Deteriorating";

    if (isImproving) {
      return {
        label: hasImprovedSinceLaunch ? "復活したタイトル" : "改善中",
        description:
          "リリース初期よりも最近のレビュー評価が明らかに良くなってきています。",
        className:
          "bg-emerald-500/10 text-emerald-500 border-emerald-500/40",
      };
    }

    if (isStable) {
      return {
        label: "安定した評価",
        description: "長期的に見てもレビュー傾向が安定しているタイトルです。",
        className: "bg-blue-500/10 text-blue-500 border-blue-500/40",
      };
    }

    if (isDeteriorating) {
      return {
        label: "最近悪化中",
        description:
          "直近レビューで評価が下がり気味なので、アップデート動向を要チェックです。",
        className: "bg-amber-500/10 text-amber-600 border-amber-500/40",
      };
    }

    return null;
  };

  const stabilityBadge = getStabilityBadge();
  const shouldShowStabilityBadge = Boolean(stabilityBadge);

  // 現在表示中のメディア（動画）の full / thumbnail をまとめて無効扱いにする
  const markActiveMediaInvalid = () => {
    if (!activeMedia) return;
    const srcs = [activeMedia.full, activeMedia.thumbnail].filter(
      (s): s is string => !!s
    );
    if (srcs.length === 0) return;

    setInvalidMediaSrcs((prev) => {
      const next = [...prev];
      for (const s of srcs) {
        if (!next.includes(s)) {
          next.push(s);
        }
      }
      return next;
    });
  };


  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f163a_0,_#050509_45%,_#020008_100%)] text-slate-50">
      {/* === Hero Header Image (Full-width) ======================== */}
      <div className="w-full border-b border-white/5 bg-gradient-to-b from-black/70 via-black/40 to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="relative w-full h-[260px] md:h-[320px] overflow-hidden rounded-b-[32px] border-x border-b border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.85)] bg-black">
            <img
              src={headerImageUrl}
              alt={title}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                // 画像が存在しない場合は非表示
                e.currentTarget.style.display = "none";
              }}
            />
            {/* 上から薄いグラデをかけて LP の Hero っぽく */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          </div>
        </div>
      </div>

      {/* === Main Content ========================================= */}
      <div className="max-w-5xl mx-auto px-4 pb-10 pt-6 md:px-8 md:pb-16 md:pt-10 space-y-6 -mt-6 md:-mt-10">
        {/* Header Navigation */}
        <div className="flex flex-wrap items-center gap-4 mt-5">
          <Button
            variant="outline"
            onClick={handleBack}
            className="rounded-full border-white/20 bg-black/40 text-slate-100 hover:bg-black/70 hover:border-white/40"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          {isLoadingSteam && (
            <span className="text-xs text-muted-foreground">
              Steam から最新のメタ情報を取得中…
            </span>
          )}
          {isAnalyzing && (
            <span className="text-xs text-muted-foreground">
              レビューを AI 解析中…
            </span>
          )}
          {analysisError && (
            <span className="text-xs text-red-400">
              {analysisError}
            </span>
          )}
        </div>

        {/* Title & Hero Section */}
        <Card className="mt-2 rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_#31235f_0,_#151326_45%,_#050509_100%)] shadow-[0_24px_70px_rgba(0,0,0,0.85)]">
          <CardHeader>
            <div className="space-y-6 min-w-0">
              {/* タイトル */}
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  Hidden Gem Analyzer
                </p>
                <CardTitle className="text-3xl md:text-4xl font-extrabold tracking-tight">
                  {title}
                </CardTitle>
              </div>

              {/* ギャラリー：メインメディア（画像 or 動画）＋下にミニサムネ */}
              {hasMedia && activeMediaSrc && (
                <div className="space-y-3">
                  {/* メインメディア（カード横幅いっぱい） */}
                  <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-[#050711]">
                    {activeMedia?.type === "video" ? (
                      <video
                        key={activeMediaSrc}
                        src={activeMediaSrc}
                        controls
                        className="w-full h-full object-cover"
                        // メタデータが読めた段階で duration をチェックして 0 秒付近の動画は無効扱い
                        onLoadedMetadata={(e) => {
                          const duration = e.currentTarget.duration;
                          if (!duration || duration < 1) {
                            // 今表示中の動画を無効扱いにして、次のメディアへ
                            markActiveMediaInvalid();
                            const nextIndex =
                              mediaItems.length > 1
                                ? (clampedActiveIndex + 1) % mediaItems.length
                                : clampedActiveIndex;
                            if (nextIndex !== clampedActiveIndex) {
                              setActiveScreenshotIndex(nextIndex);
                            }
                          }
                        }}
                        // ネットワークエラー等でも同様に無効扱いしてスキップ
                        onError={() => {
                          markActiveMediaInvalid();
                          const nextIndex =
                            mediaItems.length > 1
                              ? (clampedActiveIndex + 1) % mediaItems.length
                              : clampedActiveIndex;
                          if (nextIndex !== clampedActiveIndex) {
                            setActiveScreenshotIndex(nextIndex);
                          }
                        }}
                      />
                    ) : (
                      <img
                        src={activeMediaSrc}
                        alt={`${title} screenshot ${clampedActiveIndex + 1}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // メイン画像が壊れている場合はいったん非表示
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    {/* 上にちょっとしたグラデ */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  </div>

                  {/* ミニサムネ行（Steam風：動画も含む） */}
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {mediaItems.map((item, index) => {
                      const isActive = index === clampedActiveIndex;
                      const isVideo = item.type === "video";
                      const thumbSrc = item.thumbnail || item.full;

                      if (!thumbSrc) return null;

                      return (
                        <button
                          key={`${thumbSrc}-${index}`}
                          type="button"
                          onClick={() => setActiveScreenshotIndex(index)}
                          className={`group relative flex-none h-16 w-28 md:h-20 md:w-36 rounded-xl overflow-hidden border bg-[#050711] ${isActive
                            ? "border-cyan-400 ring-2 ring-cyan-400/60"
                            : "border-white/10"
                            }`}
                        >
                          <img
                            src={thumbSrc}
                            alt={`${title} thumbnail ${index + 1}`}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:brightness-110"
                            onError={(e) => {
                              // 壊れたサムネは非表示
                              const parent = e.currentTarget.parentElement;
                              if (parent) parent.style.display = "none";

                              // このサムネに対応するメディアを無効扱いにする
                              if (thumbSrc) {
                                setInvalidMediaSrcs((prev) =>
                                  prev.includes(thumbSrc)
                                    ? prev
                                    : [...prev, thumbSrc]
                                );
                              }
                            }}
                          />

                          {/* 動画の場合は再生アイコンを重ねる */}
                          {isVideo && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <div className="rounded-full bg-black/70 p-2">
                                <Play className="w-4 h-4 text-white" />
                              </div>
                            </div>
                          )}

                          {/* アクティブ時の枠オーバーレイ */}
                          {isActive && (
                            <div className="pointer-events-none absolute inset-0 ring-2 ring-cyan-400/70" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ギャラリーの下で左右2カラム：左に情報ブロック、右に AI Gem Score */}
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 pt-2">
                {/* 左：Release / バッジ / 評価テキスト / タグ */}
                <div className="flex-1 space-y-3 min-w-0">
                  {formattedReleaseDate && (
                    <p className="text-xs md:text-sm text-slate-300">
                      <span className="text-slate-400/80">Release:</span>{" "}
                      {formattedReleaseDate}
                    </p>
                  )}

                  {/* 安定度ステータスバッジ */}
                  {stabilityBadge && (
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-semibold rounded-full border px-3 py-1 ${stabilityBadge.className}`}
                      >
                        {stabilityBadge.label}
                      </Badge>
                      {stabilityBadge.description && (
                        <span className="text-xs text-slate-300/80">
                          {stabilityBadge.description}
                        </span>
                      )}
                    </div>
                  )}

                  {reviewScoreDesc && (
                    <p className="text-sm text-slate-200/90">
                      {reviewScoreDesc}
                    </p>
                  )}

                  {displayTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {displayTags.map((tag, idx) => (
                        <Badge
                          key={`${tag}-${idx}`}
                          variant="secondary"
                          className="rounded-full bg-[#120f28] border border-white/10 text-[11px] px-3 py-1"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* 右：AI Gem Score（md 以上で左と横並び） */}
                <div className="mt-4 md:mt-0 w-full md:w-auto md:max-w-xs text-center bg-[#050713]/90 p-6 rounded-2xl border border-white/15 shadow-lg">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2">
                    AI Gem Score
                  </div>
                  <div className="flex items-baseline justify-center gap-1 mb-2">
                    <span className="text-5xl font-extrabold bg-gradient-to-r from-pink-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
                      {aiGemScore !== null ? aiGemScore.toFixed(1) : "N/A"}
                    </span>
                    <span className="text-2xl text-slate-400">/10</span>
                  </div>

                  {gemLabel && (
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {gemLabel === "Hidden Gem" ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : gemLabel === "Highly rated but not hidden" ? (
                        <CheckCircle2 className="w-5 h-5 text-sky-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-slate-500" />
                      )}
                      <span className="font-semibold text-sm">
                        {gemLabel}
                      </span>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-300/90 mt-2 leading-relaxed">
                    AI verdict:&nbsp;
                    {hiddenGemVerdict === "Yes" &&
                      "かなり安心しておすすめできる隠れた良作です。"}
                    {hiddenGemVerdict === "Unknown" &&
                      "良作の可能性は高そうですが、まだ慎重に見たほうがよさそうです。"}
                    {hiddenGemVerdict === "No" &&
                      "レビュー内容から見ると、好みを選ぶ／注意が必要なタイトルです。"}
                    {!hiddenGemVerdict &&
                      "AIの判定情報はまだ十分ではありません。"}
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Summary */}
        <Card className="rounded-[24px] border border-white/10 bg-[#070716]/95 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Analysis Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm md:text-base text-slate-200/90 leading-relaxed whitespace-pre-line">
              {summary}
            </p>
          </CardContent>
        </Card>

        {/* Pros & Cons */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="rounded-[24px] border-emerald-500/30 bg-[#041510]/95 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2 text-emerald-400">
                <ThumbsUp className="w-5 h-5" />
                Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pros.length > 0 ? (
                <ul className="space-y-3">
                  {pros.map((pro, idx) => (
                    <li key={idx} className="flex gap-3 text-sm">
                      <span className="text-emerald-400 mt-0.5">●</span>
                      <span className="text-slate-200/90">{pro}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-300/80">
                  レビューから特徴的な「良い点」はまだ抽出されていません。
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-rose-500/40 bg-[#190711]/95 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2 text-rose-400">
                <ThumbsDown className="w-5 h-5" />
                Weaknesses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cons.length > 0 ? (
                <ul className="space-y-3">
                  {cons.map((con, idx) => (
                    <li key={idx} className="flex gap-3 text-sm">
                      <span className="text-rose-400 mt-0.5">●</span>
                      <span className="text-slate-200/90">{con}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-300/80">
                  目立った「弱点」についてのレビューはまだ少ないようです。
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 「今」と「昔」を分けて表示 */}
        {(shouldShowCurrentState || shouldShowHistoricalIssues) && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* 現在の状態 */}
            {shouldShowCurrentState && (
              <Card className="rounded-[24px] border border-white/10 bg-[#080716]/95 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    現在の状態（Current state）
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-200/90 whitespace-pre-line">
                    {currentStateText}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* 過去の問題・初期評価 */}
            {shouldShowHistoricalIssues && (
              <Card className="rounded-[24px] border border-white/10 bg-[#080716]/95 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    過去の問題・初期評価（Historical issues）
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-200/90 whitespace-pre-line">
                    {historicalIssuesText}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Player Fit: どんなプレイヤーに刺さるか／刺さらないか */}
        {(audiencePositive.length > 0 || audienceNegative.length > 0) && (
          <Card className="rounded-[24px] border border-white/10 bg-[#070716]/95 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">
                プレイヤーとの相性（Who this game is for）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {/* 刺さっているプレイヤー像 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ThumbsUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-300">
                      こんなプレイヤーに刺さっています
                    </span>
                  </div>
                  {audiencePositive.length > 0 ? (
                    <ul className="space-y-3 text-sm">
                      {audiencePositive.map((seg) => (
                        <li key={seg.id} className="space-y-1">
                          <div className="font-semibold text-slate-50">
                            {seg.label}
                          </div>
                          {seg.description && (
                            <p className="text-xs text-slate-300/85 leading-relaxed">
                              {seg.description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400">
                      まだ「どんなプレイヤーに刺さっているか」の傾向は十分に抽出されていません。
                    </p>
                  )}
                </div>

                {/* 刺さりにくいプレイヤー像 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ThumbsDown className="w-4 h-4 text-rose-400" />
                    <span className="text-sm font-semibold text-rose-300">
                      こんなプレイヤーにはやや不向きかもしれません
                    </span>
                  </div>
                  {audienceNegative.length > 0 ? (
                    <ul className="space-y-3 text-sm">
                      {audienceNegative.map((seg) => (
                        <li key={seg.id} className="space-y-1">
                          <div className="font-semibold text-slate-50">
                            {seg.label}
                          </div>
                          {seg.description && (
                            <p className="text-xs text-slate-300/85 leading-relaxed">
                              {seg.description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400">
                      「どんなプレイヤーには向いていないか」の明確な傾向は、まだあまり見えていません。
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Key Insights */}
        <Card className="rounded-[24px] border border-white/10 bg-[#070716]/95 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Key Insights</CardTitle>
          </CardHeader>
          <CardContent>
            {labels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {labels.map((label, idx) => (
                  <Badge
                    key={`${label}-${idx}`}
                    variant="secondary"
                    className="rounded-full bg-[#13122c] border border-white/10 text-xs py-1.5 px-3"
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-300/80">
                まだ特徴的なキーワードは抽出されていません。
              </p>
            )}
          </CardContent>
        </Card>

        {/* Metrics & Scores */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Quality & Risk Scores */}
          <Card className="rounded-[24px] border border-white/10 bg-[#070716]/95 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">
                Quality &amp; Risk Assessment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-200/90">Bug Risk</span>
                  <span
                    className={`font-semibold ${getScoreColor(
                      bugRisk
                    )} text-sm`}
                  >
                    {bugRisk !== null ? `${bugRisk}/10` : "N/A"}
                  </span>
                </div>
                <Progress value={(bugRisk ?? 0) * 10} className="h-2.5" />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-200/90">Refund Mentions</span>
                  <span
                    className={`font-semibold ${getScoreColor(
                      refundMentions
                    )} text-sm`}
                  >
                    {refundMentions !== null ? `${refundMentions}/10` : "N/A"}
                  </span>
                </div>
                <Progress
                  value={(refundMentions ?? 0) * 10}
                  className="h-2.5"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-200/90">Overall Risk</span>
                  <span
                    className={`font-semibold ${getScoreColor(
                      riskScore
                    )} text-sm`}
                  >
                    {riskScore !== null ? `${riskScore}/10` : "N/A"}
                  </span>
                </div>
                <Progress value={(riskScore ?? 0) * 10} className="h-2.5" />
              </div>
            </CardContent>
          </Card>

          {/* Game Stats */}
          <Card className="rounded-[24px] border border-white/10 bg-[#070716]/95 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Game Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-300/80 mb-1">
                    Positive Reviews
                  </div>
                  <div className="text-2xl font-bold text-cyan-300">
                    {positiveRatioDisplay}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-300/80 mb-1">
                    Total Reviews
                  </div>
                  <div className="text-2xl font-bold">
                    {totalReviews.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-300/80 mb-1">Price</div>
                  <div className="text-2xl font-bold text-emerald-300">
                    {priceDisplay}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-slate-300/80 mb-1">
                    Avg Playtime
                  </div>
                  <div className="text-2xl font-bold">
                    {averagePlaytimeHours !== "N/A"
                      ? `${averagePlaytimeHours}h`
                      : "N/A"}
                  </div>
                </div>
              </div>
              <div className="pt-2">
                <div className="text-sm text-slate-300/80 mb-1">
                  Estimated Owners
                </div>
                <div className="text-xl font-semibold">
                  {estimatedOwners.toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        {steamUrl && (
          <Card className="rounded-[28px] border border-white/10 bg-gradient-to-r from-[#3b2bff]/20 via-[#ff4fd8]/20 to-[#ffb86b]/20 shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <CardContent className="py-8 text-center space-y-3">
              <p className="text-sm text-slate-200/90">
                気になったら、実際の Steam ストアページで細かい情報もチェックしてみてください。
              </p>
              <Button
                asChild
                size="lg"
                className="rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-cyan-400 px-8 text-slate-950 font-semibold shadow-[0_14px_40px_rgba(0,0,0,0.7)] hover:brightness-105"
              >
                <a href={steamUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-5 h-5 mr-2" />
                  Open on Steam
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Similar Gems */}
        <SimilarGemsSection
          game={
            {
              // pass enough data so SimilarGemsSection can use tags / analysis if it wants
              appId: effectiveAppId,
              tags: baseGame.tags ?? [],
              analysis: analysisData,
            } as any
          }
        />
      </div>
    </div>
  );


}
