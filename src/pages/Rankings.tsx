import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SearchResultCard } from "@/components/SearchResultCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Home, X } from "lucide-react";

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
  price: number; // セント単位
  averagePlaytime: number;
  lastUpdated: string;
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  analysis: HiddenGemAnalysis;
  gemLabel: GemLabel;
  isStatisticallyHidden: boolean;
  // Edge Function 側で compositeScore を付ける予定（ここでは未使用）
  // compositeScore?: number;
}

// -----------------------------
// 定数
// -----------------------------
const GENRE_OPTIONS = [
  "Roguelike",
  "Deckbuilding",
  "RPG",
  "Puzzle",
  "Strategy",
  "Narrative",
  "Relaxing",
  "Horror",
  "Indie",
];

const PERIOD_OPTIONS = [
  { label: "All time", value: "" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "Last 1 year", value: "365" },
  { label: "Last 2 years", value: "730" },
];

const SORT_OPTIONS = [
  { label: "Gem Score", value: "recommended" },
  { label: "Positive %", value: "positive-ratio" },
  { label: "Reviews", value: "most-reviews" },
  { label: "Recentness", value: "newest" },
  { label: "Custom Gem Score", value: "custom" }, // ★ 追加
];

// Gem Score の重み（0〜100のライト版スライダー）
type GemWeights = {
  aiScore: number;
  positiveRatio: number;
  reviewCount: number;
  recency: number;
};

const DEFAULT_WEIGHTS: GemWeights = {
  aiScore: 40,
  positiveRatio: 30,
  reviewCount: 20,
  recency: 10,
};

// 価格スライダーの最大値（ここを変えれば一括で反映）
const MAX_PRICE_SLIDER = 60;

// フィルター状態保存用の localStorage キー
const STORAGE_KEYS = {
  genre: "rankings_selectedGenre",
  period: "rankings_selectedPeriod",
  sort: "rankings_selectedSort",
  maxPrice: "rankings_maxPrice",
  minReviews: "rankings_minReviews",
  minPlaytime: "rankings_minPlaytime",
  gemWeights: "rankings_gemWeights",
} as const;

