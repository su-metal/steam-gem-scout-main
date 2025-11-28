// @ts-nocheck
// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseSteamPriceOverview } from "../_shared/price.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// どれくらいの期間は Steam API を再取得しないか（分）
// とりあえず 1440分 = 24時間
const DEFAULT_FRESH_MINUTES = 1440;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { appId, freshnessMinutes } = await req.json();

    if (!appId) {
      return jsonResponse({ error: "appId is required" }, 400);
    }

    const appIdNum = Number(appId);
    const appIdStr = String(appIdNum);
    const freshness =
      typeof freshnessMinutes === "number" && freshnessMinutes > 0
        ? freshnessMinutes
        : DEFAULT_FRESH_MINUTES;

    // 1. まずキャッシュテーブル steam_games を見る
    const { data: cached, error: cacheError } = await supabase
      .from("steam_games")
      .select("*")
      .eq("app_id", appIdNum)
      .maybeSingle();

    if (cacheError) {
      console.error("get-or-create-steam-game cacheError", cacheError);
    }

    const now = Date.now();
    const isFresh =
      cached &&
      cached.last_steam_fetch_at &&
      now - new Date(cached.last_steam_fetch_at).getTime() <
        freshness * 60 * 1000;

    // キャッシュが存在していて、まだ新しければそのまま返す（Steam API は叩かない）
    if (cached && isFresh) {
      return jsonResponse(cached, 200);
    }

    // 2. キャッシュがない or 古いので Steam API を叩く

    // 2-1. Steam Store appdetails
    const detailsRes = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appIdStr}&cc=us&l=en`,
    );
    const detailsJson = await detailsRes.json();
    const details = detailsJson[appIdStr]?.data;

    if (!details) {
      console.warn("Steam appdetails not found for", appIdStr);
      return jsonResponse(
        { error: "Steam appdetails not found" },
        404,
      );
    }

    // 2-2. Steam reviews summary（recent, 最大100件）
    const reviewsRes = await fetch(
      `https://store.steampowered.com/appreviews/${appIdStr}?json=1&filter=recent&language=all&num_per_page=100`,
    );
    const reviewsJson = await reviewsRes.json();
    const summary = reviewsJson.query_summary ?? {};

    const totalReviews = summary.total_reviews ?? 0;
    const totalPositive = summary.total_positive ?? 0;
    const positiveRatio =
      totalReviews > 0 ? (totalPositive / totalReviews) * 100 : 0;

    const {
      priceOriginal,
      priceFinal,
      discountPercent,
      isOnSale,
    } = parseSteamPriceOverview(details.price_overview);
    const metaScore: number | null =
      typeof details.metacritic?.score === "number"
        ? details.metacritic.score
        : null;

    const row: Record<string, any> = {
      app_id: appIdNum,
      title: details.name,
      positive_ratio: positiveRatio,
      total_reviews: totalReviews,
      estimated_owners: cached?.estimated_owners ?? 0, // 必要なら後で別APIで埋める
      average_playtime: details.playtime_forever ?? 0,
      tags: details.genres?.map((g: any) => g.description) ?? [],
      steam_url: `https://store.steampowered.com/app/${appIdStr}`,
      review_score_desc:
        metaScore != null ? `Metacritic: ${metaScore}` : null,
      last_steam_fetch_at: new Date().toISOString(),
    };

    // -----------------------------
    // 価格情報の保存ロジック
    // -----------------------------
    if (priceFinal != null) {
      // 常に「現在有効な価格」は上書き
      row.price = priceFinal; // NOTE: price は常にセール後を含む現在価格

      // 定価(price_original) は Steam から initial が取れたときだけ上書きする
      if (priceOriginal != null) {
        row.price_original = priceOriginal;
      } else if (
        cached &&
        typeof cached.price_original === "number" &&
        Number.isFinite(cached.price_original)
      ) {
        // initial が取れない場合は、既存の定価があればそれを維持
        row.price_original = cached.price_original;
      } else {
        // それも無ければ null のまま（「定価不明」扱い）
        row.price_original = null;
      }

      row.discount_percent = discountPercent;
      row.is_on_sale = isOnSale;
    } else if (cached) {
      // 今回の呼び出しで価格情報が取れなかった場合は、既存キャッシュを尊重
      if (
        typeof cached.price === "number" &&
        Number.isFinite(cached.price)
      ) {
        row.price = cached.price;
      } else {
        row.price = null;
      }

      if (
        typeof cached.price_original === "number" &&
        Number.isFinite(cached.price_original)
      ) {
        row.price_original = cached.price_original;
      } else {
        row.price_original = null;
      }

      row.discount_percent =
        typeof cached.discount_percent === "number" &&
        Number.isFinite(cached.discount_percent)
          ? cached.discount_percent
          : 0;

      row.is_on_sale =
        typeof cached.is_on_sale === "boolean"
          ? cached.is_on_sale
          : false;
    }

    // 3. steam_games に upsert してから返す
    const { data: upserted, error: upsertError } = await supabase
      .from("steam_games")
      .upsert(row)
      .select("*")
      .maybeSingle();

    if (upsertError) {
      console.error("get-or-create-steam-game upsertError", upsertError);
      // upsertが失敗しても、取得した row 自体は返しておく
      return jsonResponse(row, 200);
    }

    return jsonResponse(upserted ?? row, 200);
  } catch (error) {
    console.error("get-or-create-steam-game error", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
