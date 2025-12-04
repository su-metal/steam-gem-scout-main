import { useState, useEffect, useRef } from "react";
import { useLocation, type Location } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { SearchResultCard } from "@/components/SearchResultCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
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
  price: number; // セント単位
  priceOriginal?: number | null;
  discountPercent?: number;
  isOnSale?: boolean;
  averagePlaytime: number;
  lastUpdated: string;
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  analysis: HiddenGemAnalysis;
  // gemLabel: GemLabel;
  // isStatisticallyHidden: boolean;
  moodScore?: number;
  finalScore?: number;
  // Edge Function 側で compositeScore を付ける予定（ここでは未使用）
  // compositeScore?: number;
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

type MoodSliderId =
  | "operation"
  | "session"
  | "tension"
  | "story"
  | "brain";

const DEFAULT_MOOD: Record<MoodSliderId, number> = {
  operation: 2,
  session: 2,
  tension: 2,
  story: 2,
  brain: 2,
};

const MOOD_STORAGE_KEY = "rankings_userMood" as const;
const MOOD_SLIDER_MAX = 4;

const MOOD_SLIDERS: Array<{
  id: MoodSliderId;
  label: string;
  left: string;
  right: string;
}> = [
    { id: "operation", label: "操作量", left: "Passive", right: "Active" },
    { id: "session", label: "セッション長", left: "Short", right: "Long" },
    { id: "tension", label: "テンション", left: "Cozy", right: "Intense" },
    {
      id: "story",
      label: "ストーリー密度",
      left: "Story-Light",
      right: "Story-Heavy",
    },
    { id: "brain", label: "思考負荷", left: "Simple", right: "Deep" },
  ];

// 価格スライダーの最大値（ここを変えれば一括で反映）
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
  if (!presetId) {
    return null;
  }

  const lookup = presetId as keyof typeof PRESET_MOOD_BASE;
  const baseMood = PRESET_MOOD_BASE[lookup];
  if (!baseMood) {
    return null;
  }

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
  minPlaytime: "rankings_minPlaytime",
} as const;


