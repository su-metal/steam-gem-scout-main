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
  screenshots?: {
    full?: string;
    thumbnail?: string;
  }[];
  headerImage?: string | null;
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
  screenshots,
  headerImage,
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

  const explicitHeaderImage =
    (gameData as any)?.headerImage ??
    (headerImage && headerImage.trim() !== "" ? headerImage : null);

  const fallbackHeaderImageUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;

  const headerImageUrl =
    explicitHeaderImage && explicitHeaderImage.trim() !== ""
      ? explicitHeaderImage
      : fallbackHeaderImageUrl;

  const tagSource =
    gameData ?? {
      analysis:
        analysisData ?? (labels && labels.length > 0 ? { labels } : undefined),
      tags,
    };

  const displayTags = getDisplayTags(tagSource, 5);

  const positiveDisplay = Number.isFinite(positiveRatio)
    ? Math.round(positiveRatio)
    : 0;

  // --- 統計ベースのサマリ生成 ---
  const hasAISummary =
    typeof summary === "string" && summary.trim().length > 0;

  const statBasedSummary = (() => {
    const mainTag = displayTags[0];
    const tagText = mainTag ? `${mainTag}系の` : "";
    const positiveText =
      positiveDisplay > 0 ? `${positiveDisplay}%の好評率` : "一定の好評";
    const reviewsText =
      typeof totalReviews === "number" && totalReviews > 0
        ? `${totalReviews.toLocaleString()}件のレビュー`
        : "いくつかのレビュー";

    return `${positiveText}と${reviewsText}を持つ${tagText}タイトルです。カードを開くと、AIがレビュー内容を解析して詳しい長所・短所を表示します。`;
  })();

  const safeSummary = hasAISummary ? summary : statBasedSummary;

  // --- AI info extraction ---

  const ai = analysisData || gameData?.analysis || {};

  const rawAudienceBadges = (ai as any)?.audienceBadges;

  const audienceBadges: { id?: string; label: string }[] = Array.isArray(
    rawAudienceBadges
  )
    ? rawAudienceBadges
      .map((item: any) => {
        if (!item) return null;

        // 文字列だけ返ってきた場合も一応ケア
        if (typeof item === "string") {
          return { id: item, label: item };
        }

        const id =
          typeof item.id === "string" && item.id.trim().length > 0
            ? item.id.trim()
            : undefined;
        const label =
          typeof item.label === "string" && item.label.trim().length > 0
            ? item.label.trim()
            : id;

        if (!label) return null;

        return { id, label };
      })
      // null を除外
      .filter((b: any): b is { id?: string; label: string } => !!b)
      // 最大 3 〜 4 個くらいに絞る（ここでは 4 個）
      .slice(0, 4)
    : [];


  // GameDetail 側の analyze-hidden-gem が走ると currentStateSummary / historicalIssuesSummary が入る前提
  const hasFullAIAnalysis =
    !!ai.currentStateSummary || !!ai.historicalIssuesSummary;

  const verdict: "Yes" | "No" | "Unknown" =
    hasFullAIAnalysis ? (ai.hiddenGemVerdict ?? "Unknown") : "Unknown";

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
  const gemScore: number | null =
    statGemScore !== null
      ? statGemScore
      : reviewQualityScore !== null
        ? reviewQualityScore
        : Number.isFinite(hiddenGemScore)
          ? hiddenGemScore
          : null;

  const hasGemScore = typeof gemScore === "number" && gemScore > 0;

  // 色付き丸バッジ class
  const gemScoreCircleClass =
    !hasGemScore
      ? "bg-muted text-muted-foreground"
      : gemScore! >= 8
        ? "bg-emerald-500 text-emerald-50"
        : gemScore! >= 6
          ? "bg-yellow-500 text-yellow-900"
          : "bg-red-500 text-red-50";

  const gemScoreLabel = hasFullAIAnalysis ? "AI Gem Score" : "Gem Score";


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
      className="relative bg-card/50 border-primary/20 hover:border-primary/40 transition-all hover:bg-card/70 cursor-pointer overflow-hidden rounded-lg shadow-sm hover:shadow-md h-full flex flex-col"
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

      <div className="flex flex-col gap-4 p-4 h-full">
        {/* Left: Header Image */}
        <div className="w-full">
          <img
            src={headerImageUrl}
            className="w-full aspect-video object-cover rounded-lg"
          />
        </div>

        {/* Middle: Title, Metascore, Summary, Tags */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap mt-1">
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

          <p className="text-sm text-muted-foreground line-clamp-3">
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

          {audienceBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {audienceBadges.map((badge, i) => (
                <Badge
                  key={`${badge.id ?? badge.label}-${i}`}
                  variant="outline"
                  className="text-[11px] px-2 py-0.5 rounded-full border-primary/40 text-primary/90 bg-primary/5"
                >
                  {badge.label}
                </Badge>
              ))}
            </div>
          )}


          {/* AI Verdict & Risk badges */}
          <div className="flex flex-wrap gap-1 mt-1">
            {/* Verdict Badge */}
            {hasFullAIAnalysis ? (
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
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground"
              >
                AI: Pending
              </Badge>
            )}

            {/* Risk Level Badge: AI解析済みのときだけ表示 */}
            {hasFullAIAnalysis && riskLevel && (
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
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`rounded-full w-12 h-12 flex items-center justify-center text-lg font-bold shadow-lg border ${gemScoreCircleClass}`}
            >
              {hasGemScore ? gemScore!.toFixed(1) : "—"}
            </div>
            <span className="text-[10px] mt-0.5 text-muted-foreground">
              {gemScoreLabel}
            </span>
          </div>




          <div className="grid grid-cols-2 gap-2 text-xs">
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
