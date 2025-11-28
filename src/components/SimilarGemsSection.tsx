import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GameCard } from "@/components/GameCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface RankingGame {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number;
  priceOriginal?: number | null;
  discountPercent?: number;
  isOnSale?: boolean;
  averagePlaytime: number;
  lastUpdated: string;
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  analysis: {
    hiddenGemVerdict: "Yes" | "No" | "Unknown";
    summary: string;
    labels: string[];
    pros: string[];
    cons: string[];
    riskScore: number;
    bugRisk: number;
    refundMentions: number;
    reviewQualityScore: number;
  };
  gemLabel: string;
  isStatisticallyHidden: boolean;
  releaseDate: string;
  releaseYear: number;
  isAvailableInStore?: boolean;
  similarityScore?: number;
  sharedTags?: string[];
  headerImage?: string | null;
}

interface SimilarGemsSectionProps {
  game: {
    appId?: number | string;
  };
}

export const SimilarGemsSection = ({ game }: SimilarGemsSectionProps) => {
  const [similarGames, setSimilarGames] = useState<RankingGame[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasTried, setHasTried] = useState(false);

  useEffect(() => {
    const fetchSimilarGames = async () => {
      const appId = Number(game.appId);
      if (!appId) return;

      setIsLoading(true);
      setHasTried(true);

      try {
        const { data, error } = await supabase.functions.invoke("get-similar-gems", {
          body: { appId, limit: 3 },
        });

        if (error) {
          console.error("Error fetching similar games:", error);
          setSimilarGames([]);
        } else {
          setSimilarGames(data?.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch similar games:", err);
        setSimilarGames([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSimilarGames();
  }, [game.appId]);

  if (!hasTried) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-2xl">Similar Hidden Gems</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : similarGames.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No similar titles found.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {similarGames.map((similarGame) => (
              <div key={similarGame.appId} className="space-y-3">
                <GameCard
                  title={similarGame.title}
                  hiddenGemScore={similarGame.analysis.reviewQualityScore}
                  summary={similarGame.analysis.summary}
                  labels={similarGame.analysis.labels}
                  positiveRatio={similarGame.positiveRatio}
                  totalReviews={similarGame.totalReviews}
                  estimatedOwners={similarGame.estimatedOwners}
                  price={similarGame.price}
                  averagePlaytime={similarGame.averagePlaytime}
                  appId={similarGame.appId}
                  gameData={similarGame}
                  analysisData={similarGame.analysis}
                  headerImage={similarGame.headerImage}
                />
                <div className="px-2 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Similarity:</span>
                    <span className="font-semibold text-primary">
                      {Math.round((similarGame.similarityScore || 0) * 100)}%
                    </span>
                  </div>
                  {similarGame.sharedTags && similarGame.sharedTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {similarGame.sharedTags.slice(0, 3).map((tag, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {similarGame.sharedTags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{similarGame.sharedTags.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground flex gap-3">
                    <span>${(similarGame.price / 100).toFixed(2)}</span>
                    <span>•</span>
                    <span>{Math.round(similarGame.averagePlaytime / 60)}h avg</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
