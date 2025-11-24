import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SearchResultCard } from "@/components/SearchResultCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const WISHLIST_STORAGE_KEY = "hidden-gems-wishlist";

interface HiddenGemAnalysis {
  hiddenGemVerdict: "Yes" | "No" | "Unknown";
  summary: string;
  labels: string[];
  pros: string[];
  cons: string[];
  riskScore: number;
  bugRisk: number;
  refundMentions: number;
  reviewQualityScore: number;
  aiError?: boolean;
}

type GemLabel = "Hidden Gem" | "Highly rated but not hidden" | "Not a hidden gem";

interface RankingGame {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number; // cents
  averagePlaytime: number;
  lastUpdated: string;
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  analysis: HiddenGemAnalysis;
  gemLabel: GemLabel;
  isStatisticallyHidden: boolean;
  releaseYear?: number;
  releaseDate?: string;
  headerImage?: string | null;
}

export default function Wishlist() {
  const [games, setGames] = useState<RankingGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. localStorage から appId 一覧を取得
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    try {
      const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (!raw) {
        setGames([]);
        setLoading(false);
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setGames([]);
        setLoading(false);
        return;
      }

      // 文字列の可能性もあるので、string のままサーバーに渡す
      const wishlistIds: (string | number)[] = parsed;
      fetchWishlistGames(wishlistIds);
    } catch (error) {
      console.error("Failed to read wishlist from localStorage", error);
      setGames([]);
      setLoading(false);
    }
  }, []);

  const fetchWishlistGames = async (wishlistIds: (string | number)[]) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-hidden-gems", {
        body: {
          wishlistIds,
        },
      });

      if (error) {
        console.error("Error fetching wishlist games:", error);
        setGames([]);
        return;
      }

      const list = (data as RankingGame[]) ?? [];
      setGames(list);
    } catch (err) {
      console.error("Exception while fetching wishlist games:", err);
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
              Wishlist
            </h1>
            <p className="text-muted-foreground">Games you&apos;ve marked with the heart icon.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <a href="/">
                <Home className="w-4 h-4 mr-2" />
                Home
              </a>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">
              No games in your wishlist yet. Try adding some by clicking the heart on the search results.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((game) => (
              <SearchResultCard
                key={game.appId}
                appId={game.appId}
                title={game.title}
                summary={game.analysis.summary}
                labels={game.analysis.labels}
                positiveRatio={game.positiveRatio}
                totalReviews={game.totalReviews}
                price={game.price}
                averagePlaytime={game.averagePlaytime}
                gameData={game}
                analysisData={game.analysis}
                headerImage={game.headerImage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
