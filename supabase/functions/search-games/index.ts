// supabase/functions/search-games/index.ts

// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import {
  MoodSliderId,
  MoodVector,
} from "../_shared/mood.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SortOption =
  | "recommended"
  | "gem-score"
  | "gemScore"
  | "positive-ratio"
  | "most-reviews"
  | "newest"
  | "custom";

interface SearchBody {
  genre?: string;
  recentDays?: string;
  sort?: SortOption;
  minReviews?: number;
  minPlaytime?: number;
  aiWeight?: number;
  positiveRatioWeight?: number;
  reviewCountWeight?: number;
  recencyWeight?: number;
  userMood?: Partial<Record<MoodSliderId, number>>;
  vibes?: Partial<Record<MoodSliderId, number>>;
}

const toNumber = (val: any, fallback = 0): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const toNumberOrUndefined = (val: any): number | undefined => {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const parsed = Number.parseFloat(val);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

const parseGameDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const getReferenceDate = (game: any): Date | null => {
  return (
    parseGameDate(game.releaseDate) ?? parseGameDate(game.lastUpdated) ?? null
  );
};

const VALID_TRENDS = ["Improving", "Stable", "Deteriorating", "Unknown"];
const RELIABILITY_VALUES = ["high", "medium", "low"];

const normalizeSectionText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return value.trim();
};

const normalizeReliability = (
  value: unknown
): "high" | "medium" | "low" | null => {
  if (typeof value !== "string") return null;
  return RELIABILITY_VALUES.includes(value as string)
    ? (value as "high" | "medium" | "low")
    : null;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
};

// --- 可変スコア軸用ヘルパー -------------------------

const SCORE_KEYS = [
  "hidden",
  "quality",
  "moodFit",
  "comeback",
  "niche",
  "innovation",
] as const;

type ScoreKey = (typeof SCORE_KEYS)[number];

/**
 * game_rankings_cache.data.scores に入っている値を
 * 0〜1 の範囲に正規化して取り出すヘルパー。
 */
const normalizeScores = (value: unknown): Record<ScoreKey, number> => {
  const base: Record<ScoreKey, number> = {
    hidden: 0,
    quality: 0,
    moodFit: 0,
    comeback: 0,
    niche: 0,
    innovation: 0,
  };

  if (!value || typeof value !== "object") return base;

  const src = value as any;

  for (const key of SCORE_KEYS) {
    const raw = src?.[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      let v = raw;
      // 0〜1 が基本だが、万一 0〜100 っぽい値が来た場合は 0〜1 に縮める
      if (v > 1.000001) {
        v = v / 100;
      }
      base[key] = Math.max(0, Math.min(1, v));
    }
  }

  return base;
};

// ---- Mood Matching Helpers ------------------------------------

const VIBE_MAX = 4;
type UserMoodPrefs = MoodVector;

const slidersToUserMood = (
  sliders: Partial<Record<MoodSliderId, number>>
): UserMoodPrefs => {
  const to01 = (v: number | undefined) => {
    const raw = Number.isFinite(v) ? (v as number) : 2;
    return Math.min(1, Math.max(0, raw / VIBE_MAX));
  };

  return {
    operation: to01(sliders.operation),
    session: to01(sliders.session),
    tension: to01(sliders.tension),
    story: to01(sliders.story),
    brain: to01(sliders.brain),
  };
};

const MOOD_WEIGHTS: Record<MoodSliderId, number> = {
  operation: 1.1,
  session: 0.9,
  tension: 1.1,
  story: 0.8,
  brain: 0.9,
};

const distanceToScore = (d: number, maxD: number): number => {
  const norm = Math.min(1, d / maxD);
  const s = 1 - norm;
  return Math.pow(s, 1.25);
};

const calcMoodMatchScore = (
  game: MoodVector | null | undefined,
  user: UserMoodPrefs | null | undefined
): number => {
  if (!game || !user) return 0;

  let sum = 0;
  let weightSum = 0;

  (Object.keys(MOOD_WEIGHTS) as MoodSliderId[]).forEach((key) => {
    const w = MOOD_WEIGHTS[key];
    const g = (game as any)?.[key];
    const u = (user as any)?.[key];
    if (typeof g !== "number" || typeof u !== "number") return;
    const diff = g - u;
    sum += w * diff * diff;
    weightSum += w;
  });

  if (weightSum === 0) return 0;

  const maxD = Math.sqrt(weightSum);
  const d = Math.sqrt(sum);
  return distanceToScore(d, maxD);
};

