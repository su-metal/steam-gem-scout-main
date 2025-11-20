import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Heart, Sparkles, TrendingUp } from "lucide-react";
import { useWishlist } from "@/hooks/useWishlist";

// Returns the tags that should be displayed on the card
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

interface SearchResultCardProps {
  title: string;
  hiddenGemScore: number;
  summary: string;
  labels: string[];
  positiveRatio: number;
  totalReviews: number;
  price: number;
  averagePlaytime: number;
  appId: number | string;
  gameData?: any;
  analysisData?: any;
  tags?: string[];
}

export const SearchResultCard = ({
  title,
  hiddenGemScore,
  summary,
  labels,
  positiveRatio,
  totalReviews,
  price,
  averagePlaytime,
  appId,
  gameData,
  analysisData,
  tags,
}: SearchResultCardProps) => {
  const navigate = useNavigate();
  const appIdStr = String(appId);

  const { isWished, toggle } = useWishlist();
  const isInWishlist = isWished(appIdStr);

  const handleClick = () => {
    navigate(`/game/${appId}`, {
      state: gameData && analysisData ? { gameData, analysisData } : undefined,
    });
  };

  const headerImageUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;
  const safeSummary =
    summary || "AI could not generate a summary for this title, but it looks like a promising hidden gem.";

  const tagSource =
    gameData ?? {
      analysis:
        analysisData ??
        (labels && labels.length > 0 ? { labels } : undefined),
      tags,
    };

  const displayTags = getDisplayTags(tagSource, 5);

  const positiveDisplay = Number.isFinite(positiveRatio)
    ? Math.round(positiveRatio)
    : 0;

  // --- AI info extraction ---

  const ai = analysisData || gameData?.analysis || {};

  const verdict: "Yes" | "No" | "Unknown" =
    ai.hiddenGemVerdict ?? "Unknown";

  const riskScore: number | null =
    typeof ai.riskScore === "number" ? ai.riskScore : null;

  const riskLevel =
    riskScore == null
      ? null
      : riskScore <= 3
        ? "Low"
        : riskScore <= 6
          ? "Medium"
          : "High";

  // --- AI Gem Score (statGemScore 優先) ---
  const statGemScore: number | null =
    typeof ai.statGemScore === "number" ? ai.statGemScore : null;

  const reviewQualityScore: number | null =
    typeof ai.reviewQualityScore === "number"
      ? ai.reviewQualityScore
      : null;


  // --- gemLabel 抽出 & Hidden Gem 判定補完 ---

  // まずは明示的についているラベルを優先
  const explicitGemLabel: GemLabel | undefined =
    (gameData?.gemLabel as GemLabel | undefined) ??
    (analysisData?.gemLabel as GemLabel | undefined) ??
    (ai.gemLabel as GemLabel | undefined) ??
    undefined;

  // AI 判定情報
  const aiVerdict: "Yes" | "No" | "Unknown" =
    ai.hiddenGemVerdict ?? "Unknown";

  const isStatisticallyHidden: boolean =
    ai.isStatisticallyHidden === true || gameData?.isStatisticallyHidden === true;

  const qualifiesAsHiddenGem: boolean =
    isStatisticallyHidden ||
    aiVerdict === "Yes" ||
    (statGemScore !== null && statGemScore >= 8);

  // 最終的にカードで扱う gemLabel
  const gemLabel: GemLabel | undefined =
    explicitGemLabel ??
    (qualifiesAsHiddenGem ? "Hidden Gem" : undefined);

  // 表示用の gem バッジ設定
  let gemBadgeText: string | null = null;
  let gemBadgeClass =
    "bg-muted text-muted-foreground border border-border/40";
  let GemIcon: React.ComponentType<{ className?: string }> | null = null;


  if (gemLabel) {
    switch (gemLabel) {
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

  // --- AI gem score & verdict line ---
  // 優先順位:
  //  1. statGemScore（統計ベースの隠れた名作度）
  //  2. reviewQualityScore（旧AIスコア：statGemScore の無い古いデータ用）
  //  3. hiddenGemScore（props から渡されるフォールバック）
  const gemScore: number | null =
    statGemScore !== null
      ? statGemScore
      : reviewQualityScore !== null
        ? reviewQualityScore
        : Number.isFinite(hiddenGemScore)
          ? hiddenGemScore
          : null;


  // 色付き丸バッジ class
  const gemScoreCircleClass =
    gemScore === null
      ? "bg-muted text-muted-foreground"
      : gemScore >= 8
        ? "bg-emerald-500 text-emerald-50"
        : gemScore >= 6
          ? "bg-yellow-500 text-yellow-900"
          : "bg-red-500 text-red-50";

  // AI recommends 文言
  const aiRecommendsLabel =
    verdict === "Yes"
      ? "AI strongly recommends this title."
      : verdict === "Unknown"
        ? "AI is cautiously positive based on limited data."
        : verdict === "No"
          ? "AI does not recommend this title."
          : null;

  // メタスコア表示用（"Metacritic: 94" から 94 を抜き出す）
  const reviewScoreDesc: string | undefined =
    gameData?.reviewScoreDesc ?? analysisData?.reviewScoreDesc ?? undefined;

  let metaScore: number | null = null;
  if (reviewScoreDesc) {
    const match = reviewScoreDesc.match(/(\d+)/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) {
        metaScore = n;
      }
    }
  }

  let metaBadgeClass =
    "bg-muted text-muted-foreground border border-border/40";
  if (metaScore != null) {
    if (metaScore >= 85) {
      metaBadgeClass = "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40";
    } else if (metaScore >= 70) {
      metaBadgeClass = "bg-yellow-500/15 text-yellow-300 border border-yellow-500/40";
    } else {
      metaBadgeClass = "bg-red-500/15 text-red-300 border border-red-500/40";
    }
  }

  const normalizedPrice =
    typeof price === "number" && Number.isFinite(price) ? price : 0;
  const isFree = normalizedPrice === 0;
  const priceDisplay = isFree
    ? "Free"
    : `$${normalizedPrice.toFixed(2)}`;

  return (
    <Card
      className="relative bg-card/50 border-primary/20 hover:border-primary/40 transition-all hover:bg-card/70 cursor-pointer overflow-hidden rounded-lg shadow-sm hover:shadow-md"
      onClick={handleClick}
    >
      {/* Wishlist heart button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // prevent navigation when clicking the heart
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
            src={headerImageUrl}
            alt={title}
            loading="lazy"
            className="w-full sm:w-40 h-24 sm:h-auto object-cover rounded"
          />
        </div>

        {/* Middle: Title, Metascore, Summary, Tags */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg line-clamp-1">{title}</h3>

            {/* gemLabel バッジ */}
            {gemBadgeText && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${gemBadgeClass}`}
              >
                {GemIcon && <GemIcon className="w-3 h-3" />}
                <span className="leading-none">{gemBadgeText}</span>
              </span>
            )}

            {/* メタスコアバッジ */}
            {reviewScoreDesc && (
              <div
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${metaBadgeClass}`}
              >
                {metaScore != null && (
                  <span className="leading-none">{metaScore}</span>
                )}
                <span className="uppercase tracking-wide leading-none">
                  MC
                </span>
              </div>
            )}
          </div>

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
            <div className="flex flex-col items-center">
              <div
                className={`rounded-full w-12 h-12 flex items-center justify-center text-lg font-bold shadow-lg border ${gemScoreCircleClass}`}
              >
                {gemScore !== null ? gemScore.toFixed(1) : "N/A"}
              </div>
              <span className="text-[10px] mt-0.5 text-muted-foreground">
                AI Gem Score
              </span>
            </div>
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
              <div className="text-muted-foreground">Price</div>
              <div className="font-semibold">{priceDisplay}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Playtime</div>
              <div className="font-semibold">{averagePlaytime}h</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
