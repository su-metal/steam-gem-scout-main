// supabase/functions/import-steam-games/index.ts
// Steam の AppID を指定して、game_rankings_cache に upsert する Edge Function
// 単発 (appId) / 複数 (appIds) 両対応

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
  analysis: Analysis;
  gemLabel: string;
  isStatisticallyHidden: boolean;
  releaseDate: string;
  releaseYear: number;
  // 必要なら isAvailableInStore など、DB側のカラムに合わせて追加
  isAvailableInStore?: boolean;
};

type ImportRequestBody = { appId: number } | { appIds: number[] };

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
    const body = (await req.json()) as ImportRequestBody;

    // body から appIds を配列として取り出す
    const appIds: number[] = Array.isArray((body as any).appIds)
      ? (body as any).appIds
      : (body as any).appId
        ? [(body as any).appId]
        : [];

    if (!appIds.length) {
      return new Response(JSON.stringify({ error: "appId or appIds is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const results: { appId: number; status: "ok" | "error"; message?: string }[] = [];

    for (const appId of appIds) {
      try {
        const rankingGame = await fetchAndBuildRankingGame(appId);
        if (!rankingGame) {
          results.push({
            appId,
            status: "error",
            message: "Failed to build RankingGame",
          });
          continue;
        }

        const { error } = await supabase
          .from("game_rankings_cache")
          // 🔧 カラム名が snake_case の場合はここを調整してください
          .upsert(rankingGame, {
            onConflict: "appId", // 例: snake_case なら "app_id"
          });

        if (error) {
          console.error("Supabase upsert error", error);
          results.push({
            appId,
            status: "error",
            message: error.message,
          });
        } else {
          results.push({
            appId,
            status: "ok",
          });
        }
      } catch (e) {
        console.error("Error importing appId", appId, e);
        results.push({
          appId,
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: results.length,
        results,
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (e) {
    console.error("Unexpected error in import-steam-games", e);
    return new Response(
      JSON.stringify({
        error: "Unexpected error",
        detail: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: corsHeaders },
    );
  }
});

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// ▼ Steam API から情報を取って RankingGame 形式に組み立てるコア処理
async function fetchAndBuildRankingGame(appId: number): Promise<RankingGame | null> {
  // Store API（キー不要だが、将来の拡張に備えて STEAM_API_KEY も env から取得済み）
  const url = `${STEAM_APP_DETAILS_URL}?appids=${appId}&cc=us&l=en`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error("Failed to fetch Steam app details", appId, res.status);
    return null;
  }

  const json = (await res.json()) as Record<
    string,
    {
      success: boolean;
      data?: any;
    }
  >;

  const appDataWrapper = json[String(appId)];
  if (!appDataWrapper || !appDataWrapper.success || !appDataWrapper.data) {
    console.error("No data for appId", appId);
    return null;
  }

  const data = appDataWrapper.data;

  const title: string = data.name ?? `App ${appId}`;
  const price: number = data.price_overview?.final != null ? data.price_overview.final / 100 : 0;

  const releaseDateStr: string = data.release_date?.date ?? "";
  const releaseYear: number = parseReleaseYear(releaseDateStr);

  const tags: string[] = [];
  if (Array.isArray(data.genres)) {
    for (const g of data.genres) {
      if (g?.description) tags.push(g.description);
    }
  }

  // Store API だけだとレビューの詳細な統計までは取れないので、
  // ここではダミー値を入れておき、後続の AI 解析パイプラインで上書きする想定。
  const positiveRatio = 0;
  const totalReviews = data.recommendations?.total ?? 0;
  const reviewScoreDesc: string = data.metacritic?.score != null ? `Metacritic: ${data.metacritic.score}` : "Unknown";

  const nowIso = new Date().toISOString();

  const analysis: Analysis = {
    hiddenGemVerdict: "Unknown",
    summary: "",
    labels: [],
    pros: [],
    cons: [],
    riskScore: 0,
    bugRisk: 0,
    refundMentions: 0,
    reviewQualityScore: 0,
  };

  const rankingGame: RankingGame = {
    appId,
    title,
    positiveRatio,
    totalReviews,
    estimatedOwners: 0,
    recentPlayers: 0,
    price,
    averagePlaytime: 0,
    lastUpdated: nowIso,
    tags,
    steamUrl: `https://store.steampowered.com/app/${appId}`,
    reviewScoreDesc,
    analysis,
    gemLabel: "",
    isStatisticallyHidden: false,
    releaseDate: releaseDateStr,
    releaseYear,
    isAvailableInStore: true,
  };

  return rankingGame;
}

function parseReleaseYear(releaseDate: string): number {
  if (!releaseDate) return 0;
  // 例: "30 Aug, 2024" / "2023" など、ざっくり年だけ抜き出す
  const yearMatch = releaseDate.match(/\d{4}/);
  if (!yearMatch) return 0;
  return Number(yearMatch[0]) || 0;
}