export default function Rankings() {
    const [games, setGames] = useState<RankingGame[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- フィルター state（localStorage から復元） ----
  const [selectedGenre, setSelectedGenre] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEYS.genre) ?? "";
  });

  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    if (typeof window === "undefined") return "90";
    // 保存されていればそれを、なければ "90"（過去90日）
    return window.localStorage.getItem(STORAGE_KEYS.period) ?? "90";
  });

  const [selectedSort, setSelectedSort] = useState<string>(() => {
    if (typeof window === "undefined") return "recommended";
    return window.localStorage.getItem(STORAGE_KEYS.sort) ?? "recommended";
  });

  // 「Any」のときはスライダーが MAX_PRICE_SLIDER を指すようにする
  const [maxPrice, setMaxPrice] = useState<number>(() => {
    if (typeof window === "undefined") return MAX_PRICE_SLIDER;
    const saved = window.localStorage.getItem(STORAGE_KEYS.maxPrice);
    const n = saved != null ? Number(saved) : NaN;
    return Number.isFinite(n) ? n : MAX_PRICE_SLIDER;
  });

  const [minReviews, setMinReviews] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const saved = window.localStorage.getItem(STORAGE_KEYS.minReviews);
    const n = saved != null ? Number(saved) : NaN;
    return Number.isFinite(n) ? n : 0;
  });

  const [minPlaytime, setMinPlaytime] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const saved = window.localStorage.getItem(STORAGE_KEYS.minPlaytime);
    const n = saved != null ? Number(saved) : NaN;
    return Number.isFinite(n) ? n : 0;
  });

  // Custom Gem Score 用の重み
  const [gemWeights, setGemWeights] = useState<GemWeights>(() => {
    if (typeof window === "undefined") return DEFAULT_WEIGHTS;
    const raw = window.localStorage.getItem(STORAGE_KEYS.gemWeights);
    if (!raw) return DEFAULT_WEIGHTS;
    try {
      const parsed = JSON.parse(raw);
      // 片方のプロパティだけ保存されていた場合でも壊れないようにマージ
      return {
        ...DEFAULT_WEIGHTS,
        ...parsed,
      };
    } catch {
      return DEFAULT_WEIGHTS;
    }
  });

    // フィルターが変わるたびに localStorage に保存
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(STORAGE_KEYS.genre, selectedGenre);
    window.localStorage.setItem(STORAGE_KEYS.period, selectedPeriod);
    window.localStorage.setItem(STORAGE_KEYS.sort, selectedSort);
    window.localStorage.setItem(STORAGE_KEYS.maxPrice, String(maxPrice));
    window.localStorage.setItem(STORAGE_KEYS.minReviews, String(minReviews));
    window.localStorage.setItem(STORAGE_KEYS.minPlaytime, String(minPlaytime));
    window.localStorage.setItem(
      STORAGE_KEYS.gemWeights,
      JSON.stringify(gemWeights),
    );
  }, [
    selectedGenre,
    selectedPeriod,
    selectedSort,
    maxPrice,
    minReviews,
    minPlaytime,
    gemWeights,
  ]);


  const { toast } = useToast();

  const isCustomSort = selectedSort === "custom";

  // 初回だけ全件ロード（サーバー側は価格フィルタなし）
  useEffect(() => {
    fetchRankings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRankings = async () => {
    setLoading(true);
    try {
      console.log("Searching hidden gems with server filters:", {
        genre: selectedGenre || "all",
        period: selectedPeriod || "all time",
        sort: selectedSort,
        minReviews,
        minPlaytime,
        gemWeights: selectedSort === "custom" ? gemWeights : undefined,
      });

      const { data, error } = await supabase.functions.invoke("search-games", {
        body: {
          genre: selectedGenre || "",
          recentDays: selectedPeriod || "",
          sort: selectedSort,
          minReviews,
          minPlaytime,
          ...(selectedSort === "custom"
            ? {
                aiWeight: gemWeights.aiScore,
                positiveRatioWeight: gemWeights.positiveRatio,
                reviewCountWeight: gemWeights.reviewCount,
                recencyWeight: gemWeights.recency,
              }
            : {}),
        },
      });

      if (error) {
        console.error("Error fetching rankings:", error);
        toast({
          title: "Error",
          description: "Failed to load rankings. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const rankings = (data as RankingGame[]) ?? [];
      console.log(`Received ${rankings.length} games from server`);

      // ★ ここでクライアント側の価格フィルタを適用
      const filteredByPrice =
        maxPrice === MAX_PRICE_SLIDER
          ? rankings
          : rankings.filter((game) => {
              const priceInDollars = game.price / 100;
              return priceInDollars <= maxPrice;
            });

      console.log(`After client-side price filter (<= $${maxPrice} or Any): ${filteredByPrice.length} games`);

      setGames(filteredByPrice);
      toast({
        title: "Search complete",
        description: `Found ${filteredByPrice.length} hidden gems`,
      });
    } catch (err) {
      console.error("Exception fetching rankings:", err);
      toast({
        title: "Error",
        description: "An error occurred while loading rankings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearAllFilters = () => {
    setSelectedGenre("");
    setSelectedPeriod("");
    setSelectedSort("recommended");
    setMaxPrice(MAX_PRICE_SLIDER);
    setMinReviews(0);
    setMinPlaytime(0);
    setGemWeights(DEFAULT_WEIGHTS); // ★ 重みもリセット
  };

  const removeFilter = (filterType: string) => {
    switch (filterType) {
      case "genre":
        setSelectedGenre("");
        break;
      case "period":
        setSelectedPeriod("");
        break;
      case "sort":
        setSelectedSort("recommended");
        break;
      case "maxPrice":
        setMaxPrice(MAX_PRICE_SLIDER);
        break;
      case "minReviews":
        setMinReviews(0);
        break;
      case "minPlaytime":
        setMinPlaytime(0);
        break;
    }
  };

  const hasActiveFilters =
    selectedGenre ||
    selectedPeriod ||
    selectedSort !== "recommended" ||
    maxPrice !== MAX_PRICE_SLIDER ||
    minReviews > 0 ||
    minPlaytime > 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
              Hidden Gems Search
            </h1>
            <p className="text-muted-foreground">Find high-quality games by genre and release period</p>
          </div>

          {/* Right side: navigation buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <a href="/">
                <Home className="w-4 h-4 mr-2" />
                Home
              </a>
            </Button>

            <Button variant="outline" asChild>
              <a href="/wishlist">Wishlist</a>
            </Button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="space-y-4 p-6 bg-card rounded-lg border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="genre" className="text-sm font-medium">
                Genre
              </label>
              <select
                id="genre"
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All genres</option>
                {GENRE_OPTIONS.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="period" className="text-sm font-medium">
                Released within
              </label>
              <select
                id="period"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Sort by</label>
              <div className="flex flex-wrap gap-2">
                {SORT_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={selectedSort === option.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedSort(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Gem Score Weights (Custom Sort) */}
          <div className="border-t pt-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Gem Score Weights</h3>
              <button type="button" className="text-xs underline" onClick={() => setGemWeights(DEFAULT_WEIGHTS)}>
                Reset
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {isCustomSort
                ? "When 'Custom Gem Score' is selected, the results will be sorted based on the weights below."
                : "These weight settings become active when 'Custom Gem Score' is selected."}
            </p>

            <div
              className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
                !isCustomSort ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {/* AI Score */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">AI Score</Label>
                  <span className="text-xs text-muted-foreground">{gemWeights.aiScore}</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[gemWeights.aiScore]}
                  onValueChange={([value]) => setGemWeights((prev) => ({ ...prev, aiScore: value }))}
                />
              </div>

              {/* Positive Ratio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">Positive Ratio</Label>
                  <span className="text-xs text-muted-foreground">{gemWeights.positiveRatio}</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[gemWeights.positiveRatio]}
                  onValueChange={([value]) =>
                    setGemWeights((prev) => ({
                      ...prev,
                      positiveRatio: value,
                    }))
                  }
                />
              </div>

              {/* Review Count */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">Review Count</Label>
                  <span className="text-xs text-muted-foreground">{gemWeights.reviewCount}</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[gemWeights.reviewCount]}
                  onValueChange={([value]) =>
                    setGemWeights((prev) => ({
                      ...prev,
                      reviewCount: value,
                    }))
                  }
                />
              </div>

              {/* Recency */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">Recency</Label>
                  <span className="text-xs text-muted-foreground">{gemWeights.recency}</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[gemWeights.recency]}
                  onValueChange={([value]) => setGemWeights((prev) => ({ ...prev, recency: value }))}
                />
              </div>
            </div>
          </div>

          {/* Additional Filters */}
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-medium mb-4">Additional Filters</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Max Price */}
              <div className="space-y-3">
                <label htmlFor="maxPrice" className="text-sm font-medium flex items-center justify-between">
                  <span>Max Price</span>
                  <span className="text-primary font-semibold">
                    {maxPrice === MAX_PRICE_SLIDER ? "Any" : `$${maxPrice}`}
                  </span>
                </label>
                <Slider
                  id="maxPrice"
                  value={[maxPrice]}
                  min={0}
                  max={MAX_PRICE_SLIDER}
                  step={1}
                  onValueChange={(vals) => setMaxPrice(vals[0])}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>$0</span>
                  <span>{`$${MAX_PRICE_SLIDER}+`}</span>
                </div>
              </div>

              {/* Min Reviews */}
              <div className="space-y-3">
                <label htmlFor="minReviews" className="text-sm font-medium flex items-center justify-between">
                  <span>Min Reviews</span>
                  <span className="text-primary font-semibold">{minReviews === 0 ? "Any" : `${minReviews}+`}</span>
                </label>
                <Slider
                  id="minReviews"
                  value={[minReviews]}
                  min={0}
                  max={2000}
                  step={50}
                  onValueChange={(vals) => setMinReviews(vals[0])}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0</span>
                  <span>2000+</span>
                </div>
              </div>

              {/* Min Playtime */}
              <div className="space-y-3">
                <label htmlFor="minPlaytime" className="text-sm font-medium flex items-center justify-between">
                  <span>Min Playtime</span>
                  <span className="text-primary font-semibold">{minPlaytime === 0 ? "Any" : `${minPlaytime}h+`}</span>
                </label>
                <Slider
                  id="minPlaytime"
                  value={[minPlaytime]}
                  min={0}
                  max={50}
                  step={1}
                  onValueChange={(vals) => setMinPlaytime(vals[0])}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0h</span>
                  <span>50h+</span>
                </div>
              </div>
            </div>
          </div>

          {/* Apply ボタン */}
          <div className="flex justify-end pt-4">
            <Button onClick={fetchRankings} disabled={loading}>
              {loading ? "Searching..." : "Apply filters"}
            </Button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && !loading && (
          <div className="flex flex-wrap items-center gap-2 p-4 bg-card/50 rounded-lg border">
            <span className="text-sm text-muted-foreground">Active filters:</span>

            {selectedGenre && (
              <Badge variant="secondary" className="gap-2">
                Genre: {selectedGenre}
                <button onClick={() => removeFilter("genre")} className="hover:bg-destructive/20 rounded-full p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {selectedPeriod && (
              <Badge variant="secondary" className="gap-2">
                Period: {PERIOD_OPTIONS.find((p) => p.value === selectedPeriod)?.label}
                <button onClick={() => removeFilter("period")} className="hover:bg-destructive/20 rounded-full p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {selectedSort !== "recommended" && (
              <Badge variant="secondary" className="gap-2">
                Sort: {SORT_OPTIONS.find((s) => s.value === selectedSort)?.label ?? selectedSort}
                <button onClick={() => removeFilter("sort")} className="hover:bg-destructive/20 rounded-full p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {maxPrice !== MAX_PRICE_SLIDER && (
              <Badge variant="secondary" className="gap-2">
                Price ≤ ${maxPrice}
                <button onClick={() => removeFilter("maxPrice")} className="hover:bg-destructive/20 rounded-full p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {minReviews > 0 && (
              <Badge variant="secondary" className="gap-2">
                Reviews ≥ {minReviews}
                <button
                  onClick={() => removeFilter("minReviews")}
                  className="hover:bg-destructive/20 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {minPlaytime > 0 && (
              <Badge variant="secondary" className="gap-2">
                Playtime ≥ {minPlaytime}h
                <button
                  onClick={() => removeFilter("minPlaytime")}
                  className="hover:bg-destructive/20 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="ml-auto">
              Clear All
            </Button>
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((game) => (
              <div key={game.appId} className="relative">
                {/* Gem Label Badge */}
                <div className="absolute -top-3 left-6 z-10">
                  <span
                    className={`inline-block px-4 py-1 rounded-full text-xs font-semibold shadow-lg ${
                      game.gemLabel === "Hidden Gem"
                        ? "bg-accent text-accent-foreground"
                        : game.gemLabel === "Highly rated but not hidden"
                          ? "bg-primary/20 text-primary border border-primary/40"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {game.gemLabel}
                    {game.isStatisticallyHidden && (
                      <span className="ml-2 text-[10px] opacity-70">(&lt;200 reviews or &lt;50K owners)</span>
                    )}
                  </span>
                </div>

                <SearchResultCard
                  appId={game.appId}
                  title={game.title}
                  hiddenGemScore={game.analysis.reviewQualityScore}
                  summary={game.analysis.summary}
                  labels={game.analysis.labels}
                  positiveRatio={game.positiveRatio}
                  totalReviews={game.totalReviews}
                  price={game.price}
                  averagePlaytime={game.averagePlaytime}
                  gameData={game}
                  analysisData={game.analysis}
                />
              </div>
            ))}

            {games.length === 0 && (
              <div className="text-center py-20">
                <p className="text-muted-foreground">No games found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
