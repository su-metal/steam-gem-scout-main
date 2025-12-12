// supabase/functions/publish-steam-games/index.ts
// Steam の AppID を指定して、game_rankings_cache に upsert する Edge Function
// 単発 (appId) / 複数 (appIds) 両対応
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { MoodVector, buildMoodFromTagsAndAnalysis } from "../_shared/mood.ts";
import {
  normalizeAnalysisFeatureLabelsV2,
  normalizeAnalysisFeatureLabelsV2Raw,
} from "../analyze-game/feature-labels.ts";

type Analysis = {
  hiddenGemVerdict: "Yes" | "No" | "Unknown";
  summary: string;
  labels: string[];
  pros: string[];
  cons: string[];
  riskScore: number;
  bugRisk: number;
  refundMentions: number;
  reviewQualityScore: number;

  // ★ 追加: 気分スライダー用の3軸ベクトル
  vibes?: {
    active: number; // 0.0〜1.0 静的〜アクション寄り
    stress: number; // 0.0〜1.0 癒し〜緊張・挑戦
    volume: number; // 0.0〜1.0 短時間〜長時間
  } | null;

  // ★ 追加: 「どんな人に刺さるか」バッジ
  audienceBadges?:
    | {
        id: string; // 例: "factory_builder", "automation_fan"
        label: string; // 例: "工場建設好き"
      }[]
    | null;

  // 既存のフィールド（currentStateSummary など）は
  // Analysis 型ではなく HiddenGemAnalysis 側に定義しているので、
  // publish-steam-games 側はここまででOK。
};

type RankingGame = {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number;
  priceOriginal: number | null;
  discountPercent: number;
  isOnSale: boolean;
  averagePlaytime: number;
  lastUpdated: string;
  tags: string[];
  genres?: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  screenshots?: { thumbnail?: string; full?: string }[];
  // ★ ヘッダー画像（UI から参照される）
  headerImage?: string;
  // ★ 互換用：旧キー
  header_image?: string;
  // ★ ここから追加: AI 解析用に保存しておくレビュー情報
  reviews?: string[];
  earlyReviews?: string[];
  recentReviews?: string[];
  earlyWindowStats?: {
    reviewCount: number;
    positiveRatio: number;
  };
  recentWindowStats?: {
    reviewCount: number;
    positiveRatio: number;
  };
  analysis: Analysis | null;
  gemLabel: string;
  isStatisticallyHidden: boolean;
  releaseDate: string;
  releaseYear: number;
  isAvailableInStore: boolean;
  mood_scores?: MoodVector | null;
};

type ImportSteamGamesRequest =
  | {
      appId: number;
      /** Import 後に AI 解析を実行するかどうか（任意） */
      runAiAnalysisAfterImport?: boolean;
    }
  | {
      appIds: number[];
      runAiAnalysisAfterImport?: boolean;
    }
  | {
      recentDays?: number;
      minPositiveRatio?: number;
      minTotalReviews?: number;
      maxEstimatedOwners?: number;
      maxPrice?: number;
      tags?: string[];
      limit?: number;
      dryRun?: boolean;
      // ★ 既存の発売年月フィルタ
      releaseFrom?: string; // "YYYY-MM"
      releaseTo?: string; // "YYYY-MM"
      // ★ フィルタ結果の中からフロントで選択された AppID 群
      selectedAppIds?: number[];
      // ★ フィルタモード専用の AppID / タイトル検索
      filterAppId?: number;
      titleQuery?: string;
      /** Import 後に AI 解析を実行するかどうか（任意） */
      runAiAnalysisAfterImport?: boolean;
    };

type ImportCandidate = {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  price: number;
  tags?: string[];
  releaseDate?: string;
};

type ImportSteamGamesResult = {
  totalCandidates: number;
  inserted: number;
  skippedExisting: number;
  candidates?: ImportCandidate[];
};

// タグ配列をトリム・重複除去・最大件数制限する共通ヘルパー
function normalizeTags(raw: any): string[] {
  if (!raw) return [];

  const arr = Array.isArray(raw) ? raw : [raw];
  const cleaned: string[] = [];

  for (const v of arr) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    cleaned.push(t);
  }

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const t of cleaned) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(t);
  }

  // 念のため 32 個までに制限
  return deduped.slice(0, 32);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY") ?? "";

// ★ 追加: analyze-game のエンドポイント
const ANALYZE_GAME_URL = `${SUPABASE_URL.replace(
  /\/+$/,
  ""
)}/functions/v1/analyze-game`;

// Supabase サーバーサイドクライアント
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
// ★ 追加: レビュー取得用エンドポイント
const STEAM_APP_REVIEWS_URL = "https://store.steampowered.com/appreviews";

