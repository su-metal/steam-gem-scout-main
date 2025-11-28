import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";


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

  const normalizedPrice =
    typeof price === "number" && Number.isFinite(price) ? price : 0;
  const isFree = normalizedPrice === 0;
  const priceDisplay = isFree
    ? "Free"
    : `$${normalizedPrice.toFixed(2)}`;

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

  return (
    <Card
      className="relative bg-card/50 border-primary/20 hover:border-primary/40 transition-all hover:bg-card/70 cursor-pointer overflow-hidden rounded-lg shadow-sm hover:shadow-md h-full flex flex-col"
      onClick={handleClick}
    >

      <div className="flex flex-col gap-4 p-4 h-full">
        {/* Left: Header Image */}
        <div className="w-full">
          <img
            src={headerImageUrl}
            className="w-full aspect-video object-cover rounded-lg"
          />
        </div>

        {/* Middle: Title, Metascore, Summary, Tags */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <h3 className="font-semibold text-lg line-clamp-1">{title}</h3>

            {/* メタスコアバッジ */}
            {reviewScoreDesc && (
              <div
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${metaBadgeClass}`}
              >
                {metaScore != null && (
                  <span className="leading-none">{metaScore}</span>
                )}
                <span className="uppercase tracking-wide leading-none">
                  MC
                </span>
              </div>
            )}
          </div>


          <p className="text-sm text-muted-foreground line-clamp-3">
            {safeSummary}
          </p>

          {displayTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {displayTags.map((label, i) => (
                <Badge
                  key={`${label}-${i}`}
                  variant="secondary"
                  className="text-xs px-2 py-0.5 rounded-full"
                >
                  {label}
                </Badge>
              ))}
            </div>
          )}

          {(audienceBadges.length > 0 || normalizedMoodScore !== null) && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {audienceBadges.map((badge, i) => (
                <Badge
                  key={`${badge.id ?? badge.label}-${i}`}
                  variant="outline"
                  className="text-[11px] px-2 py-0.5 rounded-full border-primary/40 text-primary/90 bg-primary/5"
                >
                  {badge.label}
                </Badge>
              ))}
              {normalizedMoodScore !== null && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-600/20 text-purple-300 border border-purple-500/40">
                  {Math.round(normalizedMoodScore * 100)}% Match
                </span>
              )}
            </div>
          )}

          {/* 可変スコア軸（このゲームの強み 〜 Hidden / Quality / Comeback / Niche / Innovation） */}
          {highlightedScoreBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {highlightedScoreBadges.map((axis) => (
                <span
                  key={axis.key}
                  className={getScoreAxisBadgeClass(axis.key, axis.value)}
                >
                  <span className="mr-1">{axis.label}</span>
                  <span className="font-semibold">
                    {axis.score10}/10
                  </span>
                </span>
              ))}
            </div>
          )}

        </div>

        {/* Stats (Positive, Reviews, Price, Playtime) */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex flex-col rounded-lg border border-border/60 bg-background/60 px-3 py-2 shadow-sm">
            <span className="text-[11px] text-muted-foreground">Positive</span>
            <span className="mt-0.5 text-sm font-semibold text-primary">
              {positiveDisplay}%
            </span>
          </div>

          <div className="flex flex-col rounded-lg border border-border/60 bg-background/60 px-3 py-2 shadow-sm">
            <span className="text-[11px] text-muted-foreground">Reviews</span>
            <span className="mt-0.5 text-sm font-semibold">
              {totalReviews?.toLocaleString?.() ?? "-"}
            </span>
          </div>

          <div className="flex flex-col rounded-lg border border-border/60 bg-background/60 px-3 py-2 shadow-sm">
            <span className="text-[11px] text-muted-foreground">Price</span>
            <span className="mt-0.5 text-sm font-semibold">
              {priceDisplay}
            </span>
          </div>

          <div className="flex flex-col rounded-lg border border-border/60 bg-background/60 px-3 py-2 shadow-sm">
            <span className="text-[11px] text-muted-foreground">Playtime</span>
            <span className="mt-0.5 text-sm font-semibold">
              {playtimeDisplay}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};

