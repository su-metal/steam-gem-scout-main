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
  // 追加: 「今と昔」系の情報
  currentStateSummary?: string;
  historicalIssuesSummary?: string;
  stabilityTrend?: "Improving" | "Stable" | "Deteriorating" | "Unknown";
  hasImprovedSinceLaunch?: boolean;
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
  };
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

  // Steam 側の最新情報で上書きするための state
  const [liveGameData, setLiveGameData] = useState<GameData | null>(null);
  const [isLoadingSteam, setIsLoadingSteam] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const game = location.state as GameDetailState;

  // ★ これを追加
  useEffect(() => {
    console.log("GameDetail location.state =", location.state);
    console.log("GameDetail game =", game);
  }, [location.state, game]);

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
      analysis: game.analysisData as GameData["analysis"],
    } as GameData);

  // Steam から取得した最新情報があれば優先する
  const baseGame = liveGameData ?? gameData;

  const analysisData: AnalysisData =
    game.analysisData ||
    gameData.analysis ||
    {
      hiddenGemVerdict:
        game.hiddenGemVerdict as AnalysisData["hiddenGemVerdict"],
      summary: game.summary,
      labels: game.labels,
      pros: game.pros,
      cons: game.cons,
      riskScore: game.riskScore,
      bugRisk: game.bugRisk,
      refundMentions: game.refundMentions,
      reviewQualityScore: game.reviewQualityScore,
      // レガシーからも「今と昔」の情報を引き継げる
      currentStateSummary: game.currentStateSummary,
      historicalIssuesSummary: game.historicalIssuesSummary,
      stabilityTrend: game.stabilityTrend as AnalysisData["stabilityTrend"],
      hasImprovedSinceLaunch: game.hasImprovedSinceLaunch,
    };

  // Steam キャッシュ Edge Function から最新メタ情報を取得
  useEffect(() => {
    const fetchSteamData = async () => {
      const effectiveAppId = baseGame.appId || game.appId || 0;
      if (!effectiveAppId) return;

      try {
        setIsLoadingSteam(true);

        const { data, error } = await supabase.functions.invoke(
          "get-or-create-steam-game",
          {
            body: { appId: effectiveAppId },
          }
        );

        if (error) {
          console.error("get-or-create-steam-game error", error);
          return;
        }

        if (data) {
          setLiveGameData((prev) => ({
            ...(prev ?? gameData),
            appId: data.app_id ?? effectiveAppId,
            title: data.title ?? gameData.title ?? "Unknown Game",
            positiveRatio: data.positive_ratio ?? gameData.positiveRatio,
            totalReviews: data.total_reviews ?? gameData.totalReviews,
            estimatedOwners:
              data.estimated_owners ?? gameData.estimatedOwners,
            price: data.price ?? gameData.price,
            averagePlaytime:
              data.average_playtime ?? gameData.averagePlaytime,
            tags: data.tags ?? gameData.tags,
            steamUrl: data.steam_url ?? gameData.steamUrl,
            reviewScoreDesc:
              data.review_score_desc ?? gameData.reviewScoreDesc,
            gemLabel: gameData.gemLabel,
            analysis: gameData.analysis,
          }));
        }
      } catch (e) {
        console.error("get-or-create-steam-game exception", e);
      } finally {
        setIsLoadingSteam(false);
      }
    };

    fetchSteamData();
  }, [baseGame.appId, game.appId]);

  // Safe fallback arrays for fields that may be undefined
  const pros = Array.isArray(analysisData.pros) ? analysisData.pros : [];
  const cons = Array.isArray(analysisData.cons) ? analysisData.cons : [];
  const labels = Array.isArray(analysisData.labels) ? analysisData.labels : [];

  // Safe values with defaults
  const title = baseGame.title || "Unknown Game";
  const summary =
    analysisData.summary ||
    "レビューが少ないか、まだ十分な情報がないため、AIによる要約は生成されていません。";

  const hiddenGemVerdict = analysisData.hiddenGemVerdict ?? "Unknown";

  // 「今と昔」のテキスト
  const currentStateSummary = analysisData.currentStateSummary;
  const historicalIssuesSummary = analysisData.historicalIssuesSummary;
  const stabilityTrend = analysisData.stabilityTrend;
  const hasImprovedSinceLaunch = analysisData.hasImprovedSinceLaunch;

  // 数値スコアは「number なら採用、それ以外は null（N/A）」にする
  const reviewQualityScore =
    typeof analysisData.reviewQualityScore === "number"
      ? analysisData.reviewQualityScore
      : null;

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

  const isFree = price === 0;
  const normalizedPrice =
    typeof price === "number" && Number.isFinite(price) ? price : 0;
  const priceDisplay =
    normalizedPrice === 0 ? "Free" : `$${normalizedPrice.toFixed(2)}`;
  const positiveRatioDisplay = Math.round(positiveRatio);

  const effectiveAppId = baseGame.appId || game.appId || 0;
  const appIdStr = String(effectiveAppId);
  const headerImageUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;

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

  const getQualityColor = (score: number | null) => {
    const value = score ?? 0;
    if (value >= 7) return "text-success";
    if (value >= 4) return "text-warning";
    return "text-destructive";
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

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Navigation */}
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          {isLoadingSteam && (
            <span className="text-xs text-muted-foreground">
              Steam から最新のメタ情報を取得中…
            </span>
          )}
        </div>

        {/* Steam Header Image */}
        <Card className="overflow-hidden border-primary/20">
          <img
            src={headerImageUrl}
            alt={title}
            loading="lazy"
            className="w-full max-h-[320px] object-cover"
            onError={(e) => {
              // Hide the image if it fails to load
              e.currentTarget.style.display = "none";
            }}
          />
        </Card>

        {/* Title & Hero Section */}
        <Card className="bg-gradient-to-r from-card/80 to-secondary/50 border-primary/20">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="flex-1 space-y-2">
                <CardTitle className="text-3xl md:text-4xl">{title}</CardTitle>

                {/* 安定度ステータスバッジ（今と昔） */}
                {stabilityBadge && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className={`text-xs font-semibold border ${stabilityBadge.className}`}
                    >
                      {stabilityBadge.label}
                    </Badge>
                    {stabilityBadge.description && (
                      <span className="text-xs text-muted-foreground">
                        {stabilityBadge.description}
                      </span>
                    )}
                  </div>
                )}

                {reviewScoreDesc && (
                  <p className="text-muted-foreground">{reviewScoreDesc}</p>
                )}

                {displayTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {displayTags.map((tag, idx) => (
                      <Badge key={`${tag}-${idx}`} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-center bg-background/50 p-6 rounded-lg border border-primary/30">
                <div className="text-sm text-muted-foreground mb-2">
                  AI Gem Score
                </div>
                <div className="flex items-baseline justify-center gap-1 mb-2">
                  <span className="text-5xl font-bold text-primary">
                    {reviewQualityScore !== null
                      ? reviewQualityScore.toFixed(1)
                      : "N/A"}
                  </span>
                  <span className="text-2xl text-muted-foreground">/10</span>
                </div>

                {/* バックエンドで判定した gemLabel を表示 */}
                {gemLabel && (
                  <div className="flex items-center justify-center gap-2 mb-1">
                    {gemLabel === "Hidden Gem" ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : gemLabel === "Highly rated but not hidden" ? (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    ) : (
                      <XCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span className="font-semibold">{gemLabel}</span>
                  </div>
                )}

                {/* AI の hiddenGemVerdict を補足コメントとして表示 */}
                <p className="text-xs text-muted-foreground mt-1">
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
          </CardHeader>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Analysis Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
              {summary}
            </p>
          </CardContent>
        </Card>

        {/* 「今」と「昔」を分けて表示 */}
        {(currentStateSummary || historicalIssuesSummary) && (
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  現在の状態（Current state）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {currentStateSummary ||
                    "最近のレビュー傾向についての詳細な分析はまだ十分ではありません。"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  過去の問題・初期評価（Historical issues）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {historicalIssuesSummary ||
                    "リリース初期の問題点や評価の推移についての情報はまだ十分ではありません。"}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Key Insights */}
        <Card>
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
                    className="text-sm py-1.5"
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                まだ特徴的なキーワードは抽出されていません。
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pros & Cons */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-success/20">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2 text-success">
                <ThumbsUp className="w-5 h-5" />
                Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pros.length > 0 ? (
                <ul className="space-y-3">
                  {pros.map((pro, idx) => (
                    <li key={idx} className="flex gap-3 text-sm">
                      <span className="text-success mt-0.5">●</span>
                      <span className="text-muted-foreground">{pro}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  レビューから特徴的な「良い点」はまだ抽出されていません。
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2 text-destructive">
                <ThumbsDown className="w-5 h-5" />
                Weaknesses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cons.length > 0 ? (
                <ul className="space-y-3">
                  {cons.map((con, idx) => (
                    <li key={idx} className="flex gap-3 text-sm">
                      <span className="text-destructive mt-0.5">●</span>
                      <span className="text-muted-foreground">{con}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  目立った「弱点」についてのレビューはまだ少ないようです。
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Metrics & Scores */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Quality & Risk Scores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">
                Quality & Risk Assessment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Review Quality</span>
                  <span
                    className={`font-semibold ${getQualityColor(
                      reviewQualityScore
                    )}`}
                  >
                    {reviewQualityScore !== null
                      ? `${reviewQualityScore}/10`
                      : "N/A"}
                  </span>
                </div>
                <Progress
                  value={(reviewQualityScore ?? 0) * 10}
                  className="h-2.5"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Bug Risk</span>
                  <span className={`font-semibold ${getScoreColor(bugRisk)}`}>
                    {bugRisk !== null ? `${bugRisk}/10` : "N/A"}
                  </span>
                </div>
                <Progress value={(bugRisk ?? 0) * 10} className="h-2.5" />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Refund Mentions</span>
                  <span
                    className={`font-semibold ${getScoreColor(
                      refundMentions
                    )}`}
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
                  <span>Overall Risk</span>
                  <span className={`font-semibold ${getScoreColor(riskScore)}`}>
                    {riskScore !== null ? `${riskScore}/10` : "N/A"}
                  </span>
                </div>
                <Progress value={(riskScore ?? 0) * 10} className="h-2.5" />
              </div>
            </CardContent>
          </Card>

          {/* Game Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Game Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">
                    Positive Reviews
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {positiveRatioDisplay}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">
                    Total Reviews
                  </div>
                  <div className="text-2xl font-bold">
                    {totalReviews.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">
                    Price
                  </div>
                  <div className="text-2xl font-bold text-success">
                    {priceDisplay}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground mb-1">
                    Avg Playtime
                  </div>
                  <div className="text-2xl font-bold">
                    {averagePlaytimeHours !== "N/A" ? `${averagePlaytimeHours}h` : "N/A"}
                  </div>
                </div>
              </div>
              <div className="pt-2">
                <div className="text-sm text-muted-foreground mb-1">
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
          <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30">
            <CardContent className="py-8 text-center">
              <Button
                asChild
                size="lg"
                className="bg-primary hover:bg-primary/90"
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