export default function SearchPage() {
  const location = useLocation() as Location<SearchPageNavigationState>;
  const navigationState = location.state ?? null;
  const navMoodOverride = computeDesiredMood(
    navigationState?.primaryVibePreset,
    navigationState?.subVibes ?? []
  );
  const [games, setGames] = useState<RankingGame[]>([]);


  // ボトム固定フィルタバー / 詳細フィルタの表示制御
  const [showFilterPanel, setShowFilterPanel] = useState(false); // ボトムから出る詳細フィルタ

  // トップ側クイックフィルタの可視状態を監視するための ref & state
  const topFilterRef = useRef<HTMLDivElement | null>(null);
  const [isTopFilterVisible, setIsTopFilterVisible] = useState(true);


  // ボトムの詳細フィルタパネルを開いている間だけ背景スクロールをロック
  useEffect(() => {
    if (typeof document === "undefined") return;

    document.body.style.overflow = showFilterPanel ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [showFilterPanel]);

  // トップ側のクイックフィルタが画面内に見えているかどうかを監視
  useEffect(() => {
    if (!topFilterRef.current || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsTopFilterVisible(entry.isIntersecting);
      },
      {
        threshold: 0.01,
      }
    );

    observer.observe(topFilterRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);


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

  const [userMood, setUserMood] = useState<Record<MoodSliderId, number>>(() => {
    if (navMoodOverride) {
      return navMoodOverride;
    }
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
    window.localStorage.setItem(STORAGE_KEYS.minPlaytime, String(minPlaytime));
  }, [
    selectedGenre,
    selectedPeriod,
    selectedSort,
    maxPrice,
    minReviews,
    minPlaytime,
  ]);


  const { toast } = useToast();
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
        userMood,
      });

      const { data, error } = await supabase.functions.invoke("search-games", {
        body: {
          genre: selectedGenre || "",
          recentDays: selectedPeriod || "",
          sort: selectedSort,
          minReviews,
          minPlaytime,
          userMood,
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

      // ここからクライアント側フィルタを順番に適用
      let filtered = rankings;

      // 1) Max Price（price はセント想定なので /100）
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

      // 3) Min Playtime（averagePlaytime は分単位なので時間に換算）
      if (minPlaytime > 0) {
        filtered = filtered.filter((game) => {
          const hours = game.averagePlaytime / 60;
          return hours >= minPlaytime;
        });
      }

      console.log(
        `After client filters (price<=${maxPrice}, reviews>=${minReviews}, playtime>=${minPlaytime}h): ${filtered.length} games`
      );

      // --- クライアント側ソート（特に Mood Match 用） ---
      if (selectedSort === "recommended") {
        // Mood Match（moodScore が高い順）で並び替える
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
      // 他の sort（positive-ratio / most-reviews / newest）は
      // すでに search-games 側で並び替え済み想定なので、ここでは追加処理なし。


      setGames(filtered);
      // toast({
      //   title: "Search complete",
      //   description: `Found ${filtered.length} hidden gems`,
      // });

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

  // 詳細フィルタ内側の共通コンテンツ
  const DetailedFilterContent = () => (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-6">
      {/* === Filter Panel ====================================== */}
      <div className="space-y-4 rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_#31235f_0,_#141327_45%,_#050509_100%)] px-4 py-5 md:px-6 md:py-6 shadow-[0_24px_70px_rgba(0,0,0,0.85)]">
        {/* Top row: genre / period / sort */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Genre */}
          <div className="space-y-2">
            <label
              htmlFor="genre"
              className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300"
            >
              Genre
            </label>
            <select
              id="genre"
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-50 shadow-inner focus:outline-none focus:ring-2 focus:ring-pink-400/70"
            >
              <option value="">All genres</option>
              {GENRE_OPTIONS.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div className="space-y-2">
            <label
              htmlFor="period"
              className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300"
            >
              Released within
            </label>
            <select
              id="period"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-50 shadow-inner focus:outline-none focus:ring-2 focus:ring-pink-400/70"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
              Sort by
            </label>
            <div className="flex flex-wrap gap-2">
              {SORT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={
                    selectedSort === option.value ? "default" : "outline"
                  }
                  size="sm"
                  className={
                    selectedSort === option.value
                      ? "rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-cyan-400 border-none text-slate-950 shadow-[0_10px_25px_rgba(0,0,0,0.7)]"
                      : "rounded-full border-white/25 bg-black/30 text-slate-100 hover:bg-black/70 hover:border-white/60"
                  }
                  onClick={() => setSelectedSort(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
            MOOD MATCHING
          </h3>
          <p className="mb-4 text-xs text-slate-400">
            スライダーを動かすと気分マッチ度が検索に反映されます。
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {MOOD_SLIDERS.map((m) => (
              <div key={m.id}>
                <div className="mb-1 flex justify-between text-xs text-slate-300">
                  <span>{m.left}</span>
                  <span>{m.right}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={MOOD_SLIDER_MAX}
                  value={userMood[m.id]}
                  onChange={(e) =>
                    setUserMood((prev) => ({
                      ...prev,
                      [m.id]: Number(e.target.value),
                    }))
                  }
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Additional Filters */}
        <div className="mt-4 border-t border-white/10 pt-4">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
            Additional Filters
          </h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Max Price */}
            <div className="space-y-3">
              <label
                htmlFor="maxPrice"
                className="flex items-center justify-between text-sm font-medium text-slate-100"
              >
                <span>Max Price</span>
                <span className="font-semibold text-pink-300">
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
              <div className="flex justify-between text-xs text-slate-400">
                <span>$0</span>
                <span>{`$${MAX_PRICE_SLIDER}+`}</span>
              </div>
            </div>

            {/* Min Reviews */}
            <div className="space-y-3">
              <label
                htmlFor="minReviews"
                className="flex items-center justify-between text-sm font-medium text-slate-100"
              >
                <span>Min Reviews</span>
                <span className="font-semibold text-pink-300">
                  {minReviews === 0 ? "Any" : `${minReviews}+`}
                </span>
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
              <div className="flex justify-between text-xs text-slate-400">
                <span>0</span>
                <span>2000+</span>
              </div>
            </div>

            {/* Min Playtime */}
            <div className="space-y-3">
              <label
                htmlFor="minPlaytime"
                className="flex items-center justify-between text-sm font-medium text-slate-100"
              >
                <span>Min Playtime</span>
                <span className="font-semibold text-pink-300">
                  {minPlaytime === 0 ? "Any" : `${minPlaytime}h+`}
                </span>
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
              <div className="flex justify-between text-xs text-slate-400">
                <span>0h</span>
                <span>50h+</span>
              </div>
            </div>
          </div>
        </div>

        {/* Apply Button */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={() => {
              fetchRankings();
              setShowFilterPanel(false); // ボトムの詳細フィルタを閉じる
            }}
            disabled={loading}
            className="rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-cyan-400 px-6 text-slate-950 font-semibold shadow-[0_14px_40px_rgba(0,0,0,0.75)] hover:brightness-105"
          >
            {loading ? "Searching..." : "Apply filters"}
          </Button>

        </div>

      </div>
    </div>
  );

  // トップ / ボトム共通のクイックフィルタバー
  const QuickFilterBar = () => (
    <div className="max-w-7xl mx-auto rounded-2xl border border-white/15 bg-black/80 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3">
      {/* 左側：Quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-300/90">Quick filters:</span>

        <button
          onClick={() => setSelectedSort("recommended")}
          className="px-3 py-1 rounded-full text-[11px] bg-gradient-to-r from-pink-500 via-fuchsia-500 to-cyan-400 text-black font-semibold shadow-md hover:brightness-110"
        >
          人気の隠れた名作
        </button>

        <button
          onClick={() => setSelectedGenre("Relaxing")}
          className="px-3 py-1 rounded-full text-[11px] bg-white/10 border border-white/20 text-slate-200 hover:bg-white/20"
        >
          まったり
        </button>

        <button
          onClick={() => setSelectedGenre("Horror")}
          className="px-3 py-1 rounded-full text-[11px] bg-white/10 border border-white/20 text-slate-200 hover:bg-white/20"
        >
          緊張感
        </button>

        <button
          onClick={() => setSelectedGenre("RPG")}
          className="px-3 py-1 rounded-full text-[11px] bg-white/10 border border-white/20 text-slate-200 hover:bg-white/20"
        >
          ストーリー
        </button>
      </div>

      {/* 右側：詳細フィルタ / リセット */}
      <div className="flex items-center gap-2">
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-[11px] text-slate-200/90 underline underline-offset-2 hover:opacity-80"
          >
            条件リセット
          </button>
        )}

        <Button
          type="button"
          size="sm"
          onClick={() => setShowFilterPanel(true)}
          className="h-8 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-cyan-400 px-3 text-[11px] font-semibold text-slate-950 shadow-[0_14px_40px_rgba(0,0,0,0.75)]"
        >
          詳細フィルタ
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f163a_0,_#050509_50%,_#020008_100%)] text-slate-50">
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-32 space-y-8">
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

            {/* <Button
              variant="outline"
              asChild
              className="rounded-full border-white/25 bg-black/30 text-slate-100 hover:bg-black/70 hover:border-white/60"
            >
              <a href="/wishlist">Wishlist</a>
            </Button> */}
          </div>
        </div>

        {/* === Active Filter Chips ================================ */}
        {hasActiveFilters && !loading && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
            <span className="text-xs text-slate-300/90">
              Active filters:
            </span>

            {selectedGenre && (
              <Badge variant="secondary" className="gap-2 rounded-full bg-[#181626] border-white/20">
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
              <Badge variant="secondary" className="gap-2 rounded-full bg-[#181626] border-white/20">
                Period:{" "}
                {
                  PERIOD_OPTIONS.find((p) => p.value === selectedPeriod)
                    ?.label
                }
                <button
                  onClick={() => removeFilter("period")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {selectedSort !== "recommended" && (
              <Badge variant="secondary" className="gap-2 rounded-full bg-[#181626] border-white/20">
                Sort:{" "}
                {
                  SORT_OPTIONS.find((s) => s.value === selectedSort)
                    ?.label
                }
                <button
                  onClick={() => removeFilter("sort")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {maxPrice !== MAX_PRICE_SLIDER && (
              <Badge variant="secondary" className="gap-2 rounded-full bg-[#181626] border-white/20">
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
              <Badge variant="secondary" className="gap-2 rounded-full bg-[#181626] border-white/20">
                Reviews ≥ {minReviews}
                <button
                  onClick={() => removeFilter("minReviews")}
                  className="rounded-full p-0.5 hover:bg-rose-500/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {minPlaytime > 0 && (
              <Badge variant="secondary" className="gap-2 rounded-full bg-[#181626] border-white/20">
                Playtime ≥ {minPlaytime}h
                <button
                  onClick={() => removeFilter("minPlaytime")}
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
        {/* === Top Quick Filter Bar =============================== */}
        <div ref={topFilterRef} className="mt-4">
          <QuickFilterBar />
        </div>

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
            {games.map((game) => {


              return (
                <div key={game.appId} className="relative h-full">
                  {/* Gem Label Badge */}
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
              );
            })}

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

        {/* 🔍 一時的なデバッグ表示ここから */}
        <pre className="mt-4 text-[10px] leading-relaxed text-slate-300 bg-black/40 p-3 rounded-lg border border-white/10">
          navMoodOverride: {JSON.stringify(navMoodOverride)}
          {"\n"}
          userMood: {JSON.stringify(userMood)}
        </pre>
        {/* 🔍 一時的なデバッグ表示ここまで */}

        {/* === Bottom Fixed Filter Bar ================================== */}
        {!isTopFilterVisible && (
          <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 pt-2 md:px-8">
            <QuickFilterBar />
          </div>
        )}

        {/* === Bottom Sheet: Detailed Filters ============================ */}
        {showFilterPanel && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-5xl rounded-t-3xl bg-[radial-gradient(circle_at_top,_#1f163a_0,_#050509_55%,_#020008_100%)] shadow-[0_-24px_70px_rgba(0,0,0,0.9)] max-h-[95vh] overflow-y-auto">
              {/* ヘッダー行 */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2 md:px-6">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                  Search Filters
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowFilterPanel(false)}
                  className="h-8 w-8 rounded-full text-slate-200 hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* 中身は既存の DetailedFilterContent をそのまま再利用 */}
              <DetailedFilterContent />
            </div>
          </div>
        )}

      </div>
    </div>
  );

}