const calcFinalRankingScore = (baseScore: number, moodScore: number): number => {
  const BASE_WEIGHT = 0.6;
  const MOOD_WEIGHT = 0.4;

  if (moodScore <= 0) return baseScore;

  return BASE_WEIGHT * baseScore + MOOD_WEIGHT * moodScore;
};

// ★ Base Hidden Gem Score (0〜100) を計算するヘルパー
//   指標: positive_ratio / reviews / owners / price / playtime / release_year
//   重み: 40 / 20 / 15 / 10 / 10 / 5
const computeBaseScore = (g: {
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  price: number; // cents
  averagePlaytime: number; // hours 想定
  releaseYear: number;
}) => {
  const currentYear = new Date().getFullYear();

  // 1) positive_ratio: 0〜100 → 0〜1
  const pr = Math.max(0, Math.min(100, g.positiveRatio));
  const positiveScore = pr / 100;

  // 2) reviews: 30〜5000 を log スケールで 0〜1
  let reviewsScore = 0;
  if (g.totalReviews > 0) {
    const minR = 30;
    const maxR = 5000;
    const clamped = Math.min(maxR, Math.max(minR, g.totalReviews));
    const logMin = Math.log10(minR);
    const logMax = Math.log10(maxR);
    reviewsScore = (Math.log10(clamped) - logMin) / (logMax - logMin);
    if (!Number.isFinite(reviewsScore)) reviewsScore = 0;
    reviewsScore = Math.max(0, Math.min(1, reviewsScore));
  }

  // 3) owners:「隠れ度」重視。〜20k なら満点、200k で 0 に落ちる
  let ownersScore = 0;
  if (g.estimatedOwners > 0) {
    const ideal = 20000; // ここまでは「かなり隠れてる」
    const maxOwners = 200000;
    const clamped = Math.min(maxOwners, Math.max(0, g.estimatedOwners));
    if (clamped <= ideal) {
      ownersScore = 1;
    } else {
      ownersScore = 1 - (clamped - ideal) / (maxOwners - ideal);
    }
    ownersScore = Math.max(0, Math.min(1, ownersScore));
  }

  // 4) price: 2〜40ドルを想定。安いほど高スコア
  let priceScore = 0;
  if (g.price > 0) {
    const priceUsd = g.price;
    const minPrice = 2;
    const maxPrice = 40;
    const clamped = Math.min(maxPrice, Math.max(minPrice, priceUsd));
    priceScore = 1 - (clamped - minPrice) / (maxPrice - minPrice); // 2ドルで1, 40ドルで0
    priceScore = Math.max(0, Math.min(1, priceScore));
  }

  // 5) playtime: 0〜50時間を 0〜1 に正規化（長く遊ばれているほど高評価）
  let playtimeScore = 0;
  if (g.averagePlaytime > 0) {
    const maxPlay = 50;
    const clamped = Math.min(maxPlay, Math.max(0, g.averagePlaytime));
    playtimeScore = clamped / maxPlay;
    playtimeScore = Math.max(0, Math.min(1, playtimeScore));
  }

  // 6) release_year: 新しいほど高スコア。10年差までを見る
  let yearScore = 0.5;
  if (g.releaseYear && Number.isFinite(g.releaseYear)) {
    const diff = Math.max(0, Math.min(10, currentYear - g.releaseYear));
    yearScore = 1 - diff / 10; // 今年=1, 10年前=0
    yearScore = Math.max(0, Math.min(1, yearScore));
  }

  // 重み付け合計（重みは 40/20/15/10/10/5 = 100）
  const score =
    positiveScore * 40 +
    reviewsScore * 20 +
    ownersScore * 15 +
    priceScore * 10 +
    playtimeScore * 10 +
    yearScore * 5;

  // 少しだけ見やすく 0.1 刻みに丸める（好みで変えてOK）
  return Math.round(score * 10) / 10;
};

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST is supported" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as SearchBody;

    const genre = body.genre ?? "";

    // recentDays はそのまま文字列として扱う（空文字 = フィルタなし）
    const recentDays = (body.recentDays ?? "").trim();

    const sort: SortOption = (body.sort as SortOption) ?? "recommended";
    const minReviews = body.minReviews ?? 0;
    const minPlaytime = body.minPlaytime ?? 0;

    const aiWeight = body.aiWeight ?? 40;
    const positiveRatioWeight = body.positiveRatioWeight ?? 30;

    const reviewCountWeight = body.reviewCountWeight ?? 20;
    const recencyWeight = body.recencyWeight ?? 10;

    let userMood: UserMoodPrefs | null = null;
    const moodSource =
      (body.userMood as Partial<Record<MoodSliderId, number>> | undefined) ??
      (body.vibes as Partial<Record<MoodSliderId, number>> | undefined);
    if (moodSource && typeof moodSource === "object") {
      userMood = slidersToUserMood(moodSource);
    }

    console.log("search-games request body:", body);

    // まずは JSON データをまとめて取得
    const { data, error } = await supabase
      .from("game_rankings_cache")
      .select("data");

    if (error) {
      console.error("search-games db error", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (data ?? []) as any[];

    // JSONB カラム data から RankingGame 相当の形に整形
    const rawGames = rows
      .map((row) => row.data ?? row) // 念のため row.data 優先
      .filter((g) => g && g.appId != null);

    const mapped = rawGames.map((g) => {
      const analysisRaw =
        typeof g.analysis === "string"
          ? (() => {
              try {
                return JSON.parse(g.analysis);
              } catch {
                return {};
              }
            })()
          : g.analysis ?? {};

      // ★ BaseScore 用に事前に数値化
      const positiveRatio = toNumber(g.positiveRatio, 0);
      const totalReviews = toNumber(g.totalReviews, 0);
      const estimatedOwners = toNumber(g.estimatedOwners, 0);
      // NOTE: price は game_rankings_cache.price（セール後の現在価格）を参照する
      const price = toNumber(g.price, 0);
      const priceOriginal =
        typeof g.priceOriginal === "number"
          ? g.priceOriginal
          : typeof g.price_original === "number"
          ? g.price_original
          : price;
      const discountPercent = toNumber(
        g.discountPercent ?? g.discount_percent,
        0
      );
      const isOnSale =
        typeof g.isOnSale === "boolean"
          ? g.isOnSale
          : typeof g.is_on_sale === "boolean"
          ? g.is_on_sale
          : discountPercent > 0;
      const averagePlaytime = toNumber(g.averagePlaytime, 0);
      const releaseYear = toNumber(g.releaseYear, 0);

      const baseScore = computeBaseScore({
        positiveRatio,
        totalReviews,
        estimatedOwners,
        price,
        averagePlaytime,
        releaseYear,
      });

      // scores: game_rankings_cache.data.scores を 0〜1 に正規化
      const scores = normalizeScores(g.scores);

      // scoreHighlights: DB 側にあればそのまま使う。無ければデフォルトを組み立てる
      let scoreHighlights: string[] | undefined;

      if (Array.isArray(g.scoreHighlights)) {
        scoreHighlights = g.scoreHighlights.filter(
          (k: any) => typeof k === "string"
        );
      }

      if (!scoreHighlights || scoreHighlights.length === 0) {
        // デフォルト: moodFit は常に表示候補に含める
        const defaults: ScoreKey[] = ["moodFit"];

        // scores の中で値が高い軸を上位2つまで採用（moodFit 以外）
        const otherKeys: ScoreKey[] = [
          "hidden",
          "quality",
          "comeback",
          "niche",
          "innovation",
        ];

        const ranked = otherKeys
          .filter((key) => scores[key] > 0)
          .sort((a, b) => scores[b] - scores[a]);

        for (const key of ranked) {
          if (defaults.length >= 3) break;
          if (!defaults.includes(key)) {
            defaults.push(key);
          }
        }

        scoreHighlights = defaults;
      }

      const normalizedHeaderImage =
        typeof g.headerImage === "string" && g.headerImage.trim() !== ""
          ? g.headerImage
          : typeof g.header_image === "string" && g.header_image.trim() !== ""
          ? g.header_image
          : null;

      const summaryText =
        typeof analysisRaw.summary === "string"
          ? analysisRaw.summary.trim()
          : "";
      const stabilityTrend =
        typeof analysisRaw.stabilityTrend === "string" &&
        VALID_TRENDS.includes(analysisRaw.stabilityTrend)
          ? analysisRaw.stabilityTrend
          : "Unknown";
      const hasImprovedSinceLaunch =
        typeof analysisRaw.hasImprovedSinceLaunch === "boolean"
          ? analysisRaw.hasImprovedSinceLaunch
          : null;

      return {
        appId: toNumber(g.appId, 0),
        title: g.title ?? `App ${g.appId}`,
        positiveRatio,
        totalReviews,
        estimatedOwners,
        recentPlayers: toNumber(g.recentPlayers, 0),
        price,
        priceOriginal,
        discountPercent,
        isOnSale,
        averagePlaytime,
        lastUpdated: g.lastUpdated ?? null,
        tags: Array.isArray(g.tags) ? g.tags : [],
        steamUrl: g.steamUrl ?? `https://store.steampowered.com/app/${g.appId}`,
        screenshots: Array.isArray(g.screenshots) ? g.screenshots : [],
        reviewScoreDesc: g.reviewScoreDesc ?? "",
        headerImage: normalizedHeaderImage,
        analysis: {
          // まずは AI 解析結果をそのまま全部載せる（既存フィールドを維持）
          ...(analysisRaw ?? {}),

          // その上で、必要なフィールドだけ「正規化して上書き」する
          hiddenGemVerdict: analysisRaw.hiddenGemVerdict ?? "Unknown",
          summary: summaryText,
          labels: normalizeStringArray(analysisRaw.labels),
          pros: normalizeStringArray(analysisRaw.pros),
          cons: normalizeStringArray(analysisRaw.cons),
          riskScore: toNumber(analysisRaw.riskScore, 0),
          bugRisk: toNumber(analysisRaw.bugRisk, 0),
          refundMentions: toNumber(analysisRaw.refundMentions, 0),
          statGemScore: toNumberOrUndefined(analysisRaw.statGemScore),
          reviewQualityScore: toNumber(analysisRaw.reviewQualityScore, 0),
          currentStateSummary: normalizeSectionText(
            analysisRaw.currentStateSummary
          ),
          historicalIssuesSummary: normalizeSectionText(
            analysisRaw.historicalIssuesSummary
          ),
          stabilityTrend,
          hasImprovedSinceLaunch,
          currentStateReliability: normalizeReliability(
            analysisRaw.currentStateReliability
          ),
          historicalIssuesReliability: normalizeReliability(
            analysisRaw.historicalIssuesReliability
          ),
        },

        gemLabel: g.gemLabel ?? "",
        isStatisticallyHidden: g.isStatisticallyHidden ?? false,
        releaseDate: g.releaseDate ?? "",
        releaseYear,
        // 統計ベースの Base Hidden Gem Score (0〜100)
        baseScore,
        // ★ 新フィールド群
        scores,
        scoreHighlights,
        moodScores:
          (g.mood_scores as MoodVector | undefined | null) ??
          (g.moodScores as MoodVector | undefined | null) ??
          null,
      };
    });

    // ---- フィルタ ----
    let filtered = mapped;

    if (genre && genre.trim() !== "") {
      filtered = filtered.filter((g) => g.tags?.includes(genre.trim()));
    }

    if (minReviews > 0) {
      filtered = filtered.filter((g) => g.totalReviews >= minReviews);
    }

    if (minPlaytime > 0) {
      filtered = filtered.filter((g) => g.averagePlaytime >= minPlaytime);
    }

    if (recentDays && recentDays.trim() !== "") {
      const days = Number(recentDays);
      if (!Number.isNaN(days) && days > 0) {
        const now = new Date();
        filtered = filtered.filter((g) => {
          const referenceDate = getReferenceDate(g);
          if (!referenceDate) return false;
          const diffDays =
            (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
          return diffDays <= days;
        });
      }
    }

    // ---- ソート ----
    const computeScore = (g: any, custom: boolean) => {
      const analysis = g.analysis ?? {};

      // ===== 重みの決定 =====
      const wAi = custom ? aiWeight : 40;
      const wPos = custom ? positiveRatioWeight : 30;
      const wRev = custom ? reviewCountWeight : 20;
      const wRec = custom ? recencyWeight : 10;

      const totalWeight = wAi + wPos + wRev + wRec || 1;

      // ===== AIスコア（ベース＋ブースト） =====
      const rawReviewQuality =
        typeof analysis.statGemScore === "number"
          ? analysis.statGemScore
          : typeof analysis.reviewQualityScore === "number"
          ? analysis.reviewQualityScore
          : 5;

      let aiScore = rawReviewQuality / 10; // 0.1〜1.0 くらい

      // Hidden Gem 判定やラベルによる“推しボーナス”
      let aiBoost = 0;

      // 「Hidden Gem」と判定されているだけでけっこう強い
      if (analysis.hiddenGemVerdict === "Yes") {
        aiBoost += 0.15;
      }

      // 復活系 Hidden Gem はさらに加点
      if (g.gemLabel === "Improved Hidden Gem") {
        aiBoost += 0.1;
      }

      // reviewQualityScore が高いほどちょっとだけ上振れさせる（±0.1 程度）
      aiBoost += (rawReviewQuality - 5) * 0.02; // 例: 7 → +0.04, 9 → +0.08

      aiScore = Math.min(1, Math.max(0, aiScore + aiBoost));

      // ===== 統計系スコア =====

      // 0〜100% の positiveRatio を 0〜1 に正規化
      const positiveScore =
        typeof g.positiveRatio === "number" ? g.positiveRatio / 100 : 0.5;

      // レビュー数は log スケールで「多すぎるタイトル」を抑えめに（0〜1）
      const totalReviews =
        typeof g.totalReviews === "number" ? g.totalReviews : 0;
      const reviewScore = Math.min(Math.log10(totalReviews + 1) / 4, 1); // 0〜1 くらい

      // 新しさスコア（releaseYear が無ければ中間の 0.5 相当）
      const currentYear = new Date().getFullYear();
      const releaseYear =
        typeof g.releaseYear === "number" ? g.releaseYear : currentYear;
      const yearDiff = Math.max(0, Math.min(5, currentYear - releaseYear)); // 最大5年差まで見る
      const recencyScore = 1 - yearDiff / 5; // 0〜1（新しいほど1に近い）

      // ===== リスク系ペナルティ =====
      const bugRisk =
        typeof analysis.bugRisk === "number" ? analysis.bugRisk : 0;
      const riskScore =
        typeof analysis.riskScore === "number" ? analysis.riskScore : 0;
      const refundMentions =
        typeof analysis.refundMentions === "number"
          ? analysis.refundMentions
          : 0;

      // ざっくり 0〜0.25 の範囲で減点されるイメージ
      const riskPenalty = Math.min(
        0.25,
        bugRisk * 0.01 + riskScore * 0.01 + Math.min(refundMentions, 5) * 0.02
      );

      // ===== 重み付き合計 → 0〜1 スコア =====
      let raw =
        aiScore * wAi +
        positiveScore * wPos +
        reviewScore * wRev +
        recencyScore * wRec;

      let score01 = raw / totalWeight;

      // リスク分を減点
      score01 = Math.max(0, score01 - riskPenalty);

      // ===== 「さすがにこれは 8点未満はない」系の底上げ =====
      const isVeryPositive = (g.positiveRatio ?? 0) >= 97;
      const hasEnoughReviews =
        (g.totalReviews ?? 0) >= 300 && (g.totalReviews ?? 0) <= 5000;
      const isHidden = g.isStatisticallyHidden === true;
      const isStrongGem =
        analysis.hiddenGemVerdict === "Yes" &&
        (g.gemLabel === "Hidden Gem" || g.gemLabel === "Improved Hidden Gem");

      // custom=false のときだけ適用（ユーザーがカスタムするときは素のスコアをそのまま）
      if (
        !custom &&
        isVeryPositive &&
        hasEnoughReviews &&
        isHidden &&
        isStrongGem
      ) {
        // 最低でも 8/10 相当のスコアに底上げ
        score01 = Math.max(score01, 0.8);
      }

      // custom=true のときは 0〜1 スケール、
      // recommended / gem-score のときは 1〜10 スケールで返す
      if (custom) {
        return score01; // 0〜1
      } else {
        return score01 * 10; // 0〜10
      }
    };

    let sorted = filtered;

    switch (sort) {
      case "positive-ratio":
        sorted = [...filtered].sort(
          (a, b) => b.positiveRatio - a.positiveRatio
        );
        break;
      case "most-reviews":
        sorted = [...filtered].sort((a, b) => b.totalReviews - a.totalReviews);
        break;
      case "newest":
        sorted = [...filtered].sort((a, b) => {
          const ay = a.releaseYear ?? 0;
          const by = b.releaseYear ?? 0;
          return by - ay;
        });
        break;
      case "recommended":
      case "gem-score":
      case "gemScore":
      case "custom": {
        const isCustom = sort === "custom";
        sorted = [...filtered]
          .map((g) => {
            const compositeScore = computeScore(g, isCustom) ?? 0;
            const moodScore = userMood
              ? calcMoodMatchScore(g.moodScores, userMood)
              : 0;

            const normalizedBase = isCustom
              ? compositeScore
              : compositeScore / 10;
            const finalNormalized = userMood
              ? calcFinalRankingScore(normalizedBase, moodScore)
              : normalizedBase;
            const finalComposite = isCustom
              ? finalNormalized
              : finalNormalized * 10;

            return {
              ...g,
              compositeScore,
              moodScore,
              finalScore: finalNormalized,
              finalCompositeScore: finalComposite,
            };
          })
          .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
        break;
      }
      default:
        break;
    }

    return new Response(JSON.stringify(sorted), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("search-games unexpected error", err);
    return new Response(
      JSON.stringify({ error: "Unexpected error in search-games" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
