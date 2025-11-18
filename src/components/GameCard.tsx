import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Heart } from "lucide-react";
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
}: GameCardProps) => {
  const navigate = useNavigate();
  const isFeatured = variant === "featured";
  
  const appIdStr = String(appId);
  const { isWished, toggle } = useWishlist();
  const isInWishlist = isWished(appIdStr);

  const handleViewDetails = () => {
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
            },
    });
  };

  // Steam header image URL (using appId)
  const headerImageUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;

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
  
  const isFree = price === 0;
  const priceDisplay = isFree ? "Free" : `$${(price / 100).toFixed(2)}`;

  return (
    <Card className="relative bg-card/50 border-primary/20 hover:border-primary/40 transition-all hover:bg-card/70 overflow-hidden rounded-xl shadow-sm hover:shadow-md">
      {/* Wishlist heart button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle(appIdStr);
        }}
        className="absolute top-3 right-3 z-10 rounded-full p-2 bg-background/80 hover:bg-background shadow-sm border border-border/50"
        aria-label={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
      >
        <Heart className={`w-4 h-4 ${isInWishlist ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
      </button>

      {/* Header image with gradient overlay */}
      <div className="relative">
        <img
          src={headerImageUrl}
          alt={title}
          loading="lazy"
          className={`w-full object-cover ${isFeatured ? "h-52 md:h-64" : "h-40 md:h-48"}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />

        {/* Title + Gem Score badge */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="space-y-1">
            <h3 className={`font-semibold line-clamp-2 ${isFeatured ? "text-lg md:text-xl" : "text-base md:text-lg"}`}>
              {title}
            </h3>
            <p className={`text-xs text-muted-foreground line-clamp-2 ${isFeatured ? "md:line-clamp-3" : ""}`}>
              {safeSummary}
            </p>
          </div>

          <div className="flex flex-col items-center shrink-0">
            <div className="rounded-full bg-primary text-primary-foreground w-14 h-14 flex items-center justify-center text-xl font-bold shadow-lg border border-primary/70">
              {hiddenGemScore}
            </div>
            <span className="text-[10px] mt-1 text-primary-foreground/90 drop-shadow">Gem Score</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <CardContent className="space-y-4 pt-4">
        {/* Tags / labels */}
        {displayTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {displayTags.map((label, i) => (
              <Badge key={`${label}-${i}`} variant="secondary" className="text-xs px-2 py-0.5 rounded-full">
                {label}
              </Badge>
            ))}
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Positive</div>
            <div className="font-semibold text-primary">{Math.round(positiveRatio)}%</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Reviews</div>
            <div className="font-semibold">{totalReviews?.toLocaleString?.() ?? "-"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Owners</div>
            <div className="font-semibold">{estimatedOwners?.toLocaleString?.() ?? "-"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Value</div>
            <div className="font-semibold">
              {isFree ? `Free / ${averagePlaytime}h` : `${priceDisplay} / ${averagePlaytime}h`}
            </div>
          </div>
        </div>

        {/* View details button */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewDetails}
            className="text-primary hover:text-primary/80 px-0 h-auto"
          >
            View details
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
