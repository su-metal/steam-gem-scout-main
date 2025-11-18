import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface RankingGame {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number; // cents
  averagePlaytime: number; // minutes
  lastUpdated: string;
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  analysis: {
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
  gemLabel: string;
  isStatisticallyHidden: boolean;
  releaseDate: string;
  releaseYear: number;
  isAvailableInStore?: boolean;
  similarityScore?: number;
}

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    if (req.method !== "POST") {
      // ここは 405 のままでOK（invoke は POST で来る）
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const rawAppId = body?.appId;
    const limit = body?.limit ?? 3;

    // appId を number に揃える
    const appId = Number(rawAppId);

    if (!appId || Number.isNaN(appId)) {
      return new Response(JSON.stringify({ error: "appId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. 対象ゲーム取得
    const { data: target, error: targetError } = await supabase
      .from("game_rankings_cache")
      .select("*")
      .eq("app_id", appId)
      .maybeSingle<RankingGame>();

    if (targetError) {
      console.error("Error fetching target game:", targetError);
      return new Response(JSON.stringify({ error: "Failed to fetch target game" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ✅ 対象がキャッシュに無い場合は「正常系」として扱う
    //    → 404 にしない。空配列を 200 で返す。
    if (!target) {
      console.warn("[get-similar-gems] target game not found in cache. appId=", appId);
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // 2. 候補ゲーム取得
    const { data: candidates, error: candidatesError } = await supabase
      .from("game_rankings_cache")
      .select("*")
      .neq("app_id", appId)
      .gte("analysis->>reviewQualityScore", "7")
      .limit(500);

    if (candidatesError) {
      console.error("Error fetching candidates:", candidatesError);
      return new Response(JSON.stringify({ error: "Failed to fetch candidates" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const targetTags = (target.tags || []).map((t) => t.toLowerCase());
    const targetPlaytime = target.averagePlaytime || 0;
    const targetPrice = target.price || 0;

    const scored = (candidates || [])
      .filter((raw) => {
        const game = raw as RankingGame;
        if (game.isAvailableInStore === false) return false;
        if (!game.tags || game.tags.length === 0) return false;
        return true;
      })
      .map((raw) => {
        const game = raw as RankingGame;

        // Tag similarity
        const tags = (game.tags || []).map((t) => t.toLowerCase());
        const intersectionCount = tags.filter((t) => targetTags.includes(t)).length;
        const unionCount = new Set([...targetTags, ...tags]).size || 1;
        const tagScore = intersectionCount / unionCount;

        // Playtime similarity
        const playtimeDiff = Math.abs((game.averagePlaytime || 0) - targetPlaytime);
        const playtimeScore = Math.max(0, 1 - playtimeDiff / 600);

        // Price similarity
        let priceScore = 0;
        if (targetPrice > 0 && game.price > 0) {
          const minP = Math.min(targetPrice, game.price);
          const maxP = Math.max(targetPrice, game.price);
          priceScore = minP / maxP;
        }

        const similarityScore = tagScore * 0.6 + playtimeScore * 0.25 + priceScore * 0.15;

        return { ...game, similarityScore };
      })
      .filter((g) => (g.similarityScore ?? 0) > 0.15)
      .sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0))
      .slice(0, limit);

    return new Response(JSON.stringify({ data: scored }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("Unexpected error in get-similar-gems:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
