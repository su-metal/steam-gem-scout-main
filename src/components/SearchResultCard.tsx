import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Activity, Terminal } from "lucide-react";


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

interface SearchResultCardProps {
  title: string;
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
  moodScore?: number;
  finalScore?: number;
  priceOriginal?: number | null;
  discountPercent?: number | null;
  variant?: CardVariant; // "hud" = 今のデザイン, "simple" = 別デザイン
}

// スコア軸のキー
type ScoreAxisKey = "hidden" | "quality" | "comeback" | "niche" | "innovation";

// ★ カードデザインのバリアント
type CardVariant = "hud" | "simple";

// スコア軸の表示ラベル
const SCORE_AXIS_LABELS: Record<ScoreAxisKey, string> = {
  hidden: "埋もれ度",
  quality: "完成度",
  comeback: "復活度",
  niche: "ニッチ度",
  innovation: "独自性",
};

// 軸ごとの色付け（バッジ用）
const getScoreAxisBadgeClass = (key: ScoreAxisKey, value: number): string => {
  const base = "text-[10px] px-2 py-0.5 rounded-full border";
  const strong = value >= 0.7;
  const mid = value >= 0.4;

  switch (key) {
    case "hidden":
      return `${base} ${strong
        ? "border-indigo-500 text-indigo-300 bg-indigo-500/15"
        : mid
          ? "border-indigo-400 text-indigo-200 bg-indigo-400/10"
          : "border-border/60 text-muted-foreground bg-muted/40"
        }`;
    case "quality":
      return `${base} ${strong
        ? "border-emerald-500 text-emerald-300 bg-emerald-500/15"
        : mid
          ? "border-emerald-400 text-emerald-200 bg-emerald-400/10"
          : "border-border/60 text-muted-foreground bg-muted/40"
        }`;
    case "comeback":
      return `${base} ${strong
        ? "border-amber-500 text-amber-300 bg-amber-500/15"
        : mid
          ? "border-amber-400 text-amber-200 bg-amber-400/10"
          : "border-border/60 text-muted-foreground bg-muted/40"
        }`;
    case "niche":
      return `${base} ${strong
        ? "border-rose-500 text-rose-300 bg-rose-500/15"
        : mid
          ? "border-rose-400 text-rose-200 bg-rose-400/10"
          : "border-border/60 text-muted-foreground bg-muted/40"
        }`;
    case "innovation":
      return `${base} ${strong
        ? "border-sky-500 text-sky-300 bg-sky-500/15"
        : mid
          ? "border-sky-400 text-sky-200 bg-sky-400/10"
          : "border-border/60 text-muted-foreground bg-muted/40"
        }`;
    default:
      return `${base} border-border/60 text-muted-foreground bg-muted/40`;
  }
};


