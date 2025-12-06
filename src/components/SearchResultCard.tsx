import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Calendar } from "lucide-react";


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
}

// スコア軸のキー
type ScoreAxisKey = "hidden" | "quality" | "comeback" | "niche" | "innovation";

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


  const cardMatchScore = normalizedMoodScore != null ? Math.round(normalizedMoodScore * 100) : 0;

  return (
    <Card
      className="group relative flex flex-col w-full h-full cursor-pointer bg-transparent border-none shadow-none rounded-none p-1 transition-all duration-200"
      onClick={handleClick}
    >
      {/* Glass Container（ホバー対応版） */}
      <div
        className="absolute inset-0 z-10
              bg-white/5 backdrop-blur-xl rounded-[32px] border border-white/10
              group-hover:bg-white/10 transition-colors duration-500
              shadow-[0_10px_30px_rgba(0,0,0,0.2)]
              group-hover:shadow-[0_0_30px_rgba(168,85,247,0.3)]"
      />
      {/* Aurora Glow（ホバー対応版） */}
      <div
        className="absolute -inset-1 z-0
              rounded-[34px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500
              opacity-0 group-hover:opacity-30
              blur-xl transition-opacity duration-700"
      />
      {/* ▶ 中身はほぼ透明にしてガラス越し感を出す */}
      <div className="relative z-20 flex flex-col h-full rounded-[20px] overflow-hidden bg-white/0">
        <div className="relative aspect-[21/9] m-3 rounded-[24px] overflow-hidden shadow-lg group-hover:shadow-2xl transition-all duration-500 group-hover:scale-[1.02]">
          <img src={headerImageUrl} alt={title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-40" />
          <div className="absolute top-3 right-3 w-16 h-16 rounded-full bg-black/20 backdrop-blur-xl border border-white/10 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.2)] group-hover:scale-110 transition-transform duration-500 z-20">
            <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 to-purple-300 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)] leading-none">
              {cardMatchScore}
            </span>
            <span className="text-[8px] font-bold text-white/70 uppercase tracking-widest mt-0.5">Match</span>
          </div>
          {hasDiscount && (
            <div className="absolute top-3 left-3 z-20">
              <div className="px-3 py-1.5 rounded-full bg-pink-500/20 backdrop-blur-md border border-pink-500/30 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)] animate-pulse">
                <span className="text-xs font-black tracking-wider">-{discountPercentDisplay}%</span>
              </div>
            </div>
          )}

          <div className="absolute bottom-3 left-3 z-20 flex flex-wrap gap-0 max-w-[260px]">
            {displayTags.slice(0, 4).map((label, i) => (
              <div
                key={`${label}-${i}`}
                className="px-2 py-1 rounded-full bg-black/50 border border-white/20 text-[9px] text-white font-bold uppercase tracking-widest backdrop-blur-md"
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-5 pt-2 flex flex-col flex-1">
          <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 group-hover:from-cyan-300 group-hover:to-purple-300 transition-all duration-300 mb-2 line-clamp-1">
            {title}
          </h3>
          <p className="text-xs text-slate-300/80 line-clamp-2 mb-1 font-light leading-relaxed">
            {safeSummary}
          </p>
          <div className="mt-2 pt-3 border-t border-white/10 flex items-end justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-cyan-500/70 uppercase tracking-wider mb-0.5">Release</span>
              <span className="text-xs font-bold text-slate-200">{releaseDisplay}</span>
            </div>
            <div className="flex flex-col items-end">
              {hasDiscount && (
                <span className="text-[10px] text-slate-500 line-through decoration-slate-500/50">
                  {priceOriginalDisplay}
                </span>
              )}
              <span className="text-lg font-bold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                {priceDisplay}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
