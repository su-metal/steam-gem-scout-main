import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Heart, Sparkles, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWishlist } from "@/hooks/useWishlist";

// Returns the tags that should be displayed on the card.
// Priority: analysis.labels (AI labels) -> fallback to raw tags.
const getDisplayTags = (game: { analysis?: { labels?: string[] }; tags?: string[] }, limit?: number): string[] => {
  const baseTags =
    (game.analysis?.labels && game.analysis.labels.length > 0 ? game.analysis.labels : (game.tags ?? [])) || [];

  if (!limit || baseTags.length <= limit) {
    return baseTags;
  }

  return baseTags.slice(0, limit);
};



// gemLabel のバリエーション
type GemLabel =
  | "Hidden Gem"
  | "Improved Hidden Gem"
  | "Emerging Gem"
  | "Highly rated but not hidden"
  | "Not a hidden gem";

interface GameCardProps {
  title: string;
  hiddenGemScore: number;
  summary: string;
  labels: string[];
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  price: number;
  averagePlaytime: number;
  appId: number | string;
  gameData?: any;
  analysisData?: any;

  /** featured: larger cards for the top 3 games on the Home page */
  variant?: "default" | "featured";
  /** 発売日情報（バックエンドから渡す） */
  releaseDate?: string | null;
  releaseYear?: number | null;

  /** 0〜5 のレビュー深度スコア（任意） */
  reviewDepthScore?: number;

  // Legacy props for backward compatibility
  hiddenGemVerdict?: string;
  pros?: string[];
  cons?: string[];
  riskScore?: number;
  bugRisk?: number;
  refundMentions?: number;
  reviewScoreDesc?: number;
  tags?: string[];
  steamUrl?: string;
  // Use a different name to avoid conflicts with existing reviewScoreDesc
  reviewScoreDescText?: string;

  // 追加: 明示的に gemLabel を渡す場合用（オプショナル）
  gemLabel?: GemLabel;
  screenshots?: {
    full?: string;
    thumbnail?: string;
  }[];
  /** DB から渡ってくるカバー画像 URL（game_rankings_cache.data.headerImage） */
  headerImage?: string | null;
}


