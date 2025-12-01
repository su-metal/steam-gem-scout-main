import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  XCircle,
  Play,
} from "lucide-react";
import { SimilarGemsSection } from "@/components/SimilarGemsSection";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";


// Returns the tags that should be displayed on the detail page.
// Hidden Gem Analyzer では DB 上の tags（game_rankings_cache.tags）だけを使う。
const getDisplayTags = (
  game: { tags?: string[] },
  limit?: number
): string[] => {
  const baseTags = game.tags ?? [];

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
  // Deep Emoji Tags 用に icon / sub / fitScore / reason + 代表レビューを拡張
  audiencePositive?: {
    id: string;
    label: string;
    description?: string;

    icon?: string;      // 絵文字 or シンプルなアイコン文字
    sub?: string;       // 一言サブテキスト
    fitScore?: number;  // 1〜5 想定の「刺さり度」
    reason?: string;    // なぜ刺さるのか

    // 代表的なレビュー
    hitReviewOriginal?: string;
    hitReviewParaphrased?: string;
    missReviewOriginal?: string;
    missReviewParaphrased?: string;
  }[];
  audienceNegative?: {
    id: string;
    label: string;
    description?: string;

    icon?: string;
    sub?: string;
    fitScore?: number;
    reason?: string;

    hitReviewOriginal?: string;
    hitReviewParaphrased?: string;
    missReviewOriginal?: string;
    missReviewParaphrased?: string;
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
    moodScore?: number; // 0〜1 のマッチ度（SearchResultCard から渡す）
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
  type NormalizedAudience = {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    sub?: string;
    fitScore?: number;
    reason?: string;

    hitReviewOriginal?: string;
    hitReviewParaphrased?: string;
    missReviewOriginal?: string;
    missReviewParaphrased?: string;
  };


  // プレイヤータイプ配列を安全に整形するヘルパー
  const normalizeAudienceSegmentList = (
    value: AnalysisData["audiencePositive"]
  ): NormalizedAudience[] => {
    if (!Array.isArray(value)) return [];
    const result: NormalizedAudience[] = [];

    for (const item of value) {
      if (!item) continue;

      // 文字列だけ渡ってきた場合 → ラベルとして扱う
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
        const raw = item as any;
        const label =
          typeof raw.label === "string" && raw.label.trim()
            ? raw.label.trim()
            : typeof raw.id === "string" && raw.id.trim()
              ? raw.id.trim()
              : "";
        if (!label) continue;

        const id =
          typeof raw.id === "string" && raw.id.trim()
            ? raw.id.trim()
            : label.toLowerCase().replace(/\s+/g, "_").slice(0, 48);

        const description =
          typeof raw.description === "string" && raw.description.trim()
            ? raw.description.trim()
            : undefined;

        const icon =
          typeof raw.icon === "string" && raw.icon.trim()
            ? raw.icon.trim()
            : undefined;

        const sub =
          typeof raw.sub === "string" && raw.sub.trim()
            ? raw.sub.trim()
            : undefined;

        const fitScore =
          typeof raw.fitScore === "number" && Number.isFinite(raw.fitScore)
            ? raw.fitScore
            : undefined;

        const reason =
          typeof raw.reason === "string" && raw.reason.trim()
            ? raw.reason.trim()
            : undefined;

        const hitReviewOriginal =
          typeof raw.hitReviewOriginal === "string" &&
            raw.hitReviewOriginal.trim()
            ? raw.hitReviewOriginal.trim()
            : undefined;

        const hitReviewParaphrased =
          typeof raw.hitReviewParaphrased === "string" &&
            raw.hitReviewParaphrased.trim()
            ? raw.hitReviewParaphrased.trim()
            : undefined;

        const missReviewOriginal =
          typeof raw.missReviewOriginal === "string" &&
            raw.missReviewOriginal.trim()
            ? raw.missReviewOriginal.trim()
            : undefined;

        const missReviewParaphrased =
          typeof raw.missReviewParaphrased === "string" &&
            raw.missReviewParaphrased.trim()
            ? raw.missReviewParaphrased.trim()
            : undefined;

        result.push({
          id,
          label,
          ...(description ? { description } : {}),
          ...(icon ? { icon } : {}),
          ...(sub ? { sub } : {}),
          ...(fitScore !== undefined ? { fitScore } : {}),
          ...(reason ? { reason } : {}),
          ...(hitReviewOriginal ? { hitReviewOriginal } : {}),
          ...(hitReviewParaphrased ? { hitReviewParaphrased } : {}),
          ...(missReviewOriginal ? { missReviewOriginal } : {}),
          ...(missReviewParaphrased ? { missReviewParaphrased } : {}),
        });
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

  // Deep Emoji Tags 用タグ型
  type PlayerFitTag = {
    id: string;
    icon: string;
    label: string;
    sub: string;
    score: number; // 1〜5
    reason: string;
    polarity: "positive" | "negative";

    hitReviewOriginal?: string;
    hitReviewParaphrased?: string;
    missReviewOriginal?: string;
    missReviewParaphrased?: string;
  };

  // ★ 代表レビューを最大2件までのリストに整形するヘルパー
  const buildReviewList = (
    primary?: string,
    secondary?: string
  ): string[] => {
    const list: string[] = [];

    const p = typeof primary === "string" ? primary.trim() : "";
    const s = typeof secondary === "string" ? secondary.trim() : "";

    if (p) list.push(p);
    if (s && s !== p) list.push(s);

    // 最大2件まで
    return list.slice(0, 2);
  };

  const SCORE_STEPS = [1, 2, 3, 4, 5] as const;

  const clampScore = (value: number | undefined, fallback: number) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(5, Math.max(1, Math.round(value)));
  };

  const DEFAULT_POSITIVE_ICONS = ["🧠", "🧭", "🎯", "🐢", "🎮"];
  const DEFAULT_NEGATIVE_ICONS = ["⚡", "⏩", "📦", "🤹‍♂️", "💤"];

  const buildPlayerFitTags = (
    list: NormalizedAudience[],
    polarity: "positive" | "negative"
  ): PlayerFitTag[] => {
    return list.map((item, index) => {
      const fallbackIcon =
        polarity === "positive"
          ? DEFAULT_POSITIVE_ICONS[index % DEFAULT_POSITIVE_ICONS.length]
          : DEFAULT_NEGATIVE_ICONS[index % DEFAULT_NEGATIVE_ICONS.length];

      const icon = item.icon || fallbackIcon;
      const label = item.label;
      const sub =
        item.sub ||
        item.description ||
        (polarity === "positive"
          ? "このタイプとは特に相性が良い傾向です。"
          : "このタイプとはややミスマッチになりやすい傾向です。");

      const score = clampScore(
        item.fitScore,
        polarity === "positive" ? 4 : 2
      );

      const reason =
        item.reason ||
        item.description ||
        (polarity === "positive"
          ? "レビューから、このプレイスタイルと特に噛み合っていると判断されています。"
          : "レビューから、このプレイスタイルだとストレスを感じやすい可能性があると判断されています。");

      return {
        id: item.id,
        icon,
        label,
        sub,
        score,
        reason,
        polarity,
        ...(item.hitReviewOriginal
          ? { hitReviewOriginal: item.hitReviewOriginal }
          : {}),
        ...(item.hitReviewParaphrased
          ? { hitReviewParaphrased: item.hitReviewParaphrased }
          : {}),
        ...(item.missReviewOriginal
          ? { missReviewOriginal: item.missReviewOriginal }
          : {}),
        ...(item.missReviewParaphrased
          ? { missReviewParaphrased: item.missReviewParaphrased }
          : {}),
      };

    });
  };

  const playerFitPositiveTags = buildPlayerFitTags(audiencePositive, "positive");
  const playerFitNegativeTags = buildPlayerFitTags(audienceNegative, "negative");

  // ★ Player Fit 全体を 1 本のリストとして扱う
  const allPlayerFitTags: PlayerFitTag[] = [
    ...playerFitPositiveTags,
    ...playerFitNegativeTags,
  ];

  // ★ アクティブな行（スクロール / タップで切り替え）
  const [activePlayerFitId, setActivePlayerFitId] = useState<string | null>(
    allPlayerFitTags[0]?.id ?? null
  );

  // ★ 右スライドカードの「外側スワイプで閉じる」用
  const rightSlideOverlayStartYRef = useRef<number | null>(null);

  const handleRightSlideOverlayTouchStart = (
    e: React.TouchEvent<HTMLDivElement>
  ) => {
    if (e.touches.length === 0) return;
    rightSlideOverlayStartYRef.current = e.touches[0].clientY;
  };

  const handleRightSlideOverlayTouchMove = (
    e: React.TouchEvent<HTMLDivElement>
  ) => {
    const startY = rightSlideOverlayStartYRef.current;
    if (startY == null) return;
    if (e.touches.length === 0) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    const THRESHOLD = 40; // 40px 以上スワイプしたら「閉じる」

    if (Math.abs(deltaY) >= THRESHOLD) {
      setShowMobilePlayerDetail(false);
      rightSlideOverlayStartYRef.current = null;
      // このジェスチャー分はページスクロールさせない
      e.preventDefault();
    }
  };

  const handleRightSlideOverlayTouchEnd = () => {
    rightSlideOverlayStartYRef.current = null;
  };


  // ★ 追加: モバイル判定 & ボトムシート表示フラグ
  const [isMobile, setIsMobile] = useState(false);
  const [showMobilePlayerDetail, setShowMobilePlayerDetail] = useState(false);



  // ★ Player Match セクションの DOM を参照する ref
  const playerMatchSectionRef = useRef<HTMLDivElement | null>(null);

  // ★ スクロールベースのカード切り替え用 - 最後のスクロール位置
  const lastScrollYRef = useRef<number | null>(null);


  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 640px)");

    const update = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (!mobile) {
        // 画面が広くなったらボトムシートは閉じる
        setShowMobilePlayerDetail(false);
      }
    };

    update();

    if (mq.addEventListener) {
      mq.addEventListener("change", update);
    } else {
      mq.addListener(update);
    }

    return () => {
      if (mq.removeEventListener) {
        mq.removeEventListener("change", update);
      } else {
        mq.removeListener(update);
      }
    };
  }, []);


  // ★ Player Match セクションが画面外に出たら、モバイルの右スライドカードを閉じる
  useEffect(() => {
    if (!isMobile) return;
    if (typeof IntersectionObserver === "undefined") return;

    const target = playerMatchSectionRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        // Player Match セクションが一定以上見えなくなったら閉じる
        if (!entry.isIntersecting) {
          setShowMobilePlayerDetail(false);
        }
      },
      {
        threshold: 0.1, // 少しでも外れたら「画面外」とみなす
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [isMobile]);


  const activePlayerFitTag =
    allPlayerFitTags.find((t) => t.id === activePlayerFitId) ??
    allPlayerFitTags[0] ??
    null;

  // ★ 詳細カード用の代表レビュー（最大2件／極性ごと）
  const activePositiveReviews =
    activePlayerFitTag && activePlayerFitTag.polarity === "positive"
      ? [
        ...(activePlayerFitTag.hitReviewParaphrased
          ? [activePlayerFitTag.hitReviewParaphrased]
          : []),
        ...(activePlayerFitTag.hitReviewOriginal &&
          activePlayerFitTag.hitReviewOriginal !==
          activePlayerFitTag.hitReviewParaphrased
          ? [activePlayerFitTag.hitReviewOriginal]
          : []),
      ]
      : [];

  const activeNegativeReviews =
    activePlayerFitTag && activePlayerFitTag.polarity === "negative"
      ? [
        ...(activePlayerFitTag.missReviewParaphrased
          ? [activePlayerFitTag.missReviewParaphrased]
          : []),
        ...(activePlayerFitTag.missReviewOriginal &&
          activePlayerFitTag.missReviewOriginal !==
          activePlayerFitTag.missReviewParaphrased
          ? [activePlayerFitTag.missReviewOriginal]
          : []),
      ]
      : [];



  // ★ ヒートマップの色（FOR / NOT FOR とスコアで塗り分け）
  const getPlayerFitHeatColor = (tag: PlayerFitTag, step: number) => {
    const isFilled = step <= tag.score;
    if (!isFilled) return "bg-slate-800";

    if (tag.polarity === "positive") {
      if (tag.score >= 4) return "bg-emerald-400";
      if (tag.score === 3) return "bg-sky-400";
      return "bg-emerald-300";
    }

    // negative
    if (tag.score >= 4) return "bg-rose-500";
    if (tag.score === 3) return "bg-amber-400";
    return "bg-rose-400";
  };


  // ★ モバイルポップアップ内スワイプ検出用
  const [popupTouchStartX, setPopupTouchStartX] = useState<number | null>(null);
  const [popupTouchStartY, setPopupTouchStartY] = useState<number | null>(null);

  const handlePopupTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile || !showMobilePlayerDetail) return;
    if (e.touches.length === 0) return;

    const touch = e.touches[0];
    setPopupTouchStartX(touch.clientX);
    setPopupTouchStartY(touch.clientY);
  };

  const handlePopupTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile || !showMobilePlayerDetail) return;
    if (popupTouchStartX == null || popupTouchStartY == null) return;
    if (e.touches.length === 0) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - popupTouchStartX;
    const deltaY = touch.clientY - popupTouchStartY;

    // 縦方向の動きが大きいときは「スクロール」とみなして何もしない
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;

    const threshold = 50; // だいたい 50px 以上でスワイプと判定
    if (Math.abs(deltaX) < threshold) return;

    const currentIndex = allPlayerFitTags.findIndex(
      (t) => t.id === activePlayerFitId
    );
    if (currentIndex === -1) return;

    // 左スワイプ（指を左へ）→ 次のカード / 右スワイプ → 前のカード
    const direction = deltaX < 0 ? 1 : -1;
    const nextIndex = currentIndex + direction;

    if (nextIndex < 0 || nextIndex >= allPlayerFitTags.length) {
      // 範囲外なら何もしない（ただし連発防止のため基点だけ更新）
      setPopupTouchStartX(touch.clientX);
      setPopupTouchStartY(touch.clientY);
      return;
    }

    const nextTag = allPlayerFitTags[nextIndex];
    if (!nextTag) return;

    setActivePlayerFitId(nextTag.id);

    // 連続スワイプに対応するため、基点を更新
    setPopupTouchStartX(touch.clientX);
    setPopupTouchStartY(touch.clientY);

    // このジェスチャー分は下のスクロールに流さない
    e.preventDefault();
  };

  const handlePopupTouchEnd = () => {
    setPopupTouchStartX(null);
    setPopupTouchStartY(null);
  };


  const ScoreBar = ({ score }: { score: number }) => (
    <div className="flex items-center gap-1 mt-1">
      {SCORE_STEPS.map((step) => (
        <div
          key={step}
          className={`h-1.5 w-4 rounded-sm ${step <= score ? "bg-white" : "bg-white/20"
            }`}
        />
      ))}
    </div>
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


  // --- レビュー品質スコア（1〜10） ---
  const reviewQualityScore =
    typeof analysisData.reviewQualityScore === "number"
      ? analysisData.reviewQualityScore
      : null;

  // --- マッチ度スコア（0〜1）を抽出 ---
  const rawMoodScore =
    typeof (game as any).moodScore === "number"
      ? (game as any).moodScore
      : typeof (baseGame as any).moodScore === "number"
        ? (baseGame as any).moodScore
        : typeof (analysisData as any).moodScore === "number"
          ? (analysisData as any).moodScore
          : null;

  const normalizedMoodScore =
    typeof rawMoodScore === "number" && Number.isFinite(rawMoodScore)
      ? Math.max(0, Math.min(1, rawMoodScore))
      : null;

  // --- 統計ベースの隠れた名作度スコア（1〜10） ---
  const statGemScore =
    typeof analysisData.statGemScore === "number"
      ? analysisData.statGemScore
      : null;

  // GEM SCORE は「統計ベース」優先で、なければレビュー品質
  const aiGemScore = statGemScore ?? reviewQualityScore ?? null;

  // --- 表示用マッチ度％（0〜100） ---
  const rawMatchScoreForDisplay =
    normalizedMoodScore !== null
      ? normalizedMoodScore
      : aiGemScore !== null
        ? Math.max(0, Math.min(1, aiGemScore / 10))
        : null;

  const matchScorePercent =
    rawMatchScoreForDisplay !== null
      ? Math.round(rawMatchScoreForDisplay * 100)
      : null;

  // --- リスク系スコア ---
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
  // 英語表記 + 年 / 月日を分けて扱う
  let releaseYearString: string | null = null;
  let releaseMonthDayString: string | null = null;

  if (releaseDateValue) {
    const d = new Date(releaseDateValue);
    releaseYearString = String(d.getFullYear());
    releaseMonthDayString = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }); // 例: Feb 26
  } else if (releaseYearValue) {
    releaseYearString = String(releaseYearValue);
  }

  // 旧フォーマットが必要な箇所のために一応残しておく
  const formattedReleaseDate =
    releaseDateValue
      ? new Date(releaseDateValue).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
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

  // Tags to display under the title（game_rankings_cache.tags をそのまま使う）
  // サマリーには最大3件だけ出す
  const displayTags = getDisplayTags({ tags });

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
            <div className="relative w-full h-[260px] md:h-[320px] overflow-hidden rounded-b-[32px] border-x border-b border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.85)] bg-black">
              <img
                src={headerImageUrl}
                alt={title}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />

              {/* グラデオーバーレイ */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            </div>

            {/* 2枚目のグラデ（今のコードどおりでOK） */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          </div>
        </div>
      </div>


      {/* === Main Content ========================================= */}
      {/* Main Content ========================================= */}
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
        <div className="-mx-4 sm:mx-0">
          <Card className="mt-2 rounded-[28px] border border-b-0 border-white/10 bg-[radial-gradient(circle_at_top_left,_#31235f_0,_#151326_45%,_#050509_100%)] shadow-[0_24px_70px_rgba(0,0,0,0.85)]">
            <CardHeader className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-6 min-w-0">
                {/* タイトル */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      Hidden Gem Analyzer
                    </p>

                    {/* ★ Metacritic バッジをここに移動 */}
                    {reviewScoreDesc && (
                      <Badge
                        variant="outline"
                        className="inline-flex items-center gap-1 rounded-full border-amber-400/80 bg-amber-500/15 text-[11px] md:text-xs text-amber-50 px-3 py-1"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>{reviewScoreDesc}</span>
                      </Badge>
                    )}
                  </div>

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



                {/* Summary */}
                <Card
                  className="
    rounded-none border-0 bg-transparent shadow-none
    
  "
                >
                  <CardContent className="p-0">
                    <p className="text-sm md:text-base text-slate-200/90 leading-relaxed whitespace-pre-line">
                      {summary}
                    </p>
                  </CardContent>
                </Card>

                {/* Match Score（Overview の上に表示） */}
                {matchScorePercent !== null && (
                  <div className="flex justify-center mt-3 mb-1">
                    <div className="flex flex-col items-center justify-center rounded-full border-2 border-fuchsia-300/80 bg-black/80  w-20 h-20 md:w-24 md:h-24">
                      <span className="text-[10px] md:text-[11px] uppercase tracking-[0.18em] text-slate-200/90 mb-1">
                        Match
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl md:text-2xl font-extrabold bg-gradient-to-r from-fuchsia-400 via-fuchsia-200 to-cyan-300 bg-clip-text text-transparent">
                          {matchScorePercent}
                        </span>
                        <span className="text-xs text-slate-200">%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Player Fit: どんなプレイヤーに刺さるか／刺さらないか */}
                {(playerFitPositiveTags.length > 0 ||
                  playerFitNegativeTags.length > 0) && (
                    <Card
                      ref={playerMatchSectionRef}
                      className="rounded-[24px] border-none bg-transparent">
                      <CardHeader className="px-0 py-5 sm:px-6 sm:py-6">
                        <CardTitle className="text-xl">
                          Player Match
                        </CardTitle>
                        <p className="text-xs text-slate-400 mt-1">
                          プレイヤータイプごとの「このゲームとの相性」を色の濃淡とポップアップで可視化します。
                        </p>
                      </CardHeader>
                      <CardContent className="px-0">
                        {allPlayerFitTags.length === 0 ? (
                          <p className="text-[11px] text-slate-400">
                            まだ「どんなプレイヤーに刺さるか／刺さらないか」の傾向は十分に抽出されていません。
                          </p>
                        ) : (
                          <motion.div
                            initial={{ opacity: 0, y: 18 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ type: "spring", stiffness: 140, damping: 16 }}
                            viewport={{ once: true, amount: 0.2 }}
                            className="relative max-w-5xl mx-auto flex gap-4 md:gap-6 overflow-hidden"
                          >
                            {/* 左：プレイヤータイプカード一覧 */}
                            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-md">
                              {allPlayerFitTags.map((tag, index) => {
                                const isActive = activePlayerFitId === tag.id;

                                // モバイルは 2 カラムで最後の 2 枚を最終行とみなす
                                const isLastRow = index >= allPlayerFitTags.length - 2;
                                const bubblePositionClass = isLastRow
                                  ? "bottom-full mb-2"
                                  : "top-full mt-2";

                                return (
                                  <div key={tag.id} className="relative">
                                    <motion.button
                                      type="button"
                                      onClick={() => {
                                        setActivePlayerFitId(tag.id);
                                        if (isMobile) {
                                          setShowMobilePlayerDetail(true);
                                        }
                                      }}
                                      initial={{ opacity: 0, scale: 0.85, y: 14 }}
                                      whileInView={{ opacity: 1, scale: 1, y: 0 }}
                                      whileHover={{ scale: 1.05 }}
                                      animate={
                                        isActive
                                          ? {
                                            scale: [1, 1.03, 1],
                                            transition: { duration: 0.6, repeat: Infinity },
                                          }
                                          : {}
                                      }
                                      transition={{
                                        type: "spring",
                                        stiffness: 140,
                                        damping: 12,
                                        delay: index * 0.06,
                                      }}
                                      viewport={{ once: true, amount: 0.25 }}
                                      className={`relative rounded-2xl p-3 text-left shadow-lg/40 border border-white/5 overflow-hidden ${isActive
                                          ? "border-2 border-fuchsia-300/80 bg-fuchsia-500/10 shadow-[0_0_0_1px_rgba(236,72,153,0.45)]"
                                          : "border border-white/5 bg-slate-900/70"
                                        }`}

                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-lg">{tag.icon}</span>
                                        <span className="text-[13px] font-semibold leading-snug">
                                          {tag.label}
                                        </span>
                                      </div>

                                      <div className="flex gap-1 mb-1">
                                        {SCORE_STEPS.map((step) => (
                                          <div
                                            key={step}
                                            className={`h-1.5 flex-1 rounded-full ${getPlayerFitHeatColor(
                                              tag,
                                              step
                                            )}`}
                                          />
                                        ))}
                                      </div>

                                      {tag.sub && (
                                        <p className="mt-1 text-[11px] text-slate-200 mb-1 line-clamp-2">
                                          {tag.sub}
                                        </p>
                                      )}


                                      {/* うっすら光のグラデーション */}
                                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-emerald-500/10" />
                                    </motion.button>

                                    {/* ★ モバイル用：カードの近くにふきだし表示（既存挙動を維持） */}
                                    {isMobile && showMobilePlayerDetail && isActive && (
                                      <motion.div
                                        initial={{ x: "100%", opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        exit={{ x: "100%", opacity: 0 }}
                                        transition={{ type: "spring", stiffness: 240, damping: 24 }}
                                        className="fixed inset-0 z-40 flex items-center justify-center px-4"
                                        onTouchStart={handlePopupTouchStart}
                                        onTouchMove={handlePopupTouchMove}
                                        onTouchEnd={handlePopupTouchEnd}
                                      >
                                        {/* 背景の暗幕（タップ or スワイプで閉じる） */}
                                        <div
                                          className="absolute inset-0"
                                          onClick={() => setShowMobilePlayerDetail(false)}
                                          onTouchStart={handleRightSlideOverlayTouchStart}
                                          onTouchMove={handleRightSlideOverlayTouchMove}
                                          onTouchEnd={handleRightSlideOverlayTouchEnd}
                                        />

                                        {/* 右からスライドインするパネル本体 */}
                                        {/* 右スライド詳細パネル（Pattern A ミニマル） */}
                                        <div className="relative z-10 w-full flex justify-center">
                                          <div
                                            className="
        w-[min(100vw-40px,380px)]
        max-h-[70vh]
        rounded-2xl
        border border-slate-700
        bg-slate-900/95
        shadow-lg
        px-5 py-5
        text-[12px]
        text-slate-50
        overflow-y-auto
      "
                                          >

                                            {/* ヘッダー（タイトルのみ） */}
                                            <div className="flex items-center gap-3 mb-4">
                                              <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-xl">
                                                <span>{tag.icon}</span>
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="text-[11px] uppercase tracking-widest text-slate-400">
                                                  DETAIL
                                                </div>
                                                <div className="font-semibold text-[15px] leading-snug line-clamp-2">
                                                  {tag.label}
                                                </div>

                                                {/* Match スコア（控えめ） */}
                                                <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-2">
                                                  <span className="font-semibold text-slate-200">
                                                    Match {tag.score} / 5
                                                  </span>
                                                </div>
                                              </div>
                                            </div>


                                            {/* 仕切り線：サイトメイングラデと揃えた細いライン */}
                                            <div className="h-[1px] bg-gradient-to-r from-fuchsia-400/40 to-violet-300/40 mb-3" />


                                            {/* 本文：サマリ + 理由 */}
                                            {tag.sub && (
                                              <p className="text-[15px] text-slate-300 leading-relaxed mb-2">
                                                {tag.sub}
                                              </p>
                                            )}

                                            {tag.reason && (
                                              <p className="text-[14px] text-slate-100 leading-relaxed mb-2 whitespace-pre-line">
                                                {tag.reason}
                                              </p>
                                            )}


                                            {/* 代表レビュー（モバイル） */}
                                            {(() => {
                                              const positiveReviews =
                                                tag.polarity === "positive"
                                                  ? [
                                                    ...(tag.hitReviewParaphrased
                                                      ? [tag.hitReviewParaphrased]
                                                      : []),
                                                    ...(tag.hitReviewOriginal &&
                                                      tag.hitReviewOriginal !==
                                                      tag.hitReviewParaphrased
                                                      ? [tag.hitReviewOriginal]
                                                      : []),
                                                  ]
                                                  : [];
                                              const negativeReviews =
                                                tag.polarity === "negative"
                                                  ? [
                                                    ...(tag.missReviewParaphrased
                                                      ? [tag.missReviewParaphrased]
                                                      : []),
                                                    ...(tag.missReviewOriginal &&
                                                      tag.missReviewOriginal !==
                                                      tag.missReviewParaphrased
                                                      ? [tag.missReviewOriginal]
                                                      : []),
                                                  ]
                                                  : [];

                                              if (
                                                positiveReviews.length === 0 &&
                                                negativeReviews.length === 0
                                              ) {
                                                return null;
                                              }

                                              return (
                                                <div className="mt-1 space-y-2 border-t border-slate-700/80 pt-2">
                                                  {/* ポジティブタイプ → 刺さった理由だけ */}
                                                  {tag.polarity === "positive" &&
                                                    positiveReviews.length > 0 && (
                                                      <div>
                                                        <div className="text-[16px] font-semibold text-emerald-300/90 mb-3">
                                                          刺さった理由（代表的なレビュー）
                                                        </div>
                                                        {positiveReviews.map(
                                                          (text, idx) => (
                                                            <p
                                                              key={idx}
                                                              className="text-[14px] text-slate-100/90 leading-relaxed mb-1"
                                                            >
                                                              {text}
                                                            </p>
                                                          )
                                                        )}
                                                      </div>
                                                    )}

                                                  {/* ネガティブタイプ → 刺さらなかった理由だけ */}
                                                  {tag.polarity === "negative" &&
                                                    negativeReviews.length > 0 && (
                                                      <div>
                                                        <div className="text-[16px] font-semibold text-rose-300/90 mt-1 mb-3">
                                                          刺さらなかった理由（代表的なレビュー）
                                                        </div>
                                                        {negativeReviews.map(
                                                          (text, idx) => (
                                                            <p
                                                              key={idx}
                                                              className="text-[14px] text-slate-100/90 leading-relaxed mb-1"
                                                            >
                                                              {text}
                                                            </p>
                                                          )
                                                        )}
                                                      </div>
                                                    )}
                                                </div>
                                              );
                                            })()}

                                            {/* 下部ナビゲーション：← 閉じる → */}
                                            <div className="mt-4 flex items-center justify-center gap-4">
                                              {/* ← 前へ */}
                                              <button
                                                type="button"
                                                disabled={index === 0}
                                                onClick={() => {
                                                  const prev = allPlayerFitTags[index - 1];
                                                  if (prev) {
                                                    setActivePlayerFitId(prev.id);
                                                  }
                                                }}
                                                className="p-2 rounded-full border border-slate-600 text-slate-200 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-800/60 transition"
                                              >
                                                <ArrowLeft className="w-5 h-5" />
                                              </button>

                                              {/* 閉じる */}
                                              <button
                                                type="button"
                                                onClick={() => setShowMobilePlayerDetail(false)}
                                                className="px-4 py-1.5 rounded-full border border-slate-600 text-[11px] text-slate-200 hover:bg-slate-800/60 transition"
                                              >
                                                閉じる
                                              </button>

                                              {/* → 次へ */}
                                              <button
                                                type="button"
                                                disabled={index === allPlayerFitTags.length - 1}
                                                onClick={() => {
                                                  const next = allPlayerFitTags[index + 1];
                                                  if (next) {
                                                    setActivePlayerFitId(next.id);
                                                  }
                                                }}
                                                className="p-2 rounded-full border border-slate-600 text-slate-200 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-800/60 transition"
                                              >
                                                <ArrowRight className="w-5 h-5" />
                                              </button>
                                            </div>

                                          </div>
                                        </div>

                                      </motion.div>
                                    )}


                                  </div>
                                );
                              })}
                            </div>

                            {/* === Pattern C: 右スライド詳細パネル（PC / タブレット用） === */}
                            {!isMobile && activePlayerFitTag && (
                              <>
                                {/* 右側のグラデーションオーバーレイ */}
                                <div className="pointer-events-none absolute inset-y-0 right-0 w-full md:w-[44%] bg-gradient-to-l from-slate-950 via-slate-900/95 to-transparent" />

                                {/* 右からスッと出てくる詳細パネル */}
                                <div className="pointer-events-none absolute top-0 right-0 h-full w-full md:w-[42%] flex items-center justify-end pr-2 md:pr-4">
                                  <motion.div
                                    key={activePlayerFitTag.id}
                                    initial={{ x: 40, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 180, damping: 20 }}
                                    className="pointer-events-auto w-full md:w-[320px] rounded-2xl bg-slate-950/95 border border-emerald-400/50 shadow-[0_0_40px_rgba(16,185,129,0.5)] px-4 py-4 text-xs space-y-2"
                                  >
                                    <div className="flex items-start gap-2">
                                      <div className="h-9 w-9 rounded-xl bg-emerald-500/20 border border-emerald-300/70 flex items-center justify-center text-lg">
                                        {activePlayerFitTag.icon}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-300/90 mb-1">
                                          DETAIL
                                        </div>
                                        <div className="font-semibold text-sm text-emerald-100 mb-0.5 truncate">
                                          {activePlayerFitTag.label}
                                        </div>
                                        <div className="flex items-center gap-1 text-[11px] text-emerald-200">
                                          <span>Match {activePlayerFitTag.score} / 5</span>
                                          <span className="text-emerald-300/70">
                                            {"● ".repeat(Math.max(0, activePlayerFitTag.score - 1))}
                                            {activePlayerFitTag.score > 0 ? "◐" : ""}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {activePlayerFitTag.sub && (
                                      <p className="text-[11px] text-slate-200 leading-relaxed">
                                        {activePlayerFitTag.sub}
                                      </p>
                                    )}

                                    <p className="text-[11px] text-slate-100 leading-relaxed">
                                      {activePlayerFitTag.reason}
                                    </p>

                                    {(activePositiveReviews.length > 0 ||
                                      activeNegativeReviews.length > 0) && (
                                        <div className="mt-3 space-y-2 border-t border-emerald-500/20 pt-2">
                                          {/* ポジティブタイプ → 刺さった理由だけ */}
                                          {activePlayerFitTag?.polarity === "positive" &&
                                            activePositiveReviews.length > 0 && (
                                              <div>
                                                <div className="text-[10px] font-semibold text-emerald-300/90 mb-0.5">
                                                  刺さった理由（代表的なレビュー）
                                                </div>
                                                {activePositiveReviews.map((text, idx) => (
                                                  <p
                                                    key={idx}
                                                    className="text-[11px] text-slate-100/90 leading-relaxed mb-1"
                                                  >
                                                    {text}
                                                  </p>
                                                ))}
                                              </div>
                                            )}

                                          {/* ネガティブタイプ → 刺さらなかった理由だけ */}
                                          {activePlayerFitTag?.polarity === "negative" &&
                                            activeNegativeReviews.length > 0 && (
                                              <div>
                                                <div className="text-[10px] font-semibold text-rose-300/90 mb-0.5">
                                                  刺さらなかった理由（代表的なレビュー）
                                                </div>
                                                {activeNegativeReviews.map((text, idx) => (
                                                  <p
                                                    key={idx}
                                                    className="text-[11px] text-slate-100/90 leading-relaxed mb-1"
                                                  >
                                                    {text}
                                                  </p>
                                                ))}
                                              </div>
                                            )}
                                        </div>
                                      )}

                                  </motion.div>
                                </div>
                              </>
                            )}
                          </motion.div>
                        )}
                      </CardContent>
                    </Card>
                  )}

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

              </div>

            </CardHeader>
          </Card>
        </div>

        {/* 中段：Tags セクション（Overview 内で独立カード風） */}
        {displayTags.length > 0 && (
          <div className="mt-2 px-3 py-3">
            <div className="text-[11px] font-semibold text-slate-100 mb-2">
              Tags
            </div>
            <div className="flex flex-wrap gap-2">
              {displayTags.map((tag, idx) => (
                <Badge
                  key={`${tag}-${idx}`}
                  variant="secondary"
                  className="rounded-full bg-[#121225] border border-white/15 text-[12px] md:text-sm font-medium px-3.5 py-1.5"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}


        {/* Pros & Cons */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="rounded-[24px] border-emerald-500/30 bg-[#041510]/95 shadow-lg">
            <CardHeader className="px-4 py-5 sm:px-6 sm:py-6">
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


        {/* Key Insights */}
        <Card className="rounded-[24px] border border-white/10 bg-[#070716]/95 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Key Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* AIラベル（今まで通り） */}
            {labels.length > 0 ? (
              <div>
                <p className="text-[11px] text-slate-400 mb-1">
                  Review-based key phrases
                </p>
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
              </div>
            ) : (
              <p className="text-sm text-slate-300/80">
                まだ特徴的なキーワードは抽出されていません。
              </p>
            )}

            {/* 全タグ一覧（ここに tags を移す） */}
            {tags.length > 0 && (
              <div>
                <p className="text-[11px] text-slate-400 mb-1">
                  AI tags (Steam-like categories)
                </p>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, idx) => (
                    <Badge
                      key={`${tag}-${idx}`}
                      variant="outline"
                      className="rounded-full border-white/15 bg-[#050512] text-[11px] px-3 py-1"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
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
