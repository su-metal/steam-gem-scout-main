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
  statGemScore?: number; // ← オプショナルに
  aiError?: boolean;
}


type GemLabel =
  | "Hidden Gem"
  | "Improved Hidden Gem"
  | "Emerging Gem"
  | "Highly rated but not hidden"
  | "Not a hidden gem";


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
  analysis: HiddenGemAnalysis;
  gemLabel: GemLabel;
  isStatisticallyHidden: boolean;
  releaseYear?: number;
  releaseDate?: string;
  screenshots?: {
    full?: string;
    thumbnail?: string;
  }[];
}

const isHiddenGemCandidate = (game: RankingGame) => {
  const statScore =
    typeof game.analysis?.statGemScore === "number"
      ? game.analysis.statGemScore
      : null;

  const verdictYes = game.analysis?.hiddenGemVerdict === "Yes";
  const labeledHidden =
    game.gemLabel === "Hidden Gem" ||
    game.gemLabel === "Improved Hidden Gem";
  const statisticallyHidden = game.isStatisticallyHidden === true;

  // バックエンドの「隠れた良作」シグナルをすべて尊重
  return (
    statisticallyHidden ||
    labeledHidden ||
    verdictYes ||
    (statScore !== null && statScore >= 8)
  );
};


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
  const [allHiddenGames, setAllHiddenGames] = useState<RankingGame[]>([]); // ★ 追加：全期間 Hidden 用プール
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
        const hidden = list.filter(isHiddenGemCandidate);


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

      // ★ Todayʼs Hidden Gems 用：
      // recentDays に依存しない「全期間 Hidden Gem プール」を取得
      console.log("Home: fetching all-time hidden gems for Today lane");
      const { hidden: allTimeHidden } = await fetchForPeriod(null); // recentDays = ""（All time）
      setAllHiddenGames(allTimeHidden);
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



  // レーン2: Hidden ではないが高評価のタイトル（露出はまだ少なめ）
  const noticedGames = useMemo(
    () =>
      filteredGames
        .filter(
          (game) =>
            // Hidden Gem 判定に引っかからないものだけを「New & Noticed」に出す
            !isHiddenGemCandidate(game) &&
            (game.positiveRatio ?? 0) >= 85 &&
            (game.totalReviews ?? 0) >= 50,
        )
        .slice(0, 16),
    [filteredGames],
  );

  // ★ 「Recent High-Quality Hidden Gems」用のサマリー（ジャンルフィルタなしでそのまま上位だけ）
  const recentHighQualityGems = useMemo(
    () => games.slice(0, 6),
    [games],
  );


  // ★ Todayʼs Hidden Gems 用：
  // recentDays に関係なく「全期間 Hidden Gems」からランダムでピックアップ
  const todaysHiddenGems = useMemo(() => {
    if (allHiddenGames.length === 0) return [];

    // まず全期間 Hidden のプールを用意
    let pool = allHiddenGames;

    // ジャンルフィルタがあれば、getDisplayTags を使って絞り込み
    if (selectedGenre) {
      const target = normalizeTag(selectedGenre);
      const filteredByGenre = allHiddenGames.filter((game) => {
        const cardTags = getDisplayTags(game);
        if (cardTags.length === 0) return false;
        const normalized = cardTags.map(normalizeTag);
        return normalized.includes(target);
      });

      // 該当ジャンルで1件もなければ、全体プールにフォールバック
      if (filteredByGenre.length > 0) {
        pool = filteredByGenre;
      }
    }

    // Recent High-Quality に出ている appId はできるだけ除外
    const excludedIds = new Set(recentHighQualityGems.map((g) => g.appId));
    const candidates = pool.filter((g) => !excludedIds.has(g.appId));

    const base = candidates.length > 0 ? candidates : pool;

    // ランダムシャッフルして、最大 24 件まで（上位3件をfeatured、残りをotherで使う）
    const shuffled = [...base];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, 24);
  }, [allHiddenGames, selectedGenre, recentHighQualityGems]);



  const featuredHiddenGems = todaysHiddenGems.slice(0, 3);
  const otherHiddenGems = todaysHiddenGems.slice(3);

  // Steam風の横長サムネつきタイル
  const renderCompactGameCard = (game: RankingGame) => {
  const tags = getDisplayTags(game, 3);

  // 価格表示を安全に正規化
  const rawPrice =
    typeof game.price === "number" && Number.isFinite(game.price)
      ? game.price
      : 0;
  const priceDisplay = rawPrice === 0 ? "Free" : `$${rawPrice.toFixed(2)}`;

  const headerUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`;
  const score =
    typeof game.analysis?.statGemScore === "number"
      ? game.analysis.statGemScore
      : null;

  return (
    <button
      key={game.appId}
      onClick={() =>
        navigate(`/game/${game.appId}`, {
          // ★ GameDetail へ state も一緒に渡す（リンク切れ対策）
          state: {
            gameData: game,
            analysisData: game.analysis,
          },
        })
      }
      className="
        min-w-[260px] max-w-[260px] h-[260px]
        rounded-lg border bg-card text-left
        hover:bg-accent hover:text-accent-foreground
        transition-all shadow-sm hover:shadow-md
        overflow-hidden flex flex-col
      "
    >
      {/* サムネ（高さ固定）＋ Gem Score グラデ丸バッジ */}
      <div className="relative w-full h-32">
        <img
          src={headerUrl}
          alt={game.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        {score !== null && (
          <div className="absolute bottom-2 left-2">
            <div
              className="
                w-12 h-12 rounded-full
                bg-gradient-to-tr from-emerald-400 via-cyan-400 to-sky-500
                text-white
                flex items-center justify-center
                shadow-lg 
              "
            >
              <span className="text-lg font-extrabold leading-none">
                {score.toFixed(1)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 本文 */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="font-semibold text-sm line-clamp-2">
          {game.title}
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{Math.round(game.positiveRatio ?? 0)}% positive</span>
          <span>{priceDisplay}</span>
        </div>

        {/* 下はタグだけ（AI Gem Score のテキスト行は削除） */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded-full bg-muted text-[10px]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
};





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

      <div className="max-w-6xl mx-auto px-4 py-12 space-y-16">

        {/* 🔥 1st Fold: 行動喚起タイル  */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">
            Discover Great Games Instantly
          </h2>
          <p className="text-muted-foreground">
            気になるカテゴリーをタップして、すぐにおすすめをチェックできます。
          </p>

          {/* タイルグリッド */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { label: "今日の隠れた高評価", target: "/rankings?mode=today-hidden" },
              { label: "最近話題のインディー", target: "/rankings?tag=indie" },
              { label: "レビュー急上昇タイトル", target: "/rankings?mode=trending" },
              { label: "少数レビューだけど神ゲー", target: "/rankings?mode=small-but-great" },
              { label: "復活したHidden Gem", target: "/rankings?mode=improved" },
              { label: "Steam Deck最適タイトル", target: "/rankings?tag=steamdeck" },
              { label: "低価格の高評価", target: "/rankings?mode=cheap-gems" },
              { label: "長時間遊べるゲーム", target: "/rankings?mode=longplay" },
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={() => navigate(item.target)}
                className="
            w-full rounded-xl border bg-card hover:bg-accent 
            hover:text-accent-foreground p-4 text-left
            transition-all shadow-sm hover:shadow-md
          "
              >
                <span className="font-semibold text-sm md:text-base block">
                  {item.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  Tap to explore →
                </span>
              </button>
            ))}
          </div>
        </section>


        {/* 🔵 2nd Fold: Recent High-Quality Picks（横スクロールタイル） */}
        {recentHighQualityGems.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-xl font-semibold">Recent High-Quality Picks</h3>
                <p className="text-muted-foreground text-sm">
                  過去7〜30日にリリースまたは注目を集めた高評価タイトル。
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {recentHighQualityGems.length} titles
              </span>
            </div>

            <div className="relative">
              <div
                className="
                  flex gap-3 overflow-x-auto pb-2 -mx-4 px-4
                  [scrollbar-width:none] [-ms-overflow-style:none]
                  [&::-webkit-scrollbar]:hidden
                "
              >
                {recentHighQualityGems.map((game) =>
                  renderCompactGameCard(game),
                )}
              </div>
              {/* 右端フェード */}
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
            </div>
          </section>
        )}



        {/* 🔶 3rd Fold: Today’s Hidden Gems（横スクロールタイル） */}
        {(featuredHiddenGems.length > 0 || otherHiddenGems.length > 0) && (
          <section className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-xl font-semibold">Today's Hidden Gems</h3>
                <p className="text-sm text-muted-foreground">
                  全期間の隠れた高評価タイトルから毎日ランダムにセレクト。
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {todaysHiddenGems.length} titles
              </span>
            </div>

            <div className="relative">
              <div
                className="
                  flex gap-3 overflow-x-auto pb-2 -mx-4 px-4
                  [scrollbar-width:none] [-ms-overflow-style:none]
                  [&::-webkit-scrollbar]:hidden
                "
              >
                {todaysHiddenGems.map((game) =>
                  renderCompactGameCard(game),
                )}
              </div>
              {/* 右端フェード */}
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
            </div>
          </section>
        )}


      </div>

    </div>
  );
};

export default Index;
