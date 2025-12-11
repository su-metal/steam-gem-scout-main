// supabase/functions/search-games/index.ts

// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import type { FeatureLabel, FeatureLabelV2, Vibe } from "../_shared/feature-labels.ts";
import { MoodSliderId, MoodVector } from "../_shared/mood.ts";
import {
  EXPERIENCE_FOCUS_LIST,
  type ExperienceFocus,
  type ExperienceFocusId,
} from "./experience-focus.ts";
import { isFeatureLabelV2 } from "../_shared/feature-labels.ts";

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
  aiTags?: string[];
  primaryVibeId?: Vibe | null;
  experienceFocusId?: ExperienceFocusId | null;
}

type CachedGameRow = {
  data: Record<string, unknown> | null;
  price: number | null;
  price_original: number | null;
  discount_percent: number | null;
  tags: string[] | null;
  feature_labels: string[] | null;
};

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

// ---- Low-story genre detection (Narrative フィルタ用の保険) ----

const LOW_STORY_GENRES = ["sports", "racing", "fighting"];
const LOW_STORY_TAGS = [
  "sports",
  "football",
  "soccer",
  "basketball",
  "baseball",
  "racing",
  "driving",
  "car racing",
  "motorsport",
  "fighting",
  "mma",
  "wrestling",
];

