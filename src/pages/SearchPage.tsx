import { useState, useEffect, useRef } from "react";
import { useLocation, type Location } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { SearchResultCard } from "@/components/SearchResultCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
  Filter,
} from "lucide-react";


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
  statGemScore?: number; // ← 追加（バックエンドのAIスコア）
  aiError?: boolean;
}

interface RankingGame {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number; // セント単位ではなく「ドル相当」で使っている前提
  priceOriginal?: number | null;
  discountPercent?: number;
  isOnSale?: boolean;
  averagePlaytime: number;
  lastUpdated: string;
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  analysis: HiddenGemAnalysis;
  moodScore?: number;
  finalScore?: number;
  screenshots?: {
    full?: string;
    thumbnail?: string;
  }[];
}

interface SearchPageNavigationState {
  primaryVibePreset?: string;
  subVibes?: string[];
}

// -----------------------------
// 定数
// -----------------------------
const GENRE_OPTIONS = [
  "Action",
  "Adventure",
  "FPS",
  "Roguelike",
  "Deckbuilding",
  "RPG",
  "Puzzle",
  "Strategy",
  "Sports",
  "Racing",
  "Narrative",
  "Relaxing",
  "Horror",
  "Casual",
  "Indie",
];

const AI_TAG_OPTIONS = [
  "Souls-like",
  "Deckbuilder",
  "Rhythm",
  "JRPG",
  "Metroidvania",
  "Survival",
  "Shooter",
  "Cozy",
];

const PERIOD_OPTIONS = [
  { label: "All time", value: "" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "Last 1 year", value: "365" },
  { label: "Last 2 years", value: "730" },
];

const SORT_OPTIONS = [
  { label: "Mood Match", value: "recommended" },
  { label: "Positive %", value: "positive-ratio" },
  { label: "Reviews", value: "most-reviews" },
  { label: "Recentness", value: "newest" },
];

type SortOptionKey = "recommended" | "positive-ratio" | "most-reviews" | "newest";

interface FilterState {
  sort: SortOptionKey;
  genre: string;
  period: string;
  priceMin: number;
  priceMax: number;
  reviewCountMin: number;
  reviewCountMax: number;
  aiTags: string[];
  excludeEarlyAccess: boolean;
  excludeMultiplayerOnly: boolean;
  excludeHorror: boolean;
}


type MoodSliderId = "operation" | "session" | "tension" | "story" | "brain";

const DEFAULT_MOOD: Record<MoodSliderId, number> = {
  operation: 2,
  session: 2,
  tension: 2,
  story: 2,
  brain: 2,
};

const MOOD_STORAGE_KEY = "rankings_userMood" as const;
const MOOD_SLIDER_MAX = 4;

// プリセットからの userMood 計算用（VIBE / Experience Focus 用）
const PRESET_MOOD_BASE: Record<
  "Chill" | "Focus" | "Story" | "Speed" | "Short",
  Record<MoodSliderId, number>
> = {
  Chill: {
    brain: 0.4,
    story: 0.8,
    session: 3.6,
    tension: 0.4,
    operation: 0.8,
  },
  Focus: {
    brain: 3.6,
    story: 1.2,
    session: 1.6,
    tension: 2,
    operation: 3.2,
  },
  Story: {
    brain: 0.8,
    story: 3.8,
    session: 1.2,
    tension: 0.8,
    operation: 1.2,
  },
  Speed: {
    brain: 1.6,
    story: 0.4,
    session: 0.8,
    tension: 3.6,
    operation: 2.8,
  },
  Short: {
    brain: 1.2,
    story: 1.6,
    session: 3.8,
    tension: 1.2,
    operation: 2,
  },
};

const SUB_VIBE_MOOD_MODIFIERS: Record<
  string,
  Partial<Record<MoodSliderId, number>>
