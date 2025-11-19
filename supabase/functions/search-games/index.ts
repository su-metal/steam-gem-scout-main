// supabase/functions/search-games/index.ts

// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

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
}

const toNumber = (val: any, fallback = 0): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
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

    console.log("search-games request body:", body);

    // まずは JSON データをまとめて取得
    const { data, error } = await supabase
      .from("game_rankings_cache")
      .select("data")
      .limit(500);

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

      return {
        appId: toNumber(g.appId, 0),
        title: g.title ?? `App ${g.appId}`,
        positiveRatio: toNumber(g.positiveRatio, 0),
        totalReviews: toNumber(g.totalReviews, 0),
        estimatedOwners: toNumber(g.estimatedOwners, 0),
        recentPlayers: toNumber(g.recentPlayers, 0),
        price: toNumber(g.price, 0),
        averagePlaytime: toNumber(g.averagePlaytime, 0),
        lastUpdated: g.lastUpdated ?? null,
        tags: Array.isArray(g.tags) ? g.tags : [],
        steamUrl: g.steamUrl ?? `https://store.steampowered.com/app/${g.appId}`,
        reviewScoreDesc: g.reviewScoreDesc ?? "",
        analysis: {
          hiddenGemVerdict: analysisRaw.hiddenGemVerdict ?? "Unknown",
          summary: analysisRaw.summary ?? "",
          labels: analysisRaw.labels ?? [],
          pros: analysisRaw.pros ?? [],
          cons: analysisRaw.cons ?? [],
          riskScore: toNumber(analysisRaw.riskScore, 0),
          bugRisk: toNumber(analysisRaw.bugRisk, 0),
          refundMentions: toNumber(analysisRaw.refundMentions, 0),
          reviewQualityScore: toNumber(analysisRaw.reviewQualityScore, 0),
          // ★ ここから追加：「今と昔」関連
          currentStateSummary: analysisRaw.currentStateSummary ?? "",
          historicalIssuesSummary: analysisRaw.historicalIssuesSummary ?? "",
          stabilityTrend: analysisRaw.stabilityTrend ?? "Unknown",
          hasImprovedSinceLaunch: analysisRaw.hasImprovedSinceLaunch ?? false,
          // ★ ここまで
        },
        gemLabel: g.gemLabel ?? "",
        isStatisticallyHidden: g.isStatisticallyHidden ?? false,
        releaseDate: g.releaseDate ?? "",
        releaseYear: toNumber(g.releaseYear, 0),
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
          const base =
            g.releaseDate && typeof g.releaseDate === "string"
              ? new Date(g.releaseDate)
              : g.lastUpdated
              ? new Date(g.lastUpdated)
              : null;
          if (!base || Number.isNaN(base.getTime())) return true; // 情報なければ残す
          const diffDays =
            (now.getTime() - base.getTime()) / (1000 * 60 * 60 * 24);
          return diffDays <= days;
        });
      }
    }

    // ---- ソート ----
    const computeScore = (g: any, custom: boolean) => {
      const analysis = g.analysis ?? {};

      // ★ recommended（custom=false）のときは「AIスコアだけ」で並べる
      if (!custom) {
        // 1〜10 の reviewQualityScore をそのまま使う（なければ 5）
        const rawAi =
          typeof analysis.reviewQualityScore === "number"
            ? analysis.reviewQualityScore
            : 5;
        return rawAi;
      }
      const wAi = custom ? aiWeight : 40;
      const wPos = custom ? positiveRatioWeight : 30;
      const wRev = custom ? reviewCountWeight : 20;
      const wRec = custom ? recencyWeight : 10;

      const totalWeight = wAi + wPos + wRev + wRec || 1;

      // 1〜10 の reviewQualityScore を 0〜1 に正規化
      const aiScore =
        typeof analysis.reviewQualityScore === "number"
          ? analysis.reviewQualityScore / 10
          : 0.5;

      // 0〜100% の positiveRatio を 0〜1 に正規化
      const positiveScore =
        typeof g.positiveRatio === "number" ? g.positiveRatio / 100 : 0.5;

      // レビュー数は log スケールで「多すぎるタイトル」を抑えめに
      const totalReviews =
        typeof g.totalReviews === "number" ? g.totalReviews : 0;
      const reviewScore = Math.min(Math.log10(totalReviews + 1) / 4, 1); // 0〜1 くらい

      // 新しさスコア（releaseYear が無ければ中間の 0.5 相当）
      const currentYear = new Date().getFullYear();
      const releaseYear =
        typeof g.releaseYear === "number" ? g.releaseYear : currentYear;
      const yearDiff = Math.max(0, Math.min(5, currentYear - releaseYear)); // 最大5年差まで見る
      const recencyScore = 1 - yearDiff / 5; // 0〜1（新しいほど1に近い）

      // 重み付き合計を 0〜1 に正規化した「Gem Score」
      const raw =
        aiScore * wAi +
        positiveScore * wPos +
        reviewScore * wRev +
        recencyScore * wRec;

      return raw / totalWeight;
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
          .map((g) => ({
            ...g,
            compositeScore: computeScore(g, isCustom),
          }))
          .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
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