export const GameCard = ({
  title,
  hiddenGemScore,
  summary,
  labels,
  positiveRatio,
  totalReviews,
  estimatedOwners,
  price,
  averagePlaytime,
  appId,
  gameData,
  analysisData,
  hiddenGemVerdict,
  pros,
  cons,
  riskScore,
  bugRisk,
  refundMentions,
  reviewScoreDesc,
  tags,
  steamUrl,
  variant = "default",
  gemLabel,
  releaseDate,
  releaseYear,
  screenshots,
  headerImage,
}: GameCardProps) => {
  const navigate = useNavigate();
  const isFeatured = variant === "featured";

  const appIdStr = String(appId);
  const { isWished, toggle } = useWishlist();
  const isInWishlist = isWished(appIdStr);

  // フォールバック用（従来の appId ベース header.jpg）
  const fallbackHeaderImageUrl =
    `https://cdn.akamai.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;

  // gameData 経由 or props 経由で来る headerImage を優先
  const explicitHeaderImage =
    (gameData as any)?.headerImage ??
    (headerImage && headerImage.trim() !== "" ? headerImage : null);

  const effectiveImageUrl =
    explicitHeaderImage && explicitHeaderImage.trim() !== ""
      ? explicitHeaderImage
      : fallbackHeaderImageUrl;

  const safeSummary =
    summary || "AI could not generate a summary for this title, but it looks like a promising hidden gem.";

  // Unify which tags are displayed on the card:
  // - Prefer full gameData if provided (it usually contains analysis + tags)
  // - Otherwise reconstruct a minimal object from labels / tags props
  const tagSource = gameData ?? {
    analysis: analysisData ?? (labels && labels.length > 0 ? { labels } : undefined),
    tags,
  };

  const displayTags = getDisplayTags(tagSource);

  // 価格の正規化
  const normalizedPrice =
    typeof price === "number" && Number.isFinite(price) ? price : 0;
  const isFree = normalizedPrice === 0;
  const priceDisplay = isFree ? "Free" : `$${normalizedPrice.toFixed(2)}`;

  // 発売日の表示用（releaseDate を優先、なければ releaseYear だけ表示）
  const formattedReleaseDate =
    releaseDate
      ? new Date(releaseDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
      : releaseYear
        ? String(releaseYear)
        : null;


  // --- AI / gemLabel 情報を抽出 ---
  const ai = analysisData || gameData?.analysis || {};

  // 統計ベースの AI Gem Score と旧AIスコアを、analysisData / gameData の両方から安全に拾う
  const statGemScoreFromAnalysis =
    typeof analysisData?.statGemScore === "number"
      ? analysisData.statGemScore
      : null;

  const statGemScoreFromGameData =
    typeof gameData?.analysis?.statGemScore === "number"
      ? gameData.analysis.statGemScore
      : null;

  const statGemScore: number | null =
    statGemScoreFromAnalysis ??
    statGemScoreFromGameData ??
    (Number.isFinite(hiddenGemScore) ? hiddenGemScore : null);


  const reviewQualityFromAnalysis =
    typeof analysisData?.reviewQualityScore === "number"
      ? analysisData.reviewQualityScore
      : null;

  const reviewQualityFromGameData =
    typeof gameData?.analysis?.reviewQualityScore === "number"
      ? gameData.analysis.reviewQualityScore
      : null;

  const reviewQualityScore: number | null =
    reviewQualityFromAnalysis ?? reviewQualityFromGameData ?? null;


  // バックエンドのシグナルも使って gemLabel を補完する
  const explicitGemLabel: GemLabel | undefined =
    gemLabel ??
    (gameData?.gemLabel as GemLabel | undefined) ??
    (analysisData?.gemLabel as GemLabel | undefined) ??
    (ai.gemLabel as GemLabel | undefined);

  // AI 判定値を取得（Index.tsx と同じ考え方に揃える）
  const aiVerdict: "Yes" | "No" | "Unknown" =
    ai.hiddenGemVerdict ?? hiddenGemVerdict ?? "Unknown";

  const isStatisticallyHidden: boolean =
    ai.isStatisticallyHidden === true || gameData?.isStatisticallyHidden === true;

  const qualifiesAsHiddenGem: boolean =
    isStatisticallyHidden ||
    aiVerdict === "Yes" ||
    (statGemScore !== null && statGemScore >= 8);

  const derivedGemLabel: GemLabel | undefined =
    explicitGemLabel ??
    (qualifiesAsHiddenGem ? "Hidden Gem" : undefined);

  // gemLabel バッジの見た目設定
  let gemBadgeText: string | null = null;

  let gemBadgeClass =
    "bg-muted text-muted-foreground border border-border/40";
  let GemIcon: any = null;

  if (derivedGemLabel) {
    switch (derivedGemLabel) {
      case "Hidden Gem":
        gemBadgeText = "Hidden Gem";
        gemBadgeClass =
          "bg-primary/10 text-primary border border-primary/40";
        GemIcon = Sparkles;
        break;
      case "Improved Hidden Gem":
        gemBadgeText = "復活した Hidden Gem";
        gemBadgeClass =
          "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40";
        GemIcon = TrendingUp;
        break;
      case "Emerging Gem":
        gemBadgeText = "Emerging Gem";
        gemBadgeClass =
          "bg-indigo-500/15 text-indigo-200 border border-indigo-500/40";
        GemIcon = Sparkles;
        break;
      case "Highly rated but not hidden":
        gemBadgeText = "Highly rated";
        gemBadgeClass =
          "bg-slate-500/15 text-slate-200 border border-slate-500/40";
        GemIcon = null;
        break;
      case "Not a hidden gem":
        gemBadgeText = "Not a hidden gem";
        gemBadgeClass =
          "bg-muted text-muted-foreground border border-border/60";
        GemIcon = null;
        break;
      default:
        break;
    }
  }

  // --- AI 情報の抽出（SearchResultCard と同じロジック） ---

  const positiveDisplay = Number.isFinite(positiveRatio)
    ? Math.round(positiveRatio)
    : 0;

  const verdict: "Yes" | "No" | "Unknown" =
    ai.hiddenGemVerdict ?? hiddenGemVerdict ?? "Unknown";

  const combinedRiskScore =
    typeof ai.riskScore === "number"
      ? ai.riskScore
      : typeof riskScore === "number"
        ? riskScore
        : null;

  const riskLevel =
    combinedRiskScore == null
      ? null
      : combinedRiskScore <= 3
        ? "Low"
        : combinedRiskScore <= 6
          ? "Medium"
          : "High";




  //  1. statGemScore（統計ベースの隠れた名作度）
  //  2. reviewQualityScore（旧AIスコア：statGemScore が無い古いデータ用）
  const aiGemScore: number | null =
    statGemScore !== null
      ? statGemScore
      : reviewQualityScore !== null
        ? reviewQualityScore
        : null;


  const gemScoreCircleClass =
    aiGemScore === null
      ? "bg-muted text-muted-foreground"
      : aiGemScore >= 8
        ? "bg-emerald-500 text-emerald-50"
        : aiGemScore >= 6
          ? "bg-yellow-500 text-yellow-900"
          : "bg-red-500 text-red-50";

  const aiRecommendsLabel =
    verdict === "Yes"
      ? "AI strongly recommends this title."
      : verdict === "Unknown"
        ? "AI is cautiously positive based on limited data."
        : verdict === "No"
          ? "AI does not recommend this title."
          : null;


  const handleViewDetails = () => {
     // GameDetail 側で使うための headerImage（さっき計算した explicitHeaderImage を再利用してもOK）
    const headerForDetail =
      explicitHeaderImage && explicitHeaderImage.trim() !== ""
        ? explicitHeaderImage
        : undefined;
    navigate(`/game/${appId}`, {
      state:
        gameData && analysisData
          ? {
            gameData,
            analysisData,
          }
          : {
            appId,
            title,
            hiddenGemVerdict,
            gemLabel: derivedGemLabel,
            summary,
            labels,
            pros,
            cons,
            riskScore,
            bugRisk,
            refundMentions,
            reviewScoreDesc,
            positiveRatio,
            totalReviews,
            estimatedOwners,
            price,
            averagePlaytime,
            tags,
            steamUrl,
            screenshots,
            headerImage: headerForDetail,
          },
    });
  };

  return (
    <Card
      className="relative bg-card/50 border-primary/20 hover:border-primary/40 transition-all hover:bg-card/70 cursor-pointer overflow-hidden rounded-lg shadow-sm hover:shadow-md"
      onClick={handleViewDetails}
    >
      {/* Wishlist heart button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle(appIdStr);
        }}
        className="absolute top-3 right-3 rounded-full p-2 bg-background/80 hover:bg-background shadow-sm border border-border/50"
        aria-label={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
      >
        <Heart
          className={`w-4 h-4 ${isInWishlist
            ? "fill-red-500 text-red-500"
            : "text-muted-foreground"
            }`}
        />
      </button>

      <div className="flex flex-col sm:flex-row gap-4 p-4">
        {/* Left: Header Image */}
        <div className="flex-shrink-0">
          <img
            src={effectiveImageUrl}
            alt={title}
            loading="lazy"
            className="w-full sm:w-40 h-24 sm:h-auto object-cover rounded"
          />
        </div>

        {/* Middle: Title, Release, Summary, Tags, AI Verdict/Risk */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg line-clamp-2">{title}</h3>

            {/* gemLabel バッジ */}
            {gemBadgeText && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${gemBadgeClass}`}
              >
                {GemIcon && <GemIcon className="w-3 h-3" />}
                <span className="leading-none">{gemBadgeText}</span>
              </span>
            )}
          </div>

          {formattedReleaseDate && (
            <p className="text-[11px] text-muted-foreground">
              Release: {formattedReleaseDate}
            </p>
          )}

          <p className="text-sm text-muted-foreground line-clamp-2">
            {safeSummary}
          </p>

          {displayTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {displayTags.map((label, i) => (
                <Badge
                  key={`${label}-${i}`}
                  variant="secondary"
                  className="text-xs px-2 py-0.5 rounded-full"
                >
                  {label}
                </Badge>
              ))}
            </div>
          )}

          {/* AI Verdict & Risk badges */}
          <div className="flex flex-wrap gap-1 mt-1">
            {/* Verdict Badge */}
            <Badge
              variant="outline"
              className={`text-[10px] px-2 py-0.5 rounded-full ${verdict === "Yes"
                ? "border-green-500 text-green-400"
                : verdict === "Unknown"
                  ? "border-yellow-500 text-yellow-400"
                  : "border-red-500 text-red-400"
                }`}
            >
              AI: {verdict}
            </Badge>

            {/* Risk Level Badge */}
            {riskLevel && (
              <Badge
                variant="outline"
                className={`text-[10px] px-2 py-0.5 rounded-full ${riskLevel === "Low"
                  ? "border-green-500 text-green-400"
                  : riskLevel === "Medium"
                    ? "border-yellow-500 text-yellow-400"
                    : "border-red-500 text-red-400"
                  }`}
              >
                Risk: {riskLevel}
              </Badge>
            )}
          </div>
        </div>

        {/* Right: Gem Score + Stats */}
        <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 flex-shrink-0">
          <div className="flex flex-col items-center">
            <div
              className={`rounded-full w-12 h-12 flex items-center justify-center text-lg font-bold shadow-lg border ${gemScoreCircleClass}`}
            >
              {aiGemScore !== null ? aiGemScore.toFixed(1) : "N/A"}
            </div>
            <span className="text-[10px] mt-0.5 text-muted-foreground">
              AI Gem Score
            </span>
          </div>

          {aiRecommendsLabel && (
            <p className="text-[10px] text-muted-foreground text-right">
              {aiRecommendsLabel}
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-1 gap-2 text-xs text-right">
            <div>
              <div className="text-muted-foreground">Positive</div>
              <div className="font-semibold text-primary">
                {positiveDisplay}%
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Reviews</div>
              <div className="font-semibold">
                {totalReviews?.toLocaleString?.() ?? "-"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Owners</div>
              <div className="font-semibold">
                {estimatedOwners?.toLocaleString?.() ?? "-"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Value</div>
              <div className="font-semibold">
                {isFree
                  ? `Free / ${averagePlaytime}h`
                  : `${priceDisplay} / ${averagePlaytime}h`}
              </div>
            </div>

          </div>
        </div>
      </div>
      {/* View details ボタン（カード右下） */}
      <div className="flex justify-end px-4 pb-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleViewDetails();
          }}
          className="text-primary hover:text-primary/80 px-0 h-auto"
        >
          View details
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </Card>
  );
};