const isLowStoryGenreGame = (g: any): boolean => {
  const genresRaw =
    (Array.isArray(g.genres) && g.genres) ||
    (Array.isArray(g.store_genres) && g.store_genres) ||
    [];
  const tagsRaw = Array.isArray(g.tags) ? g.tags : [];

  const genres = genresRaw.map((s: string) =>
    typeof s === "string" ? s.toLowerCase() : s
  );
  const tags = tagsRaw.map((s: string) =>
    typeof s === "string" ? s.toLowerCase() : s
  );

  const hitGenre = genres.some((x) => LOW_STORY_GENRES.includes(x));
  const hitTag = tags.some((x) => LOW_STORY_TAGS.includes(x));
  return hitGenre || hitTag;
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

function findExperienceFocusById(
  id: ExperienceFocusId | null | undefined
): ExperienceFocus | null {
  if (!id) return null;
  const focus = EXPERIENCE_FOCUS_LIST.find((f) => f.id === id);
  return focus ?? null;
}

function computeVibeFocusMatchScore(params: {
  primaryVibe: Vibe | null | undefined;
  experienceFocusId: ExperienceFocusId | null | undefined;
  featureLabels: FeatureLabel[] | null | undefined;
  featureLabelsV2: FeatureLabelV2[] | null | undefined;
}): number | null {
  const {
    primaryVibe,
    experienceFocusId,
    featureLabels,
    featureLabelsV2,
  } = params;
  if (!primaryVibe || !experienceFocusId) return null;

  const hasV2 =
    Array.isArray(featureLabelsV2) && featureLabelsV2.length > 0;
  const hasV1 =
    Array.isArray(featureLabels) && featureLabels.length > 0;
  if (!hasV2 && !hasV1) {
    return null;
  }

  const focus = findExperienceFocusById(experienceFocusId);
  if (!focus) return null;

  const vibeMatches = focus.vibe === primaryVibe;

  const focusSet = new Set<FeatureLabelV2>(focus.featureLabels);
  const gameLabels =
    Array.isArray(featureLabelsV2) && featureLabelsV2.length > 0
      ? featureLabelsV2
      : featureLabels ?? [];
  let overlap = 0;
  for (const label of gameLabels) {
    if (focusSet.has(label as FeatureLabelV2)) {
      overlap += 1;
    }
  }

  if (focus.featureLabels.length === 0) return null;

  let score = overlap / focus.featureLabels.length;

  if (vibeMatches && score > 0) {
    score = Math.min(1, score + 0.15);
  }

  if (score <= 0) return null;
  return score;
}

interface ExperienceFocusScoreResult {
  focusScore: number | null;
}

function computeExperienceFocusScore(
  _game: unknown,
  _primaryVibeId: string | null | undefined,
  _experienceFocusId: string | null | undefined
): ExperienceFocusScoreResult {
  return { focusScore: null };
}

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

// デフォルトのムード重み（従来と同じ）
const MOOD_WEIGHTS_DEFAULT: Record<MoodSliderId, number> = {
  operation: 1.1,
  session: 0.9,
  tension: 1.1,
  story: 0.8,
  brain: 0.9,
};

// ストーリー重視モード（Narrative 系プリセット想定）
const MOOD_WEIGHTS_STORY_FOCUSED: Record<MoodSliderId, number> = {
  operation: 0.5,
  session: 0.6,
  tension: 0.6,
  story: 2.4, // ★ Story を最重要に
  brain: 0.8,
};

// ユーザーのスライダーから「ストーリー重視かどうか」を判定
const isStoryFocusedMood = (
  user: UserMoodPrefs | null | undefined
): boolean => {
  if (!user) return false;
  const { story, operation, session, tension, brain } = user;
  if (typeof story !== "number") return false;

  const others = [operation, session, tension, brain].filter(
    (v): v is number => typeof v === "number"
  );
  const maxOther = others.length ? Math.max(...others) : 0;

  // Story が 0.75 以上かつ他軸より十分高いときに「ストーリー重視」とみなす
  return story >= 0.75 && story >= maxOther + 0.1;
};

const getMoodWeightsFor = (
  user: UserMoodPrefs | null | undefined
): Record<MoodSliderId, number> =>
  isStoryFocusedMood(user) ? MOOD_WEIGHTS_STORY_FOCUSED : MOOD_WEIGHTS_DEFAULT;

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

  // ★ ユーザーの気分から重みプロファイルを決定
  const weights = getMoodWeightsFor(user);

  let sum = 0;
  let weightSum = 0;

  (Object.keys(weights) as MoodSliderId[]).forEach((key) => {
    const w = weights[key];
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

const calcFinalRankingScore = (
  baseScore: number,
  moodScore: number
): number => {
  // base: 品質フィルター / mood: 気分マッチ度（主役）
  const BASE_WEIGHT = 0.3;
  const MOOD_WEIGHT = 0.7;

  if (moodScore <= 0) return baseScore;

  return BASE_WEIGHT * baseScore + MOOD_WEIGHT * moodScore;
};

// ★ Base Score: 「気分マッチの土台となる品質フィルター」寄りに再設計
const computeBaseScore = (g: {
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  price: number; // USD 想定 or 正規化済み
  averagePlaytime: number; // hours 想定
  releaseYear: number;
}) => {
  const currentYear = new Date().getFullYear();

  // 1) レビューの質：好評率 (0〜100) → 0〜1
  const pr = Math.max(0, Math.min(100, g.positiveRatio));
  const positiveScore = pr / 100;

  // 2) レビューの信頼性：件数を log スケールで 0〜1
  let reviewsReliability = 0;
  if (g.totalReviews > 0) {
    const minR = 20;
    const maxR = 5000;
    const clamped = Math.min(maxR, Math.max(minR, g.totalReviews));
    const logMin = Math.log10(minR);
    const logMax = Math.log10(maxR);
    reviewsReliability = (Math.log10(clamped) - logMin) / (logMax - logMin);
    if (!Number.isFinite(reviewsReliability)) reviewsReliability = 0;
    reviewsReliability = Math.max(0, Math.min(1, reviewsReliability));
  }

  // 「質 × 信頼性」を 0〜1 にまとめる（最低でも質の40%は反映）
  const reviewScore = positiveScore * (0.4 + 0.6 * reviewsReliability);

  // 3) 価格スコア：極端な罠価格を避けるための軽い補正
  //   - 5〜40ドル → ほぼフラット（0.8〜1.0）
  //   - 1ドル未満 or 60ドル超 → やや減点
  let priceScore = 1;
  if (g.price > 0) {
    const price = g.price;
    if (price < 1) {
      priceScore = 0.6;
    } else if (price < 5) {
      priceScore = 0.8;
    } else if (price <= 40) {
      priceScore = 1.0;
    } else if (price <= 60) {
      priceScore = 0.85;
    } else {
      priceScore = 0.7;
    }
  }

  // 4) プレイ時間スコア：
  //   - 0〜2時間 → かなり低め（体験として薄い可能性）
  //   - 2〜20時間 → 徐々に 1.0 へ
  //   - 20時間以上 → 1.0 で頭打ち（それ以上は盛りすぎない）
  let playtimeScore = 0.5;
  if (g.averagePlaytime > 0) {
    const h = g.averagePlaytime;
    if (h <= 2) {
      playtimeScore = 0.3;
    } else if (h >= 20) {
      playtimeScore = 1.0;
    } else {
      // 2〜20h を 0.3〜1.0 の間で線形に
      const t = (h - 2) / (20 - 2);
      playtimeScore = 0.3 + t * (1.0 - 0.3);
    }
  }

  // 5) リリース年スコア：
  //   - 0〜5年以内 → 高評価
  //   - 10年以上前 → 少し減点
  let yearScore = 0.8;
  if (g.releaseYear && Number.isFinite(g.releaseYear)) {
    const diff = currentYear - g.releaseYear;
    if (diff <= 0) {
      yearScore = 1.0;
    } else if (diff <= 5) {
      yearScore = 0.9;
    } else if (diff <= 10) {
      yearScore = 0.8;
    } else if (diff <= 20) {
      yearScore = 0.6;
    } else {
      yearScore = 0.5;
    }
  }

  // ★ 所有者数はここでは評価に使わない（気分検索の目的とズレるため）
  //    必要なら ownersScore をごく弱く入れることも可能だが、現時点では 1.0 固定
  const ownersScore = 1.0;
  void ownersScore; // eslint 対策（@ts-nocheck なら不要だが一応）

  // 重み付け合計（合計 = 100）
  //  - reviewScore      : 60
  //  - playtimeScore    : 15
  //  - priceScore       : 15
  //  - yearScore        : 10
  const score =
    reviewScore * 60 + playtimeScore * 15 + priceScore * 15 + yearScore * 10;

  // 見やすく 0.1 刻みに丸める
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
      .select("data, price, price_original, discount_percent, tags, feature_labels");

    if (error) {
      console.error("search-games db error", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (data ?? []) as CachedGameRow[];

    // JSONB data と物理カラム（price 系）をマージして RankingGame 相当に整形
    const rawGames = rows
      .map((row) => {
      const base = row.data ?? {};

      const persistedFeatureLabels: FeatureLabel[] = Array.isArray(
        row.feature_labels
      )
        ? row.feature_labels.filter(
            (label): label is FeatureLabel => typeof label === "string"
          )
        : [];

        // AIタグ（game_rankings_cache.tags）
        const aiTags = Array.isArray(row.tags) ? row.tags : [];

        // 既存の tags（もし data 側にもあれば）
        const legacyTags = Array.isArray(base.tags) ? base.tags : [];

        // 優先順位：AIタグ > 旧タグ（重複排除）
        const tagSet = new Set<string>();
        const mergedTags: string[] = [];

        for (const t of [...aiTags, ...legacyTags]) {
          if (typeof t !== "string") continue;
          const trimmed = t.trim();
          if (!trimmed || tagSet.has(trimmed)) continue;
          tagSet.add(trimmed);
          mergedTags.push(trimmed);
        }

        return {
          ...base,
          // 物理カラム優先
          price: typeof row.price === "number" ? row.price : base.price,
          price_original:
            typeof row.price_original === "number"
              ? row.price_original
              : base.price_original,
          discount_percent:
            typeof row.discount_percent === "number"
              ? row.discount_percent
              : base.discount_percent,

          // ここで tags を「AIタグ優先のマージ済み」に差し替え
          tags: mergedTags,
          // 必要なら別フィールドとして aiTags も持たせておく
          aiTags,
          persistedFeatureLabels,
        };
      })
      .filter((g) => g && g.appId != null);

    const primaryVibeId = body.primaryVibeId ?? null;
    const experienceFocusId = body.experienceFocusId ?? null;

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
      const analysisFeatureLabels = Array.isArray(analysisRaw.featureLabels)
        ? analysisRaw.featureLabels.filter(
            (label): label is string => typeof label === "string"
          )
        : [];

      const analysisFeatureLabelsV2 = Array.isArray(analysisRaw.featureLabelsV2)
        ? Array.from(
            new Set(
              analysisRaw.featureLabelsV2
                .map((label) =>
                  typeof label === "string" ? label.trim().toLowerCase() : ""
                )
                .filter(
                  (label): label is FeatureLabelV2 =>
                    label.length > 0 && isFeatureLabelV2(label)
                )
            )
          )
        : [];
      const normalizedAnalysisFeatureLabelsV2 =
        analysisFeatureLabelsV2.length > 0 ? analysisFeatureLabelsV2 : undefined;

      const featureLabels: FeatureLabel[] = Array.isArray(
        g.persistedFeatureLabels
      )
        ? g.persistedFeatureLabels
        : [];

      const vibeFocusMatchScore = computeVibeFocusMatchScore({
        primaryVibe: body.primaryVibeId ?? null,
        experienceFocusId: body.experienceFocusId ?? null,
        featureLabels,
        featureLabelsV2: normalizedAnalysisFeatureLabelsV2,
      });

      const { focusScore } = computeExperienceFocusScore(
        g,
        primaryVibeId,
        experienceFocusId
      );

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
          featureLabels: analysisFeatureLabels,
          featureLabelsV2: normalizedAnalysisFeatureLabelsV2,
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
        featureLabels,
        vibeFocusMatchScore,
        experienceFocusScore: focusScore,
      };
    });

    // ---- フィルタ ----
    let filtered = mapped;

    // ★ aiTags の事前整形（検索ボディから配列を取り出してクリーンアップ）
    const aiTagsFilter =
      Array.isArray(body.aiTags) && body.aiTags.length > 0
        ? body.aiTags.filter(
            (t) => typeof t === "string" && t.trim() !== ""
          )
        : [];


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
        const storyFocused = isStoryFocusedMood(userMood); // ★ 追加

        sorted = [...filtered]
          .map((g) => {
            const compositeScore = computeScore(g, isCustom) ?? 0;

            const rawMoodScore = userMood
              ? calcMoodMatchScore(g.moodScores, userMood)
              : 0;

            let moodScore = rawMoodScore;

            // ★ Narrative（ストーリー重視）モード時の「物語薄いジャンル」ペナルティ
            if (
              storyFocused &&
              moodScore > 0 &&
              g.moodScores &&
              typeof g.moodScores.story === "number" &&
              g.moodScores.story < 0.45 &&
              isLowStoryGenreGame(g)
            ) {
              // かなり強く下げる（例: 70% 減）
              moodScore *= 0.3;
            }

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
              moodScore, // ★ ペナルティ後の値を保存
              finalScore: finalNormalized,
              finalCompositeScore: finalComposite,
            };
          })
          .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
        break;
      }
      case "vibe_focus_match":
        sorted = [...filtered].sort(
          (a, b) =>
            (b.vibeFocusMatchScore ?? 0) - (a.vibeFocusMatchScore ?? 0)
        );
        break;

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