> = {
  cozy: { tension: -1, brain: -0.2, session: 0.3, operation: -0.3 },
  emotional: { story: 0.8, tension: -0.4, brain: -0.2 },
  difficult: { tension: 1.2, brain: 0.5, operation: 0.2 },
  "puzzle-lite": { brain: 0.7, tension: -0.6, session: 0.2 },
  atmospheric: { story: 0.6, tension: -0.5, session: 0.2, operation: -0.1 },
  humor: { tension: -0.7, session: 0.4, story: 0.3 },
  strategic: { brain: 1, operation: 0.4, session: -0.1, tension: 0.2 },
};

const clampMoodValue = (value: number) => {
  if (value < 0) return 0;
  if (value > MOOD_SLIDER_MAX) return MOOD_SLIDER_MAX;
  return value;
};

const computeDesiredMood = (
  presetId?: string,
  subVibes: string[] = []
): Record<MoodSliderId, number> | null => {
  if (!presetId) return null;

  const lookup = presetId as keyof typeof PRESET_MOOD_BASE;
  const baseMood = PRESET_MOOD_BASE[lookup];
  if (!baseMood) return null;

  const mood: Record<MoodSliderId, number> = { ...baseMood };

  subVibes.forEach((subVibeId) => {
    const modifiers = SUB_VIBE_MOOD_MODIFIERS[subVibeId];
    if (!modifiers) return;

    (Object.keys(modifiers) as MoodSliderId[]).forEach((axis) => {
      const delta = modifiers[axis];
      if (typeof delta !== "number") return;
      mood[axis] = clampMoodValue((mood[axis] ?? DEFAULT_MOOD[axis]) + delta);
    });
  });

  return mood;
};

const MAX_PRICE_SLIDER = 60;

// フィルター状態保存用の localStorage キー
const STORAGE_KEYS = {
  genre: "rankings_selectedGenre",
  period: "rankings_selectedPeriod",
  sort: "rankings_selectedSort",
  maxPrice: "rankings_maxPrice",
  minReviews: "rankings_minReviews",
} as const;

