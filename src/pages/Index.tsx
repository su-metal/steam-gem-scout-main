import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Search, Home, Heart } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { GameCard } from "@/components/GameCard";
import { Skeleton } from "@/components/ui/skeleton";

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
  price: number;
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
}

const QUICK_GENRES = [
  "All",
  "Action",
  "Adventure",
  "RPG",
  "Strategy",
  "Simulation",
  "Casual",
  "Sports",
  "Racing",
  "Puzzle",
  "Platformer",
  "Metroidvania",
  "Roguelike",
  "Deckbuilding",
  "Horror",
  "Visual Novel",
  "Indie",
  "Open World",
  "Survival",
  "Co-op",
];

// Normalize tag strings for comparison (case-insensitive, ignore spaces and hyphens)
const normalizeTag = (tag: string) => tag.toLowerCase().replace(/\s+/g, "").replace(/-/g, "");

// Returns the tags that should be displayed on cards and detail pages.
// Priority: analysis.labels (AI labels) -> fallback to raw tags.
const getDisplayTags = (game: { analysis?: { labels?: string[] }; tags?: string[] }, limit?: number): string[] => {
  const baseTags =
    (game.analysis?.labels && game.analysis.labels.length > 0 ? game.analysis.labels : (game.tags ?? [])) || [];

  if (!limit || baseTags.length <= limit) {
    return baseTags;
  }

  return baseTags.slice(0, limit);
};