Deno.serve(async (req) => {
  // CORS 対応（フロントから直接呼ぶ想定）
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST is allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = (await req.json()) as ImportSteamGamesRequest;

    // ★ 追加: フロントから渡されたフラグを読み取る
    const runAiAnalysisAfterImport =
      (body as any).runAiAnalysisAfterImport === true;

    const hasSingleAppId =
      typeof (body as any).appId === "number" &&
      Number.isFinite((body as any).appId);
    const hasMultipleAppIds = Array.isArray((body as any).appIds);

    // ① 従来どおり appId / appIds を直指定するモード
    if (hasSingleAppId || hasMultipleAppIds) {
      const appIds: number[] = hasMultipleAppIds
        ? ((body as any).appIds as number[])
        : [(body as any).appId as number];

      if (!appIds.length) {
        return new Response(
          JSON.stringify({ error: "appId or appIds is required" }),
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      const { inserted, skippedExisting, results } =
        await upsertGamesToRankingsCache(appIds);

      if (runAiAnalysisAfterImport && appIds.length > 0) {
        try {
          console.log("[publish-steam-games] Running AI analysis for", appIds);
          await runAiAnalysisForAppIds(appIds);
        } catch (e) {
          console.error(
            "[publish-steam-games] runAiAnalysisForAppIds failed",
            e
          );
        }
      }

      const response: ImportSteamGamesResult & {
        results: { appId: number; status: "ok" | "error"; message?: string }[];
      } = {
        totalCandidates: appIds.length,
        inserted,
        skippedExisting,
        candidates: undefined,
        results,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ② 条件指定モード（recentDays / positiveRatio など）
    const {
      recentDays,
      minPositiveRatio,
      minTotalReviews,
      maxEstimatedOwners,
      maxPrice,
      tags,
      limit,
      dryRun,
      // ★ 発売年月フィルタ
      releaseFrom,
      releaseTo,
      // ★ フロントで選択された AppID 一覧（任意）
      selectedAppIds,
      // ★フィルタモード専用の AppID / タイトル検索
      filterAppId,
      titleQuery,
    } = body as any;

    const hasFilterAppId =
      typeof filterAppId === "number" && Number.isFinite(filterAppId);
    const hasTitleQuery =
      typeof titleQuery === "string" && titleQuery.trim().length > 0;

    if (
      !hasFilterAppId &&
      !hasTitleQuery &&
      recentDays == null &&
      minPositiveRatio == null &&
      minTotalReviews == null &&
      maxEstimatedOwners == null &&
      maxPrice == null &&
      (!tags || !Array.isArray(tags) || tags.length === 0) &&
      !releaseFrom &&
      !releaseTo
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Filter-based import requires at least one condition (recentDays / minPositiveRatio / etc.)",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const { candidates, totalCandidates } = await fetchCandidateGamesByFilters({
      recentDays,
      minPositiveRatio,
      minTotalReviews,
      maxEstimatedOwners,
      maxPrice,
      tags,
      limit,
      filterAppId: hasFilterAppId ? filterAppId : undefined,
      titleQuery: hasTitleQuery ? titleQuery.trim() : undefined,
      releaseFrom,
      releaseTo,
    });

    // ★ フロントから selectedAppIds が送られてきている場合、
    //    フィルタ結果の中から、その AppID だけをさらに絞り込む。
    const hasSelection =
      Array.isArray(selectedAppIds) && selectedAppIds.length > 0;

    const selectedSet = hasSelection
      ? new Set(selectedAppIds.map((id: number) => Number(id)))
      : null;

    const filteredCandidates = hasSelection
      ? candidates.filter((c) => selectedSet!.has(Number(c.appId)))
      : candidates;

    // dryRun: true → プレビュー用。DB には書かない
    // プレビュー時は「元のフィルタ結果」をそのまま返す（UI 側でチェック制御）
    if (dryRun) {
      const response: ImportSteamGamesResult = {
        totalCandidates,
        inserted: 0,
        skippedExisting: 0,
        candidates,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // dryRun でなければ、絞り込み済みの候補だけを game_rankings_cache に流し込む
    const appIds = filteredCandidates.map((c) => c.appId);

    if (appIds.length === 0) {
      // 選択された AppID がフィルタ結果に含まれていなかったケース
      const response: ImportSteamGamesResult = {
        totalCandidates: 0,
        inserted: 0,
        skippedExisting: 0,
        candidates: undefined,
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const { inserted, skippedExisting } = await upsertGamesToRankingsCache(
      appIds
    );

    // ★ 追加: Import 後に AI 解析を実行するオプション
    if (runAiAnalysisAfterImport && appIds.length > 0) {
      try {
        await runAiAnalysisForAppIds(appIds);
      } catch (e) {
        console.error("runAiAnalysisForAppIds failed:", e);
        // ここでは import 自体は成功として扱いたいので、throw はしない
      }
    }

    const response: ImportSteamGamesResult = {
      // ★ selectedAppIds が指定されている場合は「実際に対象となった件数」を返す
      totalCandidates: hasSelection
        ? filteredCandidates.length
        : totalCandidates,
      inserted,
      skippedExisting,
      candidates: undefined,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    console.error("Unexpected error in publish-steam-games", e);
    return new Response(
      JSON.stringify({
        error: "Unexpected error",
        detail: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});

type FilterParams = {
  recentDays?: number;
  minPositiveRatio?: number;
  minTotalReviews?: number;
  maxEstimatedOwners?: number;
  maxPrice?: number;
  tags?: string[];
  limit?: number;
  // フィルタモード専用の AppID / タイトル検索
  filterAppId?: number;
  titleQuery?: string;
  // 発売年月フィルタ（"YYYY-MM" 形式）
  releaseFrom?: string; // 例: "2017-01"
  releaseTo?: string; // 例: "2017-12"
};

function buildRankingGameFromSteamRow(row: any): RankingGame {
  const appId: number = row.app_id;
  const title: string = row.title ?? `App ${appId}`;

  const positiveRatio: number = row.positive_ratio ?? 0;
  const totalReviews: number = row.total_reviews ?? 0;
  const estimatedOwners: number = row.estimated_owners ?? 0;
  const recentPlayers: number = 0; // steam_games には現状含めていないので 0 で初期化

  const price: number =
    typeof row.price === "number" && Number.isFinite(row.price) ? row.price : 0; // USD (例: 19.99) ※セール適用後の現在価格
  const priceOriginal: number | null =
    typeof row.price_original === "number" &&
    Number.isFinite(row.price_original)
      ? row.price_original
      : typeof row.price === "number"
      ? row.price
      : null;
  const discountPercent: number =
    typeof row.discount_percent === "number" &&
    Number.isFinite(row.discount_percent)
      ? row.discount_percent
      : 0;
  const isOnSale: boolean =
    typeof row.is_on_sale === "boolean" ? row.is_on_sale : discountPercent > 0;
  const averagePlaytime: number = row.average_playtime ?? 0;

  // SteamSpy の tags カラムではなく、公式 API 由来の store_genres を使う
  const tags: string[] = Array.isArray(row.store_genres)
    ? row.store_genres
    : typeof row.store_genres === "string"
    ? row.store_genres
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean)
    : [];

  let moodScores: MoodVector | null = null;
  if (tags.length > 0) {
    // ここで AI なし版のベースベクトルを作る（analysis はまだ null）
    moodScores = buildMoodFromTagsAndAnalysis(tags, null);
  }

  // steam_games 側に既に入っている screenshots JSON をそのまま使う
  const screenshots = Array.isArray(row.screenshots) ? row.screenshots : [];

  // headerImage は DB 側に既に保存されている値を優先し、
  // 無い場合は appId から Steam の標準ヘッダー URL を組み立てる
  const headerImage: string =
    (row.headerImage as string | undefined) ??
    (row.header_image as string | undefined) ??
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

  const steamUrl: string =
    row.steam_url ?? `https://store.steampowered.com/app/${appId}`;

  const reviewScoreDesc: string = row.review_score_desc ?? "Unknown";

  // ★ 本当の発売日を使う。なければ最後の取得日時でフォールバック
  const releaseDateStr: string =
    row.release_date ?? row.last_steam_fetch_at ?? "";
  const releaseYear: number = parseReleaseYear(releaseDateStr);

  const nowIso = new Date().toISOString();
  const currentYear = new Date().getFullYear();

  // ---- ここから hidden_gem_candidates 用の統計フィルタ ----
  // price は cents 想定なのでドルに変換
  const priceUsd = price;

  // 1) total_reviews: 30〜5000
  const withinReviewRange = totalReviews >= 30 && totalReviews <= 5000;

  // 2) positive_ratio: 90%以上
  const highPositiveRatio = positiveRatio >= 90;

  // 3) owners: 〜20万
  const ownersInRange = estimatedOwners > 0 && estimatedOwners <= 200_000;

  // 4) price: 2〜40ドル
  const priceInRange = priceUsd >= 2 && priceUsd <= 40;

  // 5) release_year: 直近5年以内（※現状は last_steam_fetch_at から年だけ抜いた近似）
  const releaseRecentEnough = releaseYear > 0 && currentYear - releaseYear <= 5;

  const isStatisticallyHidden =
    withinReviewRange &&
    highPositiveRatio &&
    ownersInRange &&
    priceInRange &&
    releaseRecentEnough;
  // ---- ここまで hidden_gem_candidates 判定 ----

  const rankingGame: RankingGame = {
    appId,
    title,
    positiveRatio,
    totalReviews,
    estimatedOwners,
    recentPlayers,
    price,
    priceOriginal,
    discountPercent,
    isOnSale,
    averagePlaytime,
    lastUpdated: nowIso,
    tags,
    genres: tags,
    steamUrl,
    reviewScoreDesc,
    screenshots,
    // ★ ヘッダー画像（検索・一覧カードで使用）
    headerImage,
    // 旧キーも一応揃えておく
    header_image: headerImage,
    // ランキング生成時点では AI 解析は未実行なので null
    analysis: null,
    // gemLabel は後から AI/別処理で更新
    gemLabel: "",
    // ★ 統計ベースの「隠れ良作候補」フラグ
    isStatisticallyHidden,
    releaseDate: releaseDateStr,
    releaseYear,
    isAvailableInStore: true,
    mood_scores: moodScores,
  };

  return rankingGame;
}

// 日付文字列から「年」だけ安全に抜き出すヘルパー
function parseReleaseYear(dateStr?: string | null): number {
  if (!dateStr) return 0;

  // まずは Date としてパースしてみる
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.getUTCFullYear();
  }

  // うまくパースできない形式の場合は、文字列中の4桁の数字を拾う
  const m = String(dateStr).match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

// ★ ここから追加: Steam レビューを取得して AI 用に整形するヘルパー
type SteamReview = {
  review: string;
  voted_up: boolean;
  timestamp_created: number;
};

type SteamReviewResponse = {
  success: number;
  query_summary?: {
    total_reviews?: number;
    total_positive?: number;
    total_negative?: number;
  };
  reviews?: SteamReview[];
};

type ReviewBundle = {
  reviews: string[];
  earlyReviews: string[];
  recentReviews: string[];
  earlyWindowStats: { reviewCount: number; positiveRatio: number };
  recentWindowStats: { reviewCount: number; positiveRatio: number };
};

async function fetchSteamReviewsForAnalysis(
  appId: number,
  maxReviews = 80
): Promise<ReviewBundle | null> {
  const params = new URLSearchParams({
    json: "1",
    language: "all", // 必要なら "japanese" などに変更
    filter: "all",
    num_per_page: String(maxReviews),
    purchase_type: "all",
  });

  const url = `${STEAM_APP_REVIEWS_URL}/${appId}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(
      "[publish-steam-games] failed to fetch reviews from Steam",
      appId,
      res.status
    );
    return null;
  }

  const json = (await res.json()) as SteamReviewResponse;
  const rawReviews = Array.isArray(json.reviews) ? json.reviews : [];
  if (!rawReviews.length) {
    return null;
  }

  // 古い順に並べ替え
  const sorted = [...rawReviews].sort(
    (a, b) => a.timestamp_created - b.timestamp_created
  );

  const texts = sorted.map((r) => r.review).filter((t) => !!t);

  const earlySize = Math.min(30, sorted.length);
  const recentSize = Math.min(30, sorted.length);

  const earlySlice = sorted.slice(0, earlySize);
  const recentSlice = sorted.slice(sorted.length - recentSize);

  const earlyReviews = earlySlice.map((r) => r.review).filter(Boolean);
  const recentReviews = recentSlice.map((r) => r.review).filter(Boolean);

  const calcWindowStats = (items: SteamReview[]) => {
    if (!items.length) {
      return { reviewCount: 0, positiveRatio: 0 };
    }
    const positives = items.filter((r) => r.voted_up).length;
    return {
      reviewCount: items.length,
      positiveRatio: Math.round((positives / items.length) * 100),
    };
  };

  return {
    reviews: texts,
    earlyReviews,
    recentReviews,
    earlyWindowStats: calcWindowStats(earlySlice),
    recentWindowStats: calcWindowStats(recentSlice),
  };
}

async function upsertGamesToRankingsCache(appIds: number[]): Promise<{
  inserted: number;
  skippedExisting: number;
  results: { appId: number; status: "ok" | "error"; message?: string }[];
}> {
  const results: {
    appId: number;
    status: "ok" | "error";
    message?: string;
  }[] = [];

  let inserted = 0;
  let skippedExisting = 0;

  if (!appIds.length) {
    return { inserted, skippedExisting, results };
  }

  // まず倉庫テーブル steam_games から、対象 appId の行をまとめて取得
  const { data: steamRows, error } = await supabase
    .from("steam_games")
    .select(
      `
        app_id,
        title,
        positive_ratio,
        total_reviews,
        estimated_owners,
        price,
        price_original,
        discount_percent,
        is_on_sale,
        average_playtime,
        store_genres,
        screenshots,  
        steam_url,
        review_score_desc,
        release_date,
        release_year,
        last_steam_fetch_at
      `
    )
    .in("app_id", appIds);

  if (error) {
    console.error("supabase steam_games fetch error", error);
    for (const appId of appIds) {
      results.push({
        appId,
        status: "error",
        message: error.message,
      });
    }
    return { inserted, skippedExisting, results };
  }

  const rowsByAppId = new Map<number, any>();
  for (const row of steamRows ?? []) {
    rowsByAppId.set(Number(row.app_id), row);
  }

  for (const appId of appIds) {
    try {
      const row = rowsByAppId.get(Number(appId));
      if (!row) {
        results.push({
          appId,
          status: "error",
          message: "steam_games row not found for this appId",
        });
        continue;
      }

      // steam_games の行から RankingGame を組み立てる
      let rankingGame = buildRankingGameFromSteamRow(row);

      // ★ 追加: Steam からレビューを取得して RankingGame に埋め込む
      try {
        const reviewBundle = await fetchSteamReviewsForAnalysis(appId);
        if (reviewBundle) {
          rankingGame = {
            ...rankingGame,
            reviews: reviewBundle.reviews,
            earlyReviews: reviewBundle.earlyReviews,
            recentReviews: reviewBundle.recentReviews,
            earlyWindowStats: reviewBundle.earlyWindowStats,
            recentWindowStats: reviewBundle.recentWindowStats,
          };
        }
      } catch (e) {
        console.warn(
          "[publish-steam-games] failed to fetch reviews for appId",
          appId,
          e
        );
      }

      const appIdStr = String(appId);

      // 既存の analysis / gemLabel がある場合は保持するためのプレースホルダ
      let rankingGameForUpdate = rankingGame;

      // 既に同じ appId の行があれば UPDATE、なければ INSERT
      const { data: existing, error: selectError } = await supabase
        .from("game_rankings_cache")
        .select("id, data, tags, feature_labels") // ★ 元は "id" だけだった所を変更
        .eq("data->>appId", appIdStr)
        .maybeSingle();

      if (selectError) {
        console.error("Select error in game_rankings_cache", selectError);
        results.push({
          appId,
          status: "error",
          message: selectError.message,
        });
        continue;
      }

      // 既存行がある場合は、analysis / gemLabel / headerImage を引き継ぐ
      if (existing && existing.data && typeof existing.data === "object") {
        const previousData = existing.data as any;
        const persistedFeatureLabels: string[] = Array.isArray(
          (existing as any).feature_labels
        )
          ? (existing as any).feature_labels.filter(
              (label): label is string =>
                typeof label === "string" && label.trim().length > 0
          )
          : [];
        const dataFeatureLabels: string[] = Array.isArray(
          previousData.featureLabels
        )
          ? (previousData.featureLabels as any[]).filter(
              (label): label is string =>
                typeof label === "string" && label.trim().length > 0
            )
          : [];
        const analysisFeatureLabels: string[] =
          previousData?.analysis &&
          Array.isArray((previousData as any).analysis?.featureLabels)
            ? ((previousData as any).analysis.featureLabels as any[])
                .map((label: any) =>
                  typeof label === "string" ? label.trim() : ""
                )
                .filter((label: string) => label.length > 0)
            : [];
        const carriedFeatureLabels =
          analysisFeatureLabels.length > 0
            ? analysisFeatureLabels
            : dataFeatureLabels.length > 0
            ? dataFeatureLabels
            : persistedFeatureLabels;

        rankingGameForUpdate = {
          ...rankingGame,
          analysis:
            previousData.analysis !== undefined
              ? previousData.analysis
              : rankingGame.analysis,
          gemLabel:
            previousData.gemLabel !== undefined
              ? previousData.gemLabel
              : rankingGame.gemLabel,
          mood_scores:
            previousData.mood_scores !== undefined
              ? previousData.mood_scores
              : rankingGame.mood_scores,
          // 最新の解析結果に基づく featureLabels を優先的に保持する
          featureLabels:
            carriedFeatureLabels.length > 0
              ? carriedFeatureLabels
              : (rankingGame as any).featureLabels,
          // headerImage は既存があれば優先し、無い場合は今回計算したものを使う
          headerImage:
            previousData.headerImage ??
            previousData.header_image ??
            (rankingGame as any).headerImage ??
            (rankingGame as any).header_image,
          header_image:
            previousData.header_image ??
            previousData.headerImage ??
            (rankingGame as any).header_image ??
            (rankingGame as any).headerImage,
        };
      }

      // 🔽 ここから追加：検索・フィルタ用 tags を組み立てる
      // 1. AI 解析済みなら analysis.aiTags を最優先で使う
      const aiTagsFromAnalysis: string[] =
        rankingGameForUpdate &&
        (rankingGameForUpdate as any).analysis &&
        Array.isArray((rankingGameForUpdate as any).analysis.aiTags)
          ? ((rankingGameForUpdate as any).analysis.aiTags as string[])
          : [];

      // 2. AI タグがない場合のフォールバック: ジャンル / 既存 tags を使う
      const baseGenreTags: string[] = Array.isArray(
        (rankingGameForUpdate as any).genres
      )
        ? (rankingGameForUpdate as any).genres
        : Array.isArray(rankingGameForUpdate.tags)
        ? rankingGameForUpdate.tags
        : [];

      // 既存 JSON data 側に入っている tags（あれば保持）
      const existingDataTags: string[] =
        existing && existing.data && Array.isArray((existing.data as any).tags)
          ? ((existing.data as any).tags as string[])
          : [];

      // 既存カラム側の tags（将来手動で触っていた場合にも対応）
      const existingColumnTags: string[] =
        existing && Array.isArray((existing as any).tags)
          ? ((existing as any).tags as string[])
          : [];

      const mergedTagsSource: string[] =
        aiTagsFromAnalysis.length > 0
          ? aiTagsFromAnalysis
          : [...baseGenreTags, ...existingDataTags, ...existingColumnTags];

      const tagsForCache = normalizeTags(mergedTagsSource);

      // RankingGame 側にも反映して、JSON の data.tags と揃える
      rankingGameForUpdate = {
        ...rankingGameForUpdate,
        tags: tagsForCache,
      };

      if (existing) {
        const { error: updateError } = await supabase
          .from("game_rankings_cache")
          .update({
            app_id: appId, // ← 追加
            title: rankingGameForUpdate.title, // ← 追加
            price: rankingGameForUpdate.price,
            price_original:
              rankingGameForUpdate.priceOriginal ?? rankingGameForUpdate.price,
            discount_percent: rankingGameForUpdate.discountPercent ?? 0,
            is_on_sale: rankingGameForUpdate.isOnSale ?? false,
            // 🔸 カラム側 tags も更新
            tags: Array.isArray(rankingGameForUpdate.tags)
              ? rankingGameForUpdate.tags
              : [],
            // 🔸 JSON 側 data（data.tags 内もすでに上で揃えている）
            data: rankingGameForUpdate, // 既存 JSON も更新
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error("Update error in game_rankings_cache", updateError);
          results.push({
            appId,
            status: "error",
            message: updateError.message,
          });
          continue;
        }

        skippedExisting++; // 既存行の更新としてカウント
        inserted++; // UI 的には「処理成功」として数えたいので increment
        results.push({ appId, status: "ok" });
      } else {
        const { error: insertError } = await supabase
          .from("game_rankings_cache")
          .insert({
            app_id: appId,
            title: rankingGameForUpdate.title,
            price: rankingGameForUpdate.price,
            price_original:
              rankingGameForUpdate.priceOriginal ?? rankingGameForUpdate.price,
            discount_percent: rankingGameForUpdate.discountPercent ?? 0,
            is_on_sale: rankingGameForUpdate.isOnSale ?? false,
            // 🔸 カラム側 tags
            tags: Array.isArray(rankingGameForUpdate.tags)
              ? rankingGameForUpdate.tags
              : [],
            // 🔸 JSON 側 data.tags
            data: rankingGameForUpdate,
          });

        if (insertError) {
          console.error("Insert error in game_rankings_cache", insertError);
          results.push({
            appId,
            status: "error",
            message: insertError.message,
          });
          continue;
        }

        inserted++;
        results.push({ appId, status: "ok" });
      }
    } catch (e) {
      console.error("Error importing appId from steam_games", appId, e);
      results.push({
        appId,
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { inserted, skippedExisting, results };
}

/**
 * Import 済みの appId 群に対して analyze-game を実行し、
 * game_rankings_cache.data.analysis / gemLabel を更新する。
 *
 * - 既に analysis が入っている場合はスキップ
 * - 統計上の hidden gem 判定が true のものだけを対象にしても良いが、
 *   ここでは「import されたもの全て」をベースにしつつ
 *   analysis が null のものだけに絞る。
 */
async function runAiAnalysisForAppIds(appIds: number[]): Promise<void> {
  for (const appId of appIds) {
    try {
      const appIdStr = String(appId);

      const { data: existing, error } = await supabase
        .from("game_rankings_cache")
        .select("id, data, feature_labels")
        .eq("data->>appId", appIdStr)
        .maybeSingle();

      if (error) {
        console.error(
          "runAiAnalysisForAppIds: select error in game_rankings_cache",
          appId,
          error
        );
        continue;
      }

      if (!existing || !existing.data || typeof existing.data !== "object") {
        console.warn(
          "runAiAnalysisForAppIds: no existing row for appId",
          appId
        );
        continue;
      }

      const currentData = existing.data as any;
      const savedAnalysis = currentData?.analysis ?? null;

      // ★ AI には reviews も渡すが、DB に保存するときは捨てたいのでここで分離
      const {
        reviews,
        earlyReviews,
        recentReviews,
        earlyWindowStats,
        recentWindowStats,
        ...baseDataForStorage
      } = currentData || {};

      if ((baseDataForStorage as any).analysis) {
        delete (baseDataForStorage as any).analysis;
      }

      // mood_scores 再計算用に既存スコアを控えておく
  
      let moodScores: MoodVector | null =
        baseDataForStorage.mood_scores ?? null;

      const payload = currentData;

      const res = await fetch(ANALYZE_GAME_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error(
          "runAiAnalysisForAppIds: analyze-game failed for appId",
          appId,
          await res.text()
        );
        continue;
      }

      const aiResult = await res.json();
      if (!aiResult || typeof aiResult !== "object") {
        console.error(
          "runAiAnalysisForAppIds: invalid AI response for appId",
          appId,
          aiResult
        );
        continue;
      }

            // 🔽 AI 解析結果から mood_scores 用のタグを決定
      const aiTagsFromResult: string[] =
        aiResult &&
        typeof aiResult === "object" &&
        Array.isArray((aiResult as any).aiTags)
          ? ((aiResult as any).aiTags as string[])
          : [];

      // 既存の data.tags があれば優先し、無ければ aiTags を使う
      let tagsForMood: string[] = Array.isArray(
        (baseDataForStorage as any).tags
      )
        ? ((baseDataForStorage as any).tags as string[])
        : [];

      if (tagsForMood.length === 0 && aiTagsFromResult.length > 0) {
        tagsForMood = aiTagsFromResult;
      }

      // ★ AI 解析結果を踏まえて mood_scores を再計算
      if (tagsForMood.length > 0) {
        try {
          moodScores = buildMoodFromTagsAndAnalysis(tagsForMood, aiResult);
        } catch (e) {
          console.error(
            "runAiAnalysisForAppIds: failed to rebuild mood_scores",
            appId,
            e
          );
          // 失敗した場合は既存の moodScores をそのまま残す
        }
      }


      // ★ AI 解析結果を踏まえて mood_scores を再計算
      if (tagsForMood.length > 0) {
        try {
          moodScores = buildMoodFromTagsAndAnalysis(tagsForMood, aiResult);
        } catch (e) {
          console.error(
            "runAiAnalysisForAppIds: failed to rebuild mood_scores",
            appId,
            e
          );
          // 失敗した場合は既存の moodScores をそのまま残す
        }
      }

      const existingTagsFromData: string[] = Array.isArray(
        (baseDataForStorage as any).tags
      )
        ? ((baseDataForStorage as any).tags as string[])
        : [];

      const finalTagsForGame = normalizeTags(
        aiTagsFromResult.length > 0 ? aiTagsFromResult : existingTagsFromData
      );

      const previousAnalysis =
        (savedAnalysis ?? {}) as Record<string, unknown>;

      const updatedData: Record<string, any> = {
        // ★ レビュー配列などを除いたコンパクトな JSON ＋ AI 解析結果だけを保存
        ...baseDataForStorage,
        mood_scores: moodScores,
        // 🔸 JSON 側の tags もここで上書き
        tags: finalTagsForGame,
      };

      // gemLabel（AI側で付与されたラベル）があれば反映
      if (typeof (aiResult as any).gemLabel === "string") {
        updatedData.gemLabel = (aiResult as any).gemLabel;
      }

      // ★ 追加: scores / scoreHighlights も保存
      if (aiResult && typeof aiResult === "object") {
        const anyResult = aiResult as any;

        if (anyResult.scores && typeof anyResult.scores === "object") {
          updatedData.scores = anyResult.scores;
        }

        if (Array.isArray(anyResult.scoreHighlights)) {
          updatedData.scoreHighlights = anyResult.scoreHighlights;
        }
      }

      const aiAnalysisRaw =
        (aiResult as any).analysis ?? (aiResult ?? null) ?? null;
      const aiAnalysis =
        aiAnalysisRaw && typeof aiAnalysisRaw === "object"
          ? aiAnalysisRaw
          : {};
      const persistedFeatureLabelsV2 = Array.isArray(
        (existing as any).feature_labels
      )
        ? normalizeAnalysisFeatureLabelsV2(
            (existing as any).feature_labels.filter(
              (label): label is string => typeof label === "string"
            )
          )
        : [];
      const persistedFeatureLabelsV2Raw = Array.isArray(
        previousAnalysis.featureLabelsV2Raw
      )
        ? normalizeAnalysisFeatureLabelsV2Raw(
            previousAnalysis.featureLabelsV2Raw as unknown
          )
        : [];

      const aiRawFeatureLabelsV2 = Array.isArray(aiAnalysis.featureLabelsV2Raw)
        ? (aiAnalysis.featureLabelsV2Raw as unknown[]).filter(
            (label): label is string => typeof label === "string"
          )
        : [];
      const aiCanonicalFeatureLabelsV2 = Array.isArray(aiAnalysis.featureLabelsV2)
        ? (aiAnalysis.featureLabelsV2 as unknown[]).filter(
            (label): label is string => typeof label === "string"
          )
        : [];
      const aiFeatureLabelsV2RawCandidates: string[] = [];
      aiFeatureLabelsV2RawCandidates.push(...aiRawFeatureLabelsV2);
      if (
        aiFeatureLabelsV2RawCandidates.length === 0 &&
        aiCanonicalFeatureLabelsV2.length > 0
      ) {
        aiFeatureLabelsV2RawCandidates.push(...aiCanonicalFeatureLabelsV2);
      }

      const finalFeatureLabelsV2Raw = normalizeAnalysisFeatureLabelsV2Raw([
        ...persistedFeatureLabelsV2Raw,
        ...aiFeatureLabelsV2RawCandidates,
      ]);

      const aiFeatureLabelsV2Candidates = aiCanonicalFeatureLabelsV2;

      const finalFeatureLabelsV2 = normalizeAnalysisFeatureLabelsV2([
        ...aiFeatureLabelsV2Candidates,
        ...persistedFeatureLabelsV2,
      ]);

      const mergedAnalysis = {
        ...previousAnalysis,
        ...aiAnalysis,
        featureLabelsV2: finalFeatureLabelsV2,
        featureLabelsV2Raw: finalFeatureLabelsV2Raw,
      };
      delete (mergedAnalysis as any).featureLabels;

      updatedData.analysis = mergedAnalysis;

      const { error: updateError } = await supabase
        .from("game_rankings_cache")
        .update({
          data: updatedData,
          tags: finalTagsForGame,
          feature_labels: finalFeatureLabelsV2,
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error(
          "runAiAnalysisForAppIds: update error in game_rankings_cache",
          appId,
          updateError
        );
        continue;
      }

      console.log(
        "runAiAnalysisForAppIds: stored AI analysis for appId",
        appId
      );
    } catch (e) {
      console.error(
        "runAiAnalysisForAppIds: unexpected error for appId",
        appId,
        e
      );
    }
  }
}

async function fetchCandidateGamesByFilters(params: FilterParams): Promise<{
  candidates: ImportCandidate[];
  totalCandidates: number;
}> {
  const {
    recentDays,
    minPositiveRatio,
    minTotalReviews,
    maxEstimatedOwners,
    maxPrice,
    tags,
    limit = 200,
    filterAppId,
    titleQuery,
    // ★ 追加
    releaseFrom,
    releaseTo,
  } = params;

  let query = supabase.from("steam_games").select(
    `
        app_id,
        title,
        positive_ratio,
        total_reviews,
        estimated_owners,
        price,
        store_genres,
        release_date,
        release_year,
        last_steam_fetch_at
      `,
    { count: "exact" }
  );

  if (filterAppId != null) {
    query = query.eq("app_id", filterAppId);
  }

  if (titleQuery && titleQuery.trim().length > 0) {
    query = query.ilike("title", `%${titleQuery.trim()}%`);
  }

  // 直近◯日フィルタ（release_date 基準）
  if (recentDays && recentDays > 0) {
    const since = new Date();
    since.setDate(since.getDate() - recentDays);
    const sinceIso = since.toISOString();

    // ★ 基準を last_steam_fetch_at → release_date に変更
    query = query.gte("release_date", sinceIso);
  }

  // ★ 発売年月フィルタ（"YYYY-MM" を期待）
  if (releaseFrom) {
    // "YYYY-MM" → "YYYY-MM-01"
    const fromDate = `${releaseFrom}-01`;
    query = query.gte("release_date", fromDate);
  }

  if (releaseTo) {
    const [y, m] = releaseTo.split("-").map((v: string) => Number(v));
    if (y && m) {
      const lastDay = new Date(y, m, 0).getDate(); // 月末日
      const toDate = `${releaseTo}-${String(lastDay).padStart(
        2,
        "0"
      )}T23:59:59Z`;
      query = query.lte("release_date", toDate);
    }
  }

  if (minPositiveRatio != null) {
    query = query.gte("positive_ratio", minPositiveRatio);
  }

  if (minTotalReviews != null) {
    query = query.gte("total_reviews", minTotalReviews);
  }

  if (maxEstimatedOwners != null) {
    query = query.lte("estimated_owners", maxEstimatedOwners);
  }

  if (maxPrice != null) {
    query = query.lte("price", maxPrice);
  }

  if (tags && tags.length > 0) {
    // tags は text[] を想定（jsonb[] でも contains でOK）
    query = query.contains("tags", tags);
  }

  query = query.limit(limit);

  const { data, error, count } = await query;

  if (error) {
    console.error("fetchCandidateGamesByFilters error", error);
    throw new Error(error.message);
  }

  const candidates: ImportCandidate[] =
    (data ?? []).map((row: any) => ({
      appId: row.app_id,
      title: row.title,
      positiveRatio: row.positive_ratio ?? 0,
      totalReviews: row.total_reviews ?? 0,
      estimatedOwners: row.estimated_owners ?? 0,
      price: row.price ?? 0,
      tags: row.store_genres ?? [],
      // ★ 発売日があればそちらを優先、なければ取得日時
      releaseDate: row.release_date ?? row.last_steam_fetch_at ?? undefined,
    })) ?? [];

  return {
    candidates,
    totalCandidates: count ?? candidates.length,
  };
}

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// ▼ 日付文字列からリリース年を抽出するユーティリティ