// -----------------------------------------
// SearchPage
// -----------------------------------------
export default function SearchPage() {
  const location = useLocation() as Location<SearchPageNavigationState>;
  const navigationState = location.state ?? null;
  const navMoodOverride = computeDesiredMood(
    navigationState?.primaryVibePreset,
    navigationState?.subVibes ?? []
  );

  const [games, setGames] = useState<RankingGame[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- フィルター state（localStorage から復元） ----
  const [selectedGenre, setSelectedGenre] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEYS.genre) ?? "";
  });

  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    if (typeof window === "undefined") return "90";
    return window.localStorage.getItem(STORAGE_KEYS.period) ?? "90";
  });

  const [selectedSort, setSelectedSort] = useState<string>(() => {
    if (typeof window === "undefined") return "recommended";
    return window.localStorage.getItem(STORAGE_KEYS.sort) ?? "recommended";
  });

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

  // 新 UI 用: AI Tags / Exclusions
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [excludeEarlyAccess, setExcludeEarlyAccess] = useState(false);
  const [excludeMultiplayerOnly, setExcludeMultiplayerOnly] = useState(false);
  const [excludeHorror, setExcludeHorror] = useState(false);

  // userMood は VIBE / Experience Focus からの引き継ぎのみ（UIでは編集しない）
  const [userMood, setUserMood] = useState<Record<MoodSliderId, number>>(() => {
    if (navMoodOverride) return navMoodOverride;
    if (typeof window === "undefined") {
      return { ...DEFAULT_MOOD };
    }
    const stored = window.localStorage.getItem(MOOD_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_MOOD };
    try {
      const parsed = JSON.parse(stored) as Partial<Record<MoodSliderId, number>>;
      return { ...DEFAULT_MOOD, ...parsed };
    } catch {
      return { ...DEFAULT_MOOD };
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MOOD_STORAGE_KEY, JSON.stringify(userMood));
  }, [userMood]);

  // フィルターが変わるたびに localStorage に保存
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(STORAGE_KEYS.genre, selectedGenre);
    window.localStorage.setItem(STORAGE_KEYS.period, selectedPeriod);
    window.localStorage.setItem(STORAGE_KEYS.sort, selectedSort);
    window.localStorage.setItem(STORAGE_KEYS.maxPrice, String(maxPrice));
    window.localStorage.setItem(STORAGE_KEYS.minReviews, String(minReviews));
  }, [selectedGenre, selectedPeriod, selectedSort, maxPrice, minReviews]);

  const { toast } = useToast();

  // 初回ロード
  useEffect(() => {
    fetchRankings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRankings = async () => {
    setLoading(true);
    try {
      console.log("Searching hidden gems with filters:", {
        genre: selectedGenre || "all",
        period: selectedPeriod || "all time",
        sort: selectedSort,
        maxPrice,
        minReviews,
        aiTags,
        excludeEarlyAccess,
        excludeMultiplayerOnly,
        excludeHorror,
        userMood,
      });

      const { data, error } = await supabase.functions.invoke("search-games", {
        body: {
          // 既存の API 用パラメータ
          genre: selectedGenre || "",
          recentDays: selectedPeriod || "",
          sort: selectedSort,
          minReviews,
          userMood,
          // 新仕様向けパラメータ（バックエンド側で順次対応する想定）
          priceMin: 0,
          priceMax: maxPrice === MAX_PRICE_SLIDER ? null : maxPrice,
          reviewCountMin: minReviews || null,
          reviewCountMax: null,
          aiTags,
          excludeEarlyAccess,
          excludeMultiplayerOnly,
          excludeHorror,
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

      // クライアント側フィルタ
      let filtered = rankings;

      // 1) Max Price
      if (maxPrice !== MAX_PRICE_SLIDER) {
        filtered = filtered.filter((game) => {
          const priceInDollars =
            typeof game.price === "number" && Number.isFinite(game.price)
              ? game.price
              : 0;
          return priceInDollars <= maxPrice;
        });
      }

      // 2) Min Reviews
      if (minReviews > 0) {
        filtered = filtered.filter((game) => game.totalReviews >= minReviews);
      }

      console.log(
        `After client filters (price<=${maxPrice}, reviews>=${minReviews}): ${filtered.length} games`
      );

      // Mood Match ソート（その他はサーバ側の並びを採用）
      if (selectedSort === "recommended") {
        filtered = [...filtered].sort((a, b) => {
          const scoreA =
            a.moodScore ??
            a.finalScore ??
            a.analysis?.statGemScore ??
            Number.NEGATIVE_INFINITY;
          const scoreB =
            b.moodScore ??
            b.finalScore ??
            b.analysis?.statGemScore ??
            Number.NEGATIVE_INFINITY;
          return scoreB - scoreA;
        });
      }

      setGames(filtered);
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
    setAiTags([]);
    setExcludeEarlyAccess(false);
    setExcludeMultiplayerOnly(false);
    setExcludeHorror(false);
    setUserMood({ ...DEFAULT_MOOD });
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
      case "aiTags":
        setAiTags([]);
        break;
      case "excludeEarlyAccess":
        setExcludeEarlyAccess(false);
        break;
      case "excludeMultiplayerOnly":
        setExcludeMultiplayerOnly(false);
        break;
      case "excludeHorror":
        setExcludeHorror(false);
        break;
    }
  };

  const hasActiveFilters =
    selectedGenre ||
    selectedPeriod ||
    selectedSort !== "recommended" ||
    maxPrice !== MAX_PRICE_SLIDER ||
    minReviews > 0 ||
    aiTags.length > 0 ||
    excludeEarlyAccess ||
    excludeMultiplayerOnly ||
    excludeHorror;

  // ---- UI 用にまとめた現在のフィルター値 ----
  const currentFilters: FilterState = {
    sort: selectedSort as SortOptionKey,
    genre: selectedGenre,
    period: selectedPeriod,
    priceMin: 0,
    priceMax: maxPrice,
    reviewCountMin: minReviews,
    reviewCountMax: 10000,
    aiTags,
    excludeEarlyAccess,
    excludeMultiplayerOnly,
    excludeHorror,
  };

  const handleApplyFilters = (next: FilterState) => {
    // SearchPage 側の state に書き戻す
    setSelectedSort(next.sort);
    setSelectedGenre(next.genre);
    setSelectedPeriod(next.period);
    setMaxPrice(next.priceMax);
    setMinReviews(next.reviewCountMin);
    setAiTags(next.aiTags);
    setExcludeEarlyAccess(next.excludeEarlyAccess);
    setExcludeMultiplayerOnly(next.excludeMultiplayerOnly);
    setExcludeHorror(next.excludeHorror);

    // 実際の検索を実行
    fetchRankings();
  };

  const handleResetFilters = () => {
    // 既存の clearAllFilters を使って全リセット
    clearAllFilters();
    // リセット後の条件で検索を掛け直す
    fetchRankings();
  };


  return (
    <div className="relative min-h-screen bg-[#02040a] text-slate-100 font-sans selection:bg-cyan-500/30 overflow-x-hidden">
      {/* --- Background Effects (Matching VIBE Screenshot) --- */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Deep gradient base */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_#1e1b4b_0%,_#020617_60%)] opacity-80" />

        {/* Dot pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />

        {/* Floating Shapes */}
        <div className="absolute top-[15%] left-[10%] w-64 h-64 bg-cyan-900/20 rounded-full blur-[80px]" />
        <div className="absolute bottom-[20%] right-[5%] w-96 h-96 bg-purple-900/10 rounded-full blur-[100px]" />

        {/* Geometric Decor elements */}
        <div className="absolute top-[20%] left-[5%] opacity-10">
          <div className="w-0 h-0 border-l-[30px] border-l-transparent border-t-[50px] border-t-cyan-500 border-r-[30px] border-r-transparent rotate-[-15deg]" />
        </div>
        <div className="absolute top-[40%] right-[10%] opacity-10">
          <div className="w-16 h-16 border-4 border-purple-500 rounded-full" />
        </div>
      </div>
      <div className="relative z-10 max-w-7xl mx-auto px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-32 space-y-8">
        {/* === Page Header ======================================= */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Hidden Gems / Search
            </p>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-pink-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              Find Your Next Steam Gem
            </h1>
            <p className="text-xs md:text-sm text-slate-300/90">
              ジャンル・期間・価格などを組み合わせて、
              <span className="font-semibold text-sky-300">
                「まだバズっていない良作」
              </span>
              を絞り込みます。
            </p>
          </div>

          {/* Right side: navigation buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              asChild
              className="rounded-full border-white/25 bg-black/30 text-slate-100 hover:bg-black/70 hover:border-white/60"
            >
              <a href="/">
                <Home className="w-4 h-4 mr-2" />
                Home
              </a>
            </Button>
          </div>
        </div>

        {/* === Active Filter Chips ================================ */}
        {hasActiveFilters && !loading && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
            <span className="text-xs text-slate-300/90">Active filters:</span>

            {selectedGenre && (
              <Badge
                variant="secondary"
                className="gap-2 rounded-full bg-[#181626] border-white/20"
              >
                Genre: {selectedGenre}
                <button
                  onClick={() => removeFilter("genre")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {selectedPeriod && (
              <Badge
                variant="secondary"
                className="gap-2 rounded-full bg-[#181626] border-white/20"
              >
                Period:{" "}
                {PERIOD_OPTIONS.find((p) => p.value === selectedPeriod)?.label}
                <button
                  onClick={() => removeFilter("period")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {selectedSort !== "recommended" && (
              <Badge
                variant="secondary"
                className="gap-2 rounded-full bg-[#181626] border-white/20"
              >
                Sort: {SORT_OPTIONS.find((s) => s.value === selectedSort)?.label}
                <button
                  onClick={() => removeFilter("sort")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {maxPrice !== MAX_PRICE_SLIDER && (
              <Badge
                variant="secondary"
                className="gap-2 rounded-full bg-[#181626] border-white/20"
              >
                Price ≤ ${maxPrice}
                <button
                  onClick={() => removeFilter("maxPrice")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {minReviews > 0 && (
              <Badge
                variant="secondary"
                className="gap-2 rounded-full bg-[#181626] border-white/20"
              >
                Reviews ≥ {minReviews}
                <button
                  onClick={() => removeFilter("minReviews")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {aiTags.length > 0 && (
              <Badge
                variant="secondary"
                className="gap-2 rounded-full bg-[#181626] border-white/20"
              >
                Tags: {aiTags.join(", ")}
                <button
                  onClick={() => removeFilter("aiTags")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {excludeEarlyAccess && (
              <Badge
                variant="secondary"
                className="gap-2 rounded-full bg-[#181626] border-white/20"
              >
                Excl. Early Access
                <button
                  onClick={() => removeFilter("excludeEarlyAccess")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {excludeMultiplayerOnly && (
              <Badge
                variant="secondary"
                className="gap-2 rounded-full bg-[#181626] border-white/20"
              >
                Excl. Multiplayer-only
                <button
                  onClick={() => removeFilter("excludeMultiplayerOnly")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {excludeHorror && (
              <Badge
                variant="secondary"
                className="gap-2 rounded-full bg-[#181626] border-white/20"
              >
                Excl. Horror
                <button
                  onClick={() => removeFilter("excludeHorror")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="ml-auto text-xs text-slate-200 hover:bg-rose-500/10 rounded-full px-3"
            >
              Clear All
            </Button>
          </div>
        )}

        {/* === Detail Filters Panel（インライン / 新デザイン） === */}
        {/* === Detail Filters Panel（インライン / 新デザイン） === */}

        <SearchPageFilters
          initialFilters={currentFilters}
          loading={loading}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
        />


        {/* === Results ============================================ */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 md:gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton
                key={i}
                className="h-72 w-full rounded-[26px] bg-[#070716] border border-white/10"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 md:gap-5">
            {games.map((game) => (
              <div key={game.appId} className="relative h-full">
                <SearchResultCard
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
                  screenshots={game.screenshots}
                />
              </div>
            ))}

            {games.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-sm text-slate-400">
                  条件に合うゲームが見つかりませんでした。
                  フィルターを少しゆるめてみてください。
                </p>
              </div>
            )}
          </div>
        )}

        {/* 🔍 デバッグ表示（必要なければあとで削除） */}
        <pre className="mt-4 text-[10px] leading-relaxed text-slate-300 bg-black/40 p-3 rounded-lg border border-white/10">
          navMoodOverride: {JSON.stringify(navMoodOverride)}
          {"\n"}
          userMood: {JSON.stringify(userMood)}
        </pre>
      </div>
    </div>
  );
}

// -----------------------------------------
// 小さめのプレゼン用コンポーネント
// -----------------------------------------
type ToggleCheckboxProps = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}


function Chip({ label, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200",
        active
          ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
          : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200",
      ].join(" ")}
    >
      {label}
    </button>
  );
}


interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-left hover:bg-slate-800/80 transition"
    >
      <div>
        <p className="text-[11px] font-medium text-slate-100">{label}</p>
        {description && (
          <p className="mt-0.5 text-[10px] text-slate-400">{description}</p>
        )}
      </div>
      <span
        className={[
          "inline-flex h-4 w-7 items-center rounded-full p-[2px] transition",
          checked ? "bg-sky-400" : "bg-slate-700/80",
        ].join(" ")}
      >
        <span
          className={[
            "h-3 w-3 rounded-full bg-white shadow-sm transform transition-transform",
            checked ? "translate-x-3" : "translate-x-0",
          ].join(" ")}
        />
      </span>
    </button>
  );
}

interface DualRangeSliderProps {
  label: string;
  unit?: string;
  min: number;
  max: number;
  minVal: number;
  maxVal: number;
  onChange: (min: number, max: number) => void;
}

function DualRangeSlider({
  label,
  unit = "",
  min,
  max,
  minVal,
  maxVal,
  onChange,
}: DualRangeSliderProps) {
  const [minState, setMinState] = useState(minVal);
  const [maxState, setMaxState] = useState(maxVal);
  const minValRef = useRef(minVal);
  const maxValRef = useRef(maxVal);
  const range = useRef<HTMLDivElement | null>(null);

  const getPercent = (value: number) =>
    Math.round(((value - min) / (max - min)) * 100);

  // バーの塗りつぶし部分を更新
  useEffect(() => {
    const minPercent = getPercent(minValRef.current);
    const maxPercent = getPercent(maxValRef.current);

    if (range.current) {
      range.current.style.left = `${minPercent}%`;
      range.current.style.right = `${100 - maxPercent}%`;
    }
  }, [minState, maxState, min, max]);

  // 外側から値が変わったときに同期
  useEffect(() => {
    setMinState(minVal);
    setMaxState(maxVal);
    minValRef.current = minVal;
    maxValRef.current = maxVal;
  }, [minVal, maxVal]);

  const handleMinChange = (value: number) => {
    const clamped = Math.min(value, maxState - 1);
    setMinState(clamped);
    minValRef.current = clamped;
    onChange(clamped, maxState);
  };

  const handleMaxChange = (value: number) => {
    const clamped = Math.max(value, minState + 1);
    setMaxState(clamped);
    maxValRef.current = clamped;
    onChange(minState, clamped);
  };

  return (
    <div className="w-full py-3">
      <div className="flex justify-between mb-2">
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
        <span className="text-cyan-400 text-xs font-bold">
          {unit}
          {minState.toLocaleString()} – {unit}
          {maxState.toLocaleString()}
        </span>
      </div>

      <div className="relative h-1.5 rounded-full bg-slate-800/80">
        <div
          ref={range}
          className="absolute h-1.5 rounded-full bg-gradient-to-r from-sky-400 to-indigo-400"
        />
      </div>

      <div className="relative mt-2 h-4">
        {/* min */}
        <input
          type="range"
          min={min}
          max={max}
          value={minState}
          onChange={(e) => handleMinChange(Number(e.target.value))}
          className="absolute w-full h-4 appearance-none bg-transparent pointer-events-auto"
        />
        {/* max */}
        <input
          type="range"
          min={min}
          max={max}
          value={maxState}
          onChange={(e) => handleMaxChange(Number(e.target.value))}
          className="absolute w-full h-4 appearance-none bg-transparent pointer-events-auto"
        />
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>
          {unit}
          {min.toLocaleString()}
        </span>
        <span>
          {unit}
          {max.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

interface SearchPageFiltersProps {
  initialFilters: FilterState;
  loading: boolean;
  onApply: (filters: FilterState) => void;
  onReset: () => void;
}

function SearchPageFilters({
  initialFilters,
  loading,
  onApply,
  onReset,
}: SearchPageFiltersProps) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const toggleFiltersOpen = () => {
    setIsFiltersOpen((prev) => !prev);
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSection((prev) => (prev === sectionId ? null : sectionId));
  };

  const SectionHeader = ({
    title,
    id,
  }: {
    title: string;
    id: string;
  }) => (
    <div
      className="flex items-center justify-between py-4 md:py-2 cursor-pointer md:cursor-default group"
      onClick={() => toggleSection(id)}
    >
      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-[0.18em] group-hover:text-white transition-colors">
        {title}
      </h3>
      <span className="md:hidden text-slate-500">
        {expandedSection === id ? (
          <ChevronUp size={16} />
        ) : (
          <ChevronDown size={16} />
        )}
      </span>
    </div>
  );

  // SearchPage 側の state 変更と同期
  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const toggleGenre = (genre: string) => {
    setFilters((prev) => ({
      ...prev,
      genre: prev.genre === genre ? "" : genre,
    }));
  };

  const toggleAiTag = (tag: string) => {
    setFilters((prev) => ({
      ...prev,
      aiTags: prev.aiTags.includes(tag)
        ? prev.aiTags.filter((t) => t !== tag)
        : [...prev.aiTags, tag],
    }));
  };

  const handleApply = () => {
    setIsFiltersOpen(false);
    onApply(filters);
  };

  const handleReset = () => {
    onReset();
  };

  return (
    <section
      id="detail-filters"
      className="relative rounded-3xl border border-white/10 bg-slate-900/70 backdrop-blur-xl overflow-hidden shadow-2xl"
    >
      {/* 背景グロー（ヘッダー＆コンテンツの下に敷く） */}
      <div className="pointer-events-none absolute top-0 right-0 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl" />

      {/* ヘッダー行：カード最上部に密着させる */}
      <button
        type="button"
        onClick={toggleFiltersOpen}
        aria-expanded={isFiltersOpen}
        className="relative z-10 flex w-full items-center justify-between px-4 py-3 md:px-6 md:py-4 bg-gradient-to-r from-slate-900/80 via-slate-900/60 to-cyan-900/40"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950/80 border border-white/15 text-cyan-300">
            <Filter size={20} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.35em] text-white">
            Filters & Refinement
          </span>
        </div>
        {isFiltersOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {/* 展開時のみ、ヘッダー直下にコンテンツを表示 */}
      {isFiltersOpen && (
        <div className="relative z-10 border-t border-white/10 px-4 md:px-6 py-4 md:py-6 space-y-5 bg-slate-900/70/80　overflow-hidden transform-gpu transition-all duration-300 ease-out">

          <div className="space-y-5">
            {/* Sort */}
            <div className="border-b border-white/5 pb-4 md:pb-6">
              <SectionHeader title="Sort By" id="sort" />

              <div
                className={`${expandedSection === "sort" ? "block" : "hidden"
                  } md:block mt-2`}
              >
                <div className="flex flex-wrap gap-3">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          sort: opt.value as SortOptionKey,
                        }))
                      }
                      className={[
                        "px-4 py-2 rounded-full text-xs md:text-sm font-medium transition-all",
                        filters.sort === opt.value
                          ? "bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-900 shadow-[0_0_25px_rgba(34,211,238,0.7)]"
                          : "bg-slate-800/80 text-slate-300 border border-slate-600 hover:border-cyan-400/60 hover:text-white",
                      ].join(" ")}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Genre */}
            <div className="border-b border-white/5 pb-4 md:pb-5">
              <SectionHeader title="Genres" id="genres" />

              <div
                className={`${expandedSection === "genres" ? "block" : "hidden"
                  } md:block mt-1`}
              >
                <div className="flex flex-wrap gap-1.5">
                  {GENRE_OPTIONS.map((genre) => (
                    <Chip
                      key={genre}
                      label={genre}
                      active={filters.genre === genre}
                      onClick={() => toggleGenre(genre)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* AI Tags */}
            <div className="border-b border-white/5 pb-4 md:pb-5">
              <SectionHeader title="AI Tags" id="aiTags" />

              <div
                className={`${expandedSection === "aiTags" ? "block" : "hidden"
                  } md:block mt-1`}
              >
                <div className="flex flex-wrap gap-1.5">
                  {AI_TAG_OPTIONS.map((tag) => (
                    <Chip
                      key={tag}
                      label={`#${tag}`}
                      active={filters.aiTags.includes(tag)}
                      onClick={() => toggleAiTag(tag)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Range + Exclusions */}
            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-[1.1fr_1fr] md:gap-6 md:rounded-2xl md:border md:border-white/10 md:bg-slate-900/90 md:px-6 md:py-6 md:shadow-[0_18px_45px_rgba(15,23,42,0.9)]">
              {/* Range section */}
              <div className="border-b border-white/5 pb-4 md:border-0 md:pb-0 md:pr-12 md:border-r md:border-slate-700/60">
                <SectionHeader title="Range" id="range" />

                <div
                  className={`${expandedSection === "range" ? "block" : "hidden"
                    } md:block mt-1 space-y-4`}
                >
                  <DualRangeSlider
                    label="Price"
                    unit="$"
                    min={0}
                    max={MAX_PRICE_SLIDER}
                    minVal={filters.priceMin}
                    maxVal={filters.priceMax}
                    onChange={(min, max) =>
                      setFilters((prev) => ({
                        ...prev,
                        priceMin: min,
                        priceMax: max,
                      }))
                    }
                  />
                  <DualRangeSlider
                    label="Reviews"
                    min={0}
                    max={10000}
                    minVal={filters.reviewCountMin}
                    maxVal={filters.reviewCountMax}
                    onChange={(min, max) =>
                      setFilters((prev) => ({
                        ...prev,
                        reviewCountMin: min,
                        reviewCountMax: max,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Exclusions section */}
              <div className="border-b border-white/5 pb-4 md:border-0 md:pb-0 md:pl-6">
                <SectionHeader title="Exclusions" id="exclusions" />

                <div
                  className={`${expandedSection === "exclusions" ? "block" : "hidden"
                    } md:block mt-1 space-y-3`}
                >
                  {/* Exclude Early Access */}
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        excludeEarlyAccess: !prev.excludeEarlyAccess,
                      }))
                    }
                    className="flex items-center justify-between w-full py-2"
                  >
                    <span className="text-sm text-slate-300">
                      Exclude Early Access
                    </span>
                    <span
                      className={[
                        "relative inline-flex w-11 h-6 items-center rounded-full transition-colors duration-200",
                        filters.excludeEarlyAccess
                          ? "bg-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.6)]"
                          : "bg-slate-700",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-200",
                          filters.excludeEarlyAccess
                            ? "translate-x-5"
                            : "translate-x-1",
                        ].join(" ")}
                      />
                    </span>
                  </button>

                  {/* Exclude Multiplayer Only */}
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        excludeMultiplayerOnly:
                          !prev.excludeMultiplayerOnly,
                      }))
                    }
                    className="flex items-center justify-between w-full py-2"
                  >
                    <span className="text-sm text-slate-300">
                      Exclude Multiplayer Only
                    </span>
                    <span
                      className={[
                        "relative inline-flex w-11 h-6 items-center rounded-full transition-colors duration-200",
                        filters.excludeMultiplayerOnly
                          ? "bg-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.6)]"
                          : "bg-slate-700",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-200",
                          filters.excludeMultiplayerOnly
                            ? "translate-x-5"
                            : "translate-x-1",
                        ].join(" ")}
                      />
                    </span>
                  </button>

                  {/* Exclude Horror */}
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        excludeHorror: !prev.excludeHorror,
                      }))
                    }
                    className="flex items-center justify-between w-full py-2"
                  >
                    <span className="text-sm text-slate-300">
                      Exclude Horror
                    </span>
                    <span
                      className={[
                        "relative inline-flex w-11 h-6 items-center rounded-full transition-colors duration-200",
                        filters.excludeHorror
                          ? "bg-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.6)]"
                          : "bg-slate-700",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-200",
                          filters.excludeHorror
                            ? "translate-x-5"
                            : "translate-x-1",
                        ].join(" ")}
                      />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RESET / APPLY 行（カード下端） */}
          <div className="mt-5 md:mt-6 flex flex-row flex-nowrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 text-xs md:text-sm text-slate-300 hover:text-white transition-colors"
            >
              <RefreshCw size={16} />
              <span>RESET</span>
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-2.5 text-xs md:text-sm font-semibold text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.8)] hover:bg-cyan-400 transition-transform duration-150 active:scale-95 disabled:opacity-60"
            >
              <Check size={18} strokeWidth={3} />
              <span>{loading ? "Searching..." : "APPLY FILTERS"}</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}



function ToggleCheckbox({ label, checked, onChange }: ToggleCheckboxProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-2 rounded-2xl border border-white/12 bg-slate-900/50 px-3 py-2 text-[11px] text-left hover:bg-slate-800/80 transition"
    >
      <span className="text-slate-100 text-[11px] leading-snug flex-1 mr-2">
        {label}
      </span>
      <span
        className={[
          "inline-flex h-4 w-7 items-center rounded-full p-[2px] transition",
          checked ? "bg-sky-400" : "bg-slate-700/80",
        ].join(" ")}
      >
        <span
          className={[
            "h-3 w-3 rounded-full bg-white shadow-sm transform transition-transform",
            checked ? "translate-x-3" : "translate-x-0",
          ].join(" ")}
        />
      </span>
    </button>
  );
}
