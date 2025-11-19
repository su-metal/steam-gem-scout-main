// supabase/functions/import-steam-games/index.ts
// Steam の AppID を指定して、game_rankings_cache に upsert する Edge Function
// 単発 (appId) / 複数 (appIds) 両対応
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

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
};

type RankingGame = {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number;
  averagePlaytime: number;
  lastUpdated: string;
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  analysis: Analysis | null;
  gemLabel: string;
  isStatisticallyHidden: boolean;
  releaseDate: string;
  releaseYear: number;
  isAvailableInStore: boolean;
};

type ImportSteamGamesRequest =
  | { appId: number }
  | { appIds: number[] }
  | {
      recentDays?: number;
      minPositiveRatio?: number;
      minTotalReviews?: number;
      maxEstimatedOwners?: number;
      maxPrice?: number;
      tags?: string[];
      limit?: number;
      dryRun?: boolean;
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY") ?? "";

// Supabase サーバーサイドクライアント
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";

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
    } = body as any;

    if (
      recentDays == null &&
      minPositiveRatio == null &&
      minTotalReviews == null &&
      maxEstimatedOwners == null &&
      maxPrice == null &&
      (!tags || !Array.isArray(tags) || tags.length === 0)
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
    });

    // dryRun: true → プレビュー用。DB には書かない
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

    // dryRun でなければ、候補を game_rankings_cache に流し込む
    const appIds = candidates.map((c) => c.appId);
    const { inserted, skippedExisting } = await upsertGamesToRankingsCache(
      appIds
    );

    const response: ImportSteamGamesResult = {
      totalCandidates,
      inserted,
      skippedExisting,
      candidates: undefined,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    console.error("Unexpected error in import-steam-games", e);
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
};

function buildRankingGameFromSteamRow(row: any): RankingGame {
  const appId: number = row.app_id;
  const title: string = row.title ?? `App ${appId}`;

  const positiveRatio: number = row.positive_ratio ?? 0;
  const totalReviews: number = row.total_reviews ?? 0;
  const estimatedOwners: number = row.estimated_owners ?? 0;
  const recentPlayers: number = 0; // steam_games には現状含めていないので 0 で初期化

  const price: number = row.price ?? 0;
  const averagePlaytime: number = row.average_playtime ?? 0;

  const tags: string[] = Array.isArray(row.tags) ? row.tags : [];

  const steamUrl: string =
    row.steam_url ?? `https://store.steampowered.com/app/${appId}`;

  const reviewScoreDesc: string = row.review_score_desc ?? "Unknown";

  // 倉庫の「取得日」を releaseDate としてそのまま使う（プレビューと同じ挙動）
  const releaseDateStr: string = row.last_steam_fetch_at ?? "";
  const releaseYear: number = parseReleaseYear(releaseDateStr);

  const nowIso = new Date().toISOString();

  const rankingGame: RankingGame = {
    appId,
    title,
    positiveRatio,
    totalReviews,
    estimatedOwners,
    recentPlayers,
    price,
    averagePlaytime,
    lastUpdated: nowIso,
    tags,
    steamUrl,
    reviewScoreDesc,
    // ランキング生成時点では AI 解析は未実行なので null
    analysis: null,
    // gemLabel / isStatisticallyHidden も AI 解析 or 別プロセスで後から設定
    gemLabel: "",
    isStatisticallyHidden: false,
    releaseDate: releaseDateStr,
    releaseYear,
    isAvailableInStore: true,
  };

  return rankingGame;
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
  let skippedExisting = 0; // 現状は upsert の結果からは区別していない

  if (!appIds.length) {
    return { inserted, skippedExisting, results };
  }

  // まず、対象の appId に対応する steam_games の行をまとめて取得する
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
        average_playtime,
        tags,
        steam_url,
        review_score_desc,
        last_steam_fetch_at
      `
    )
    .in("app_id", appIds);

  if (error) {
    console.error("supabase steam_games fetch error", error);
    // 全体エラーとして扱う
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
    rowsByAppId.set(row.app_id, row);
  }

  for (const appId of appIds) {
    try {
      const row = rowsByAppId.get(appId);
      if (!row) {
        results.push({
          appId,
          status: "error",
          message: "steam_games row not found for this appId",
        });
        continue;
      }

      const rankingGame = buildRankingGameFromSteamRow(row);

      const { error: upsertError } = await supabase
        .from("game_rankings_cache")
        .upsert(rankingGame, {
          onConflict: "appId", // snake_case の場合は "app_id" などに変更
        });

      if (upsertError) {
        console.error("Supabase upsert error", upsertError);
        results.push({
          appId,
          status: "error",
          message: upsertError.message,
        });
      } else {
        inserted++;
        results.push({
          appId,
          status: "ok",
        });
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
  } = params;

  let query = supabase.from("steam_games").select(
    `
        app_id,
        title,
        positive_ratio,
        total_reviews,
        estimated_owners,
        price,
        tags,
        last_steam_fetch_at
      `,
    { count: "exact" }
  );

  // 直近◯日フィルタ（last_steam_fetch_at 基準）
  if (recentDays && recentDays > 0) {
    const since = new Date();
    since.setDate(since.getDate() - recentDays);
    query = query.gte("last_steam_fetch_at", since.toISOString());
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
      tags: row.tags ?? [],
      // フロントでは「取得日」として使える
      releaseDate: row.last_steam_fetch_at ?? undefined,
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
function parseReleaseYear(releaseDate: string): number {
  if (!releaseDate) return 0;
  // 例: "30 Aug, 2024" / "2023" など、ざっくり年だけ抜き出す
  const yearMatch = releaseDate.match(/\d{4}/);
  if (!yearMatch) return 0;
  return Number(yearMatch[0]) || 0;
}