export const SearchResultCard = ({
  title,
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
  moodScore,
  // ★ 追加（デフォルトは既存デザイン）
  variant = "hud",
}: SearchResultCardProps) => {
  const navigate = useNavigate();
  const appIdStr = String(appId);

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



  const rawMoodScore =
    typeof moodScore === "number"
      ? moodScore
      : typeof (gameData as any)?.moodScore === "number"
        ? (gameData as any).moodScore
        : typeof (analysisData as any)?.moodScore === "number"
          ? (analysisData as any).moodScore
          : null;

  const normalizedMoodScore =
    typeof rawMoodScore === "number" && Number.isFinite(rawMoodScore)
      ? Math.max(0, Math.min(1, rawMoodScore))
      : null;

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

  // --- 可変スコア軸（hidden / quality / comeback / niche / innovation） ---

  // gameRankingsCache 由来の scores / scoreHighlights を優先
  const rawScores =
    (gameData as any)?.scores ??
    (analysisData as any)?.scores ??
    (ai as any)?.scores ??
    {};

  const allScores: Record<ScoreAxisKey, number> = {
    hidden:
      typeof rawScores.hidden === "number" && Number.isFinite(rawScores.hidden)
        ? Math.max(0, Math.min(1, rawScores.hidden))
        : 0,
    quality:
      typeof rawScores.quality === "number" && Number.isFinite(rawScores.quality)
        ? Math.max(0, Math.min(1, rawScores.quality))
        : 0,
    comeback:
      typeof rawScores.comeback === "number" &&
        Number.isFinite(rawScores.comeback)
        ? Math.max(0, Math.min(1, rawScores.comeback))
        : 0,
    niche:
      typeof rawScores.niche === "number" && Number.isFinite(rawScores.niche)
        ? Math.max(0, Math.min(1, rawScores.niche))
        : 0,
    innovation:
      typeof rawScores.innovation === "number" &&
        Number.isFinite(rawScores.innovation)
        ? Math.max(0, Math.min(1, rawScores.innovation))
        : 0,
  };

  // scoreHighlights は DB 側のものを優先
  const rawHighlights =
    (gameData as any)?.scoreHighlights ??
    (analysisData as any)?.scoreHighlights ??
    (ai as any)?.scoreHighlights ??
    null;

  let highlightedAxes: ScoreAxisKey[] = [];

  if (Array.isArray(rawHighlights) && rawHighlights.length > 0) {
    highlightedAxes = rawHighlights
      .map((k: any) => k as ScoreAxisKey)
      .filter((k) =>
        ["hidden", "quality", "comeback", "niche", "innovation"].includes(
          k as string
        )
      ) as ScoreAxisKey[];
  }

  // ハイライト指定がない場合は、スコアの高い軸から最大 3 つ選ぶ
  if (highlightedAxes.length === 0) {
    const entries: { key: ScoreAxisKey; value: number }[] = [
      { key: "hidden", value: allScores.hidden },
      { key: "quality", value: allScores.quality },
      { key: "comeback", value: allScores.comeback },
      { key: "niche", value: allScores.niche },
      { key: "innovation", value: allScores.innovation },
    ];

    highlightedAxes = entries
      .filter((e) => e.value > 0.15)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((e) => e.key);
  }

  // 実際に表示に使うデータ（キー＋数値）
  const highlightedScoreBadges = highlightedAxes.map((key) => ({
    key,
    label: SCORE_AXIS_LABELS[key],
    value: allScores[key],
    score10: Math.round(allScores[key] * 10), // 0〜10 の整数
  }));


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

  // price は既存のまま
  const normalizedPrice =
    typeof price === "number" && Number.isFinite(price) ? price : 0;

  const isFree = normalizedPrice === 0;

  // gameData から元価格と割引率を拾う（props は使わない）
  const rawPriceOriginal =
    typeof (gameData as any)?.priceOriginal === "number"
      ? (gameData as any).priceOriginal
      : typeof (gameData as any)?.price_original === "number"
        ? (gameData as any).price_original
        : null;

  const effectivePriceOriginal =
    typeof rawPriceOriginal === "number" && Number.isFinite(rawPriceOriginal)
      ? rawPriceOriginal
      : normalizedPrice;

  const rawDiscountPercent =
    typeof (gameData as any)?.discountPercent === "number"
      ? (gameData as any).discountPercent
      : typeof (gameData as any)?.discount_percent === "number"
        ? (gameData as any).discount_percent
        : null;

  const computedDiscountPercent =
    effectivePriceOriginal > 0 && normalizedPrice < effectivePriceOriginal
      ? Math.round((1 - normalizedPrice / effectivePriceOriginal) * 100)
      : 0;

  const discountPercentDisplay =
    typeof rawDiscountPercent === "number" && Number.isFinite(rawDiscountPercent)
      ? Math.max(0, Math.min(100, Math.round(rawDiscountPercent)))
      : computedDiscountPercent;

  const hasDiscount =
    effectivePriceOriginal > 0 &&
    normalizedPrice < effectivePriceOriginal &&
    discountPercentDisplay > 0;

  const formatPrice = (v: number) =>
    v === 0 ? "Free" : `$${v.toFixed(2)}`;

  const priceDisplay = formatPrice(normalizedPrice);
  const priceOriginalDisplay = formatPrice(effectivePriceOriginal);


  // Playtime: averagePlaytime は分単位で渡ってくる想定なので h に変換して表示する
  const playtimeMinutes =
    typeof averagePlaytime === "number" && Number.isFinite(averagePlaytime)
      ? averagePlaytime
      : 0;

  let playtimeDisplay = "-";
  if (playtimeMinutes > 0) {
    const hours = playtimeMinutes / 60;
    if (hours < 1) {
      playtimeDisplay = "<1h";
    } else if (hours < 10) {
      // 10時間未満は 1 桁小数で表示（例: 3.5h）
      playtimeDisplay = `${hours.toFixed(1)}h`;
    } else {
      // それ以上は四捨五入した整数時間（例: 36h）
      playtimeDisplay = `${Math.round(hours)}h`;
    }
  }

  // Release date display
  const rawReleaseDate: string | undefined =
    (gameData as any)?.releaseDate ??
    (analysisData as any)?.releaseDate ??
    undefined;

  let releaseDisplay = "-";
  if (rawReleaseDate) {
    const d = new Date(rawReleaseDate);
    if (!Number.isNaN(d.getTime())) {
      // 例: Jan 5, 2024 形式で表示（ロケールは環境依存）
      releaseDisplay = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } else {
      // すでにフォーマット済みの文字列が来ている場合はそのまま
      releaseDisplay = rawReleaseDate;
    }
  }


  const cardMatchScore =
    normalizedMoodScore != null ? Math.round(normalizedMoodScore * 100) : 0;

  // ★ ここから simple バリアント
  if (variant === "simple") {
    return (
      <Card
        className="group relative w-full h-full cursor-pointer bg-transparent border-none p-0"
        onClick={handleClick}
      >
        <div className="group relative flex flex-col w-full h-full bg-[#09090b] rounded-lg border-none transition-all duration-300">
          {/* Animated Border Glow (Behind) */}
          {/* 1st glow */}
          <div
            className="
           pointer-events-none absolute -inset-[1px] rounded-lg
           bg-gradient-to-b from-cyan-500/40 via-purple-500/40 to-pink-500/40
           opacity-100           /* モバイル: 常時 hover 状態 */
           md:opacity-20         /* md 以上: 通常は薄く */
           blur-[2px]
           transition-opacity duration-300
           md:group-hover:opacity-100 md:group-hover:duration-200
         "
          />
          {/* 2nd glow */}
          <div
            className="
           pointer-events-none absolute -inset-[2px] rounded-lg
           bg-cyan-400/20
           opacity-50           /* モバイル: 常時 hover 状態 */
           md:opacity-0         /* md 以上: 通常は非表示 */
           blur-xl
           transition-opacity duration-500
           md:group-hover:opacity-50
         "
          />

          {/* Main Chassis */}
          <div className="relative z-10 flex flex-col h-full bg-[#050505] rounded-lg overflow-hidden ring-transparent md:ring-white/10 md:group-hover:ring-transparent transition-all">
            {/* Tech Header (HUD) */}
            <div className="h-6 bg-[#0c0c0c] border-b border-white/5 flex items-center justify-between px-3">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-pulse" />
                <span className="text-[8px] font-mono text-emerald-500 uppercase tracking-[0.35em]">
                  SYS.READY
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-1 w-8 rounded-full bg-cyan-500/50 md:bg-white/10 md:group-hover:bg-cyan-500/50 transition-colors" />
                <span className="h-1 w-2 rounded-full bg-purple-500/50 md:bg-white/10 md:group-hover:bg-purple-500/50 transition-colors" />
              </div>
            </div>

            {/* Image Area with Scanlines */}
            <div className="relative aspect-[21/9] overflow-hidden group">
              {/* Image + chromatic glitch */}
              <div className="absolute inset-0 z-0">
                <img
                  src={headerImageUrl}
                  alt={title}
                  className="w-full h-full object-cover opacity-100 md:opacity-80 md:group-hover:opacity-100 transition-opacity duration-200"
                />
                <img
                  src={headerImageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-0 md:opacity-0 md:group-hover:opacity-40 mix-blend-screen translate-x-1 transition-all duration-100"
                  style={{ filter: "hue-rotate(90deg)" }}
                />
                <img
                  src={headerImageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-0 md:opacity-0 md:group-hover:opacity-40 mix-blend-screen -translate-x-1 transition-all duration-100"
                  style={{ filter: "hue-rotate(-90deg)" }}
                />
              </div>

              {/* Scanlines */}
              <div className="absolute inset-0 bg-scanlines opacity-30 pointer-events-none" />

              {/* Flash overlay */}
              <div className="absolute inset-0 bg-white opacity-0 group-hover:animate-flash pointer-events-none" />

              {/* Match Score Badge (top-right) */}
              <div className="absolute top-0 right-0 p-2">
                <div className="bg-black/70 backdrop-blur border border-cyan-500/40 flex items-center gap-2 px-2 py-1 transform skew-x-[-10deg]">
                  <Activity size={12} className="text-cyan-400" />
                  <span className="text-xs font-black text-white transform skew-x-[10deg]">
                    {cardMatchScore}%
                  </span>
                </div>
              </div>

              {/* Discount Badge (bottom-right) */}
              {hasDiscount && (
                <div className="absolute bottom-0 right-0">
                  <div className="bg-pink-600/90 text-white text-[10px] font-bold px-3 py-1 clip-path-slant-left">
                    SAVINGS: {discountPercentDisplay}%
                  </div>
                </div>
              )}
            </div>

            {/* Content Deck */}
            <div className="relative flex-1 p-4 bg-gradient-to-b from-[#050505] to-[#0a0a0a]">
              {/* Decorative Grid Background */}
              <div
                className="pointer-events-none absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    "linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />

              <div className="relative z-10 flex flex-col h-full">
                {/* Title + tiny HUD icon */}
                <div className="flex justify-between items-start mb-2">
                  <h3
                    className="
                    text-lg font-bold uppercase tracking-tight max-w-[80%] line-clamp-1
                    text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400
                    md:text-white md:bg-none
                    md:group-hover:text-transparent md:group-hover:bg-clip-text md:group-hover:bg-gradient-to-r md:group-hover:from-cyan-400 md:group-hover:to-purple-400
                    transition-all duration-300
                  "
                  >
                    {title}
                  </h3>
                  <Terminal
                    size={12}
                    className="text-cyan-400 md:text-slate-600 md:group-hover:text-cyan-400 transition-colors"
                  />
                </div>

                {/* Description */}
                <p className="text-[12px] text-slate-400/80 font-mono leading-relaxed line-clamp-2 mb-1 min-h-[1.5rem]">
                  {safeSummary}
                </p>

                {/* Review stats */}
                <p className="text-[9px] text-slate-500 font-mono mb-3">
                  {positiveDisplay > 0 ? `${positiveDisplay}% positive` : "一定の好評"}
                  {typeof totalReviews === "number" && Number.isFinite(totalReviews)
                    ? ` · ${totalReviews.toLocaleString()} reviews`
                    : ""}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {displayTags.slice(0, 5).map((tag, i) => (
                    <span
                      key={i}
                      className="
    text-[10px] font-mono px-1.5 py-0.5 bg-black/40
    /* === Mobile (always hover state) === */
    text-cyan-200 border border-cyan-200
    /* === Desktop (default) === */
    md:text-slate-300 md:border md:border-white/10
    /* === Desktop hover === */
    md:group-hover:text-cyan-200 md:group-hover:border-cyan-200
    transition-colors
  "
                    >
                      {tag.toUpperCase()}
                    </span>
                  ))}
                </div>

                {/* Bottom: price + CTA */}
                <div className="mt-auto flex items-center justify-between border-t border-white/10 md:border-white/5 pt-3 md:group-hover:border-white/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-[8px] text-slate-500 font-mono mb-0.5">
                      CREDITS_REQ
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-cyan-300 md:text-white md:group-hover:text-cyan-300 transition-colors font-mono">
                        {priceDisplay}
                      </span>
                      {hasDiscount && (
                        <span className="text-[10px] text-slate-600 line-through font-mono">
                          {priceOriginalDisplay}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="inline-flex h-11 w-11 items-center justify-center border border-cyan-400 bg-cyan-500 text-black md:border-white/10 md:bg-white/5 md:text-inherit md:group-hover:bg-cyan-500 md:group-hover:border-cyan-400 md:group-hover:text-black transition-all shadow-[0_10px_30px_rgba(59,130,246,0.3)]">
                    <ArrowUpRight size={16} />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Corner Brackets */}
          <div className="absolute top-6 left-0 w-1 h-3 bg-cyan-500 md:bg-cyan-500/0 md:group-hover:bg-cyan-500 transition-colors duration-300" />
          <div className="absolute top-6 right-0 w-1 h-3 bg-purple-500 md:bg-cyan-500/0 md:group-hover:bg-purple-500 transition-colors duration-300" />
          <div className="absolute bottom-0 left-0 w-3 h-1 bg-cyan-500 md:bg-cyan-500/0 md:group-hover:bg-cyan-500 transition-colors duration-300" />
          <div className="absolute bottom-0 right-0 w-3 h-1 bg-purple-500 md:bg-cyan-500/0 md:group-hover:bg-purple-500 transition-colors duration-300" />
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="group relative w-full h-full cursor-pointer bg-transparent border-none p-0"
      onClick={handleClick}
    >
      <div className="group relative flex flex-col w-full h-full bg-[#09090b] rounded-[32px] border-none transition-all duration-300">
        {/* Animated Border Glow (Behind) */}
        {/* 1st glow */}
        <div
          className="
           pointer-events-none absolute -inset-[1px] rounded-[32px] 
           bg-gradient-to-b from-cyan-500/40 via-purple-500/40 to-pink-500/40
           opacity-100           /* モバイル: 常時 hover 状態 */
           md:opacity-20         /* md 以上: 通常は薄く */
           blur-[2px]
           transition-opacity duration-300
           md:group-hover:opacity-100 md:group-hover:duration-200
         "
        />
        {/* 2nd glow */}
        <div
          className="
           pointer-events-none absolute -inset-[2px] rounded-[32px] 
           bg-cyan-400/20
           opacity-50           /* モバイル: 常時 hover 状態 */
           md:opacity-0         /* md 以上: 通常は非表示 */
           blur-xl
           transition-opacity duration-500
           md:group-hover:opacity-50
         "
        />

        {/* Main Chassis */}
        <div className="relative z-10 flex flex-col h-full bg-[#050505] rounded-[32px] overflow-hidden ring-transparent md:ring-white/10 md:group-hover:ring-transparent transition-all">
          {/* Tech Header (HUD) */}
          <div className="h-6 bg-[#0c0c0c] border-b border-white/5 flex items-center justify-between px-8">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-pulse" />
              <span className="text-[8px] font-mono text-emerald-500 uppercase tracking-[0.35em]">
                SYS.READY
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1 w-8 rounded-full bg-cyan-500/50 md:bg-white/10 md:group-hover:bg-cyan-500/50 transition-colors" />
              <span className="h-1 w-2 rounded-full bg-purple-500/50 md:bg-white/10 md:group-hover:bg-purple-500/50 transition-colors" />
            </div>
          </div>

          {/* Image Area with Scanlines */}
          <div className="relative aspect-[21/9] overflow-hidden group">
            {/* Image + chromatic glitch */}
            <div className="absolute inset-0 z-0">
              <img
                src={headerImageUrl}
                alt={title}
                className="w-full h-full object-cover opacity-100 md:opacity-80 md:group-hover:opacity-100 transition-opacity duration-200"
              />
              <img
                src={headerImageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-0 md:opacity-0 md:group-hover:opacity-40 mix-blend-screen translate-x-1 transition-all duration-100"
                style={{ filter: "hue-rotate(90deg)" }}
              />
              <img
                src={headerImageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-0 md:opacity-0 md:group-hover:opacity-40 mix-blend-screen -translate-x-1 transition-all duration-100"
                style={{ filter: "hue-rotate(-90deg)" }}
              />
            </div>

            {/* Scanlines */}
            <div className="absolute inset-0 bg-scanlines opacity-30 pointer-events-none" />

            {/* Flash overlay */}
            <div className="absolute inset-0 bg-white opacity-0 group-hover:animate-flash pointer-events-none" />

            {/* Match Score Badge (top-right) */}
            <div className="absolute top-0 right-0 p-2">
              <div className="bg-black/70 backdrop-blur border border-cyan-500/40 flex items-center gap-2 px-2 py-1 transform skew-x-[-10deg]">
                <Activity size={12} className="text-cyan-400" />
                <span className="text-xs font-black text-white transform skew-x-[10deg]">
                  {cardMatchScore}%
                </span>
              </div>
            </div>

            {/* Discount Badge (bottom-right) */}
            {hasDiscount && (
              <div className="absolute bottom-0 right-0">
                <div className="bg-pink-600/90 text-white text-[10px] font-bold px-3 py-1 clip-path-slant-left">
                  SAVINGS: {discountPercentDisplay}%
                </div>
              </div>
            )}
          </div>

          {/* Content Deck */}
          <div className="relative flex-1 p-4 bg-gradient-to-b from-[#050505] to-[#0a0a0a]">
            {/* Decorative Grid Background */}
            <div
              className="pointer-events-none absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  "linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />

            <div className="relative z-10 flex flex-col h-full">
              {/* Title + tiny HUD icon */}
              <div className="flex justify-between items-start mb-2">
                <h3
                  className="
                    text-lg font-bold uppercase tracking-tight max-w-[80%] line-clamp-1
                    text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400
                    md:text-white md:bg-none
                    md:group-hover:text-transparent md:group-hover:bg-clip-text md:group-hover:bg-gradient-to-r md:group-hover:from-cyan-400 md:group-hover:to-purple-400
                    transition-all duration-300
                  "
                >
                  {title}
                </h3>
                <Terminal
                  size={12}
                  className="text-cyan-400 md:text-slate-600 md:group-hover:text-cyan-400 transition-colors"
                />
              </div>

              {/* Description */}
              <p className="text-[12px] text-slate-400/80 font-mono leading-relaxed line-clamp-2 mb-1 min-h-[1.5rem]">
                {safeSummary}
              </p>

              {/* Release date */}
              <p className="text-[10px] text-slate-500 font-mono mb-3">
                RELEASE: {releaseDisplay}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {displayTags.slice(0, 5).map((tag, i) => (
                  <span
                    key={i}
                    className="
    text-[10px] font-mono px-1.5 py-0.5 bg-black/40 rounded-lg
    /* === Mobile (always hover state) === */
    text-cyan-200 border border-cyan-200
    /* === Desktop (default) === */
    md:text-slate-300 md:border md:border-white/10
    /* === Desktop hover === */
    md:group-hover:text-cyan-200 md:group-hover:border-cyan-200
    transition-colors
  "
                  >
                    {tag.toUpperCase()}
                  </span>
                ))}
              </div>

              {/* Bottom: price + CTA */}
              <div className="mt-auto flex items-center justify-between border-t border-white/20 md:border-white/5 pt-3 md:group-hover:border-white/10 transition-colors">
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-mono mb-0.5">
                    CREDITS_REQ
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-cyan-300 md:text-white md:group-hover:text-cyan-300 transition-colors font-mono">
                      {priceDisplay}
                    </span>
                    {hasDiscount && (
                      <span className="text-[10px] text-slate-600 line-through font-mono">
                        {priceOriginalDisplay}
                      </span>
                    )}
                  </div>
                </div>

                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400 bg-cyan-500 text-black md:border-white/10 md:bg-white/5 md:text-inherit md:group-hover:bg-cyan-500 md:group-hover:border-cyan-400 md:group-hover:text-black transition-all shadow-[0_10px_30px_rgba(59,130,246,0.3)]">
                  <ArrowUpRight size={16} />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Corner Brackets */}
        <div className="absolute top-6 left-0 w-1 h-3 bg-cyan-500 md:bg-cyan-500/0 md:group-hover:bg-cyan-500 transition-colors duration-300" />
        <div className="absolute top-6 right-0 w-1 h-3 bg-purple-500 md:bg-cyan-500/0 md:group-hover:bg-purple-500 transition-colors duration-300" />

        {/* Bottom corner highlights: 枠の角丸にぴったり重なる装飾 */}
        <div
          className="
              pointer-events-none
              absolute -bottom-[1px] -left-[1px]
              h-24 w-24
              rounded-[32px]
              border-b-1 border-l-2 border-transparent
              border-b-cyan-400 border-l-cyan-400
              opacity-60 md:opacity-40
              md:group-hover:opacity-100
              transition-opacity duration-300
            "
        />
        <div
          className="
              pointer-events-none
              absolute -bottom-[1px] -right-[1px]
              h-24 w-24
              rounded-[32px]
              border-b-1 border-r-2 border-transparent
              border-b-purple-400 border-r-purple-400
              opacity-60 md:opacity-40
              md:group-hover:opacity-100
              transition-opacity duration-300
            "
        />
      </div>
    </Card>
  );

};