const Index = () => {
  const navigate = useNavigate();
  const [games, setGames] = useState<RankingGame[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fallbackMessage, setFallbackMessage] = useState<string>("");

  useEffect(() => {
    fetchRecentGems();
  }, []);

  const fetchRecentGems = async () => {
    setLoading(true);
    setFallbackMessage("");

    try {
      // 指定期間のランキングから Hidden Gem と全体候補を返すヘルパー
      const fetchForPeriod = async (recentDays: string | null) => {
        const { data, error } = await supabase.functions.invoke("search-games", {
          body: {
            genre: "",                 // ホームはジャンル固定なし
            recentDays: recentDays ?? "",
            sort: "recommended",       // ← Gem Score ソート（UI では「Gem Score」）
            minReviews: 0,
            minPlaytime: 0,
          },
        });

        if (error) {
          console.error("Error fetching games for period", recentDays, error);
          return { hidden: [] as RankingGame[], all: [] as RankingGame[] };
        }

        const list = (data as RankingGame[]) || [];
        const hidden = list.filter((game) => game.gemLabel === "Hidden Gem");

        return { hidden, all: list };
      };

      let results: RankingGame[] = [];
      let fallback: RankingGame[] = [];

      // ① まず 7 日以内の Hidden Gem
      console.log("Home: fetching hidden gems from last 7 days");
      let { hidden, all } = await fetchForPeriod("7");
      if (hidden.length > 0) {
        results = hidden;
      }
      if (all.length > 0) {
        fallback = all;
      }

      // ② 7日で Hidden Gem が 0件なら 30日を試す
      if (results.length === 0) {
        console.log("Home: no hidden gems in last 7 days, trying 30 days");
        ({ hidden, all } = await fetchForPeriod("30"));

        if (hidden.length > 0) {
          results = hidden;
          setFallbackMessage(
            "No qualifying hidden gems were found in the last 7 days. Showing results from the last 30 days instead.",
          );
        } else if (all.length > 0 && fallback.length === 0) {
          // Hidden Gem はないが、30日内の良作リストは確保しておく
          fallback = all;
        }
      }

      // ③ それでも Hidden Gem 0件なら All time
      if (results.length === 0) {
        console.log("Home: no hidden gems in last 30 days, trying all time");
        ({ hidden, all } = await fetchForPeriod(null));

        if (hidden.length > 0) {
          results = hidden;
          setFallbackMessage(
            "No qualifying hidden gems were found in the last 7 or 30 days. Showing top hidden gems from all time instead.",
          );
        } else if (all.length > 0) {
          // それでも Hidden Gem 0件なら、最後の手段として「高評価ゲーム」を出す
          fallback = all;
          setFallbackMessage(
            "No games met the strict hidden gem criteria. Showing top high-quality games instead.",
          );
        }
      }

      // Hidden Gem が1件もなければ fallback（高評価ゲーム）を使う
      if (results.length === 0 && fallback.length > 0) {
        results = fallback;
      }

      const limitedResults = results.slice(0, 24);
      setGames(limitedResults);

      if (limitedResults.length === 0) {
        toast.info("No hidden gems found matching our quality criteria");
      }
    } catch (err) {
      console.error("Exception fetching gems:", err);
      toast.error("An error occurred while loading hidden gems");
    } finally {
      setLoading(false);
    }
  };




  // Filter games by selected quick genre (if any)
  // Use the same tags that are displayed on the GameCard (analysis.labels first)
  const filteredGames = useMemo(() => {
    if (!selectedGenre) return games;

    const target = normalizeTag(selectedGenre);

    return games.filter((game) => {
      const cardTags = getDisplayTags(game);
      if (cardTags.length === 0) return false;

      const normalized = cardTags.map(normalizeTag);
      return normalized.includes(target);
    });
  }, [games, selectedGenre]);

  // レーン1: 真の Hidden Gems
  const hiddenGems = useMemo(
    () => filteredGames.filter((game) => game.gemLabel === "Hidden Gem"),
    [filteredGames],
  );

  // レーン2: Hidden ではないが高評価のタイトル（露出はまだ少なめ）
  const noticedGames = useMemo(
    () =>
      filteredGames
        .filter(
          (game) =>
            game.gemLabel !== "Hidden Gem" &&
            (game.positiveRatio ?? 0) >= 85 &&
            (game.totalReviews ?? 0) >= 50,
        )
        .slice(0, 16),
    [filteredGames],
  );

  const featuredHiddenGems = hiddenGems.slice(0, 3);
  const otherHiddenGems = hiddenGems.slice(3);


  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-primary/10 via-background to-background border-b">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Steam Hidden Gems Finder</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Discover Hidden Gems on Steam
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Find high-quality indie games that deserve more attention. Powered by AI analysis of real player reviews.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button
                size="lg"
                onClick={() => navigate("/search")}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
              >
                <Search className="w-5 h-5 mr-2" />
                Search Hidden Gems
              </Button>

              <Button size="lg" variant="outline" asChild>
                <a href="/wishlist">
                  <Heart className="w-4 h-4 mr-2" />
                  Wishlist
                </a>
              </Button>

              <Button size="lg" variant="outline" onClick={fetchRecentGems}>
                <Home className="w-4 h-4 mr-2" />
                Refresh Recommendations
              </Button>

              {/* ⭐ 追加部分：Steam インポート（新規タブで開く） */}
              <Button size="lg" variant="outline" asChild>
                <a href="/admin/import-steam" target="_blank" rel="noreferrer">
                  Steamインポート（管理用）
                </a>
              </Button>
            </div>
          </div>

          {/* Quick Genre Shortcuts */}
          <div className="mt-10">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Browse by tag</span>
              <span className="text-[10px] text-muted-foreground">Swipe to see more →</span>
            </div>

            <div className="relative">
              <div
                className="
                  flex gap-2 overflow-x-auto py-2 -mx-4 px-4
                  [scrollbar-width:none] [-ms-overflow-style:none]
                  [&::-webkit-scrollbar]:hidden
                "
              >
                {/* "All" button to clear the genre filter */}
                <Button
                  variant={selectedGenre === null ? "default" : "outline"}
                  size="sm"
                  className="rounded-full text-xs flex-shrink-0"
                  onClick={() => setSelectedGenre(null)}
                >
                  All
                </Button>

                {QUICK_GENRES.map((genre) => {
                  const isActive = selectedGenre === genre;
                  return (
                    <Button
                      key={genre}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="rounded-full text-xs flex-shrink-0"
                      onClick={() => setSelectedGenre((current) => (current === genre ? null : genre))}
                    >
                      {genre}
                    </Button>
                  );
                })}
              </div>

              {/* 右端のフェードで「まだ続きがある感」を出す */}
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Gems Section */}
      <div className="max-w-6xl mx-auto px-4 py-12 space-y-8">
        <div>
          <h2 className="text-3xl font-bold mb-2">Recent High-Quality Hidden Gems</h2>
          <p className="text-muted-foreground">Newly released games with excellent reviews but low visibility</p>
        </div>

        {fallbackMessage && (
          <div className="bg-muted/50 border border-border rounded-lg p-4 text-sm text-muted-foreground">
            {fallbackMessage}
          </div>
        )}

        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <Card className="p-12 text-center">
            <Home className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">No recent hidden gems found matching our quality criteria</p>
            <Button onClick={() => navigate("/search")} variant="outline">
              Try Advanced Search
            </Button>
          </Card>
        ) : (
          <div className="space-y-12">
            {/* レーン1: Hidden Gems */}
            {(featuredHiddenGems.length > 0 || otherHiddenGems.length > 0) && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-semibold">Today&apos;s Hidden Gems</h3>
                    <p className="text-sm text-muted-foreground">
                      AI が「本当に隠れている良作」と判断したタイトルだけをピックアップ
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    {hiddenGems.length} titles
                  </span>
                </div>

                {/* Featured hidden gems */}
                {featuredHiddenGems.length > 0 && (
                  <div className="grid gap-6 md:grid-cols-3">
                    {featuredHiddenGems.map((game) => (
                      <GameCard
                        key={game.appId}
                        appId={game.appId}
                        title={game.title}
                        hiddenGemScore={game.analysis.reviewQualityScore}
                        summary={game.analysis.summary}
                        labels={game.analysis.labels}
                        positiveRatio={game.positiveRatio}
                        totalReviews={game.totalReviews}
                        estimatedOwners={game.estimatedOwners}
                        price={game.price}
                        averagePlaytime={game.averagePlaytime}
                        gameData={game}
                        analysisData={game.analysis}
                      />
                    ))}
                  </div>
                )}

                {/* Other hidden gems */}
                {otherHiddenGems.length > 0 && (
                  <div className="space-y-6">
                    {otherHiddenGems.map((game) => (
                      <GameCard
                        key={game.appId}
                        appId={game.appId}
                        title={game.title}
                        hiddenGemScore={game.analysis.reviewQualityScore}
                        summary={game.analysis.summary}
                        labels={game.analysis.labels}
                        positiveRatio={game.positiveRatio}
                        totalReviews={game.totalReviews}
                        estimatedOwners={game.estimatedOwners}
                        price={game.price}
                        averagePlaytime={game.averagePlaytime}
                        gameData={game}
                        analysisData={game.analysis}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* レーン2: 高評価だけど非Hidden（New & Noticed） */}
            {noticedGames.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">New &amp; Noticed</h3>
                    <p className="text-sm text-muted-foreground">
                      まだ Hidden 判定ではないものの、高評価で勢いが出てきているタイトル
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/search")}>
                    Open Advanced Search
                  </Button>
                </div>

                <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                  {noticedGames.map((game) => (
                    <GameCard
                      key={game.appId}
                      appId={game.appId}
                      title={game.title}
                      hiddenGemScore={game.analysis.reviewQualityScore}
                      summary={game.analysis.summary}
                      labels={game.analysis.labels}
                      positiveRatio={game.positiveRatio}
                      totalReviews={game.totalReviews}
                      estimatedOwners={game.estimatedOwners}
                      price={game.price}
                      averagePlaytime={game.averagePlaytime}
                      gameData={game}
                      analysisData={game.analysis}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
