// @ts-nocheck

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

// Supabase client (use service role key for full DB access inside Edge Function)
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Steam API (we only use the public store API, key is optional here)
const STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";

type HiddenGemVerdict = "Yes" | "No" | "Unknown";

interface GameAnalysis {
  hiddenGemVerdict: HiddenGemVerdict;
  summary: string;
  labels: string[];
  pros: string[];
  cons: string[];
  riskScore: number;
  bugRisk: number;
  refundMentions: number;
  reviewQualityScore: number;

  // ★ アップデ前後の変化情報（analyze-hidden-gem で追加したやつ）
  currentStateSummary?: string;
  historicalIssuesSummary?: string;
  hasImprovedSinceLaunch?: boolean;
  stabilityTrend?: "Improving" | "Stable" | "Deteriorating";
}

interface RankingGameData {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number; // ドル単位
  averagePlaytime: number; // 時間（今は 0）
  lastUpdated: string; // ISO 文字列
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  analysis: GameAnalysis;
    gemLabel:
    | "Hidden Gem"
    | "Improved Hidden Gem"
    | "Emerging Gem"
    | "Highly rated but not hidden"
    | "Not a hidden gem";

  isStatisticallyHidden: boolean;
  releaseDate: string;
  releaseYear: number;
  isAvailableInStore: boolean;
}

type ImportResult = {
  appId: number;
  status: "ok" | "error";
  message?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Only POST is supported for import" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      appId?: number;
      appIds?: number[];
    };

    const appIds: number[] = Array.isArray(body.appIds)
      ? body.appIds.map((v) => Number(v)).filter((n) => !Number.isNaN(n))
      : body.appId != null
      ? [Number(body.appId)].filter((n) => !Number.isNaN(n))
      : [];

    if (appIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "appId or appIds is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Importing Steam apps:", appIds);

    const results: ImportResult[] = [];

    for (const appId of appIds) {
      try {
        const rankingGame = await fetchAndBuildRankingGame(appId);
        if (!rankingGame) {
          results.push({
            appId,
            status: "error",
            message: "Failed to build ranking game from Steam data",
          });
          continue;
        }

        const { data: existing, error: selectError } = await supabase
          .from("game_rankings_cache")
          .select("id")
          .eq("data->>appId", appId.toString())
          .maybeSingle();

        if (selectError) {
          console.error("Select error", selectError);
          results.push({
            appId,
            status: "error",
            message: selectError.message,
          });
          continue;
        }

        if (existing) {
          const { error: updateError } = await supabase
            .from("game_rankings_cache")
            .update({ data: rankingGame })
            .eq("id", existing.id);

          if (updateError) {
            console.error("Update error", updateError);
            results.push({
              appId,
              status: "error",
              message: updateError.message,
            });
          } else {
            results.push({ appId, status: "ok" });
          }
        } else {
          const { error: insertError } = await supabase
            .from("game_rankings_cache")
            .insert({ data: rankingGame });

          if (insertError) {
            console.error("Insert error", insertError);
            results.push({
              appId,
              status: "error",
              message: insertError.message,
            });
          } else {
            results.push({ appId, status: "ok" });
          }
        }
      } catch (e) {
        console.error("Unexpected error while importing", appId, e);
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
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Exception in import function:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function analyzeGameWithAI(params: {
  appId: number;
  title: string;
  tags: string[];
  positiveRatio: number;
  totalReviews: number;
  price: number;
  sampleReviews: string[];
}): Promise<GameAnalysis> {
  const {
    appId,
    title,
    tags,
    positiveRatio,
    totalReviews,
    price,
    sampleReviews,
  } = params;

  // デフォルト値（エラーやAPI失敗時の保険）
  const defaultAnalysis: GameAnalysis = {
    hiddenGemVerdict: "Unknown",
    summary: "",
    labels: [],
    pros: [],
    cons: [],
    riskScore: 5,
    bugRisk: 5,
    refundMentions: 0,
    reviewQualityScore: 5,
  };

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set");
    return defaultAnalysis;
  }

  const hasReviews = sampleReviews && sampleReviews.length > 0;

  const reviewsSection = hasReviews
    ? `【レビュー本文サンプル（最大20件程度）】
${sampleReviews.map((r, i) => `#${i + 1}: ${r}`).join("\n")}`
    : `【レビュー本文サンプル】
（ユーザーレビューがほとんど存在しないか、取得できませんでした。レビュー不足がある場合は、その前提を明示しつつ、数値情報を中心に慎重に評価してください。）`;

  const prompt = `
あなたはSteamゲームのレビュー解析を行うアシスタントです。
以下の情報とユーザーレビューをもとに、日本語で要約とスコアリングを行ってください。

【ゲーム情報】
- タイトル: ${title}
- AppID: ${appId}
- ジャンル/タグ: ${tags.join(", ")}
- 高評価率: ${positiveRatio}%
- レビュー総数: ${totalReviews}
- 価格(ドル): ${price}

${reviewsSection}

出力フォーマット（必ず VALID な JSON のみ。説明文は禁止）:

{
  "hiddenGemVerdict": "Yes" | "No" | "Unknown",
  "summary": "日本語で2〜3文の要約",
  "labels": ["短い日本語ラベルを3〜6個"],
  "pros": ["良い点を日本語で3〜6個の箇条書き"],
  "cons": ["注意点・悪い点を日本語で2〜5個の箇条書き"],
  "riskScore": 1〜10の整数,
  "bugRisk": 1〜10の整数,
  "refundMentions": 0〜20の整数,
  "reviewQualityScore": 1〜10の整数
}
`.trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "o3-mini",
      messages: [
        {
          role: "system",
          content: "You are a JSON-only API. Always respond with valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error", response.status, errorText);
    return defaultAnalysis;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(content) as GameAnalysis;
    return parsed;
  } catch (_e) {
    console.error("Failed to parse AI analysis JSON", content);
    return defaultAnalysis;
  }
}


/**
 * Fetches Steam app details and builds a RankingGame-like JSON object.
 */
async function fetchAndBuildRankingGame(
  appId: number
): Promise<RankingGameData | null> {
  // 1) ストア詳細
  const detailsUrl = `${STEAM_APP_DETAILS_URL}?appids=${appId}&cc=us&l=en`;

  const detailsRes = await fetch(detailsUrl);
  if (!detailsRes.ok) {
    console.error(
      "Failed to fetch Steam app details",
      appId,
      detailsRes.status
    );
    return null;
  }

  const detailsJson = (await detailsRes.json()) as Record<
    string,
    {
      success: boolean;
      data?: any;
    }
  >;

  const wrapper = detailsJson[String(appId)];
  if (!wrapper || !wrapper.success || !wrapper.data) {
    console.error("No data for appId", appId);
    return null;
  }

  const data = wrapper.data;

  const title: string = data.name ?? `App ${appId}`;

  // 🔹 price_overview.final は「セント」なので /100 してドルに統一
  const price: number =
    data.price_overview?.final != null ? data.price_overview.final / 100 : 0;

  const releaseDateStr: string = data.release_date?.date ?? "";
  const releaseYear: number = parseReleaseYear(releaseDateStr);

  const tags: string[] = [];
  if (Array.isArray(data.genres)) {
    for (const g of data.genres) {
      if (g?.description) tags.push(g.description);
    }
  }

    // 2) レビュー API から本物の高評価率を取る ＋ レビュー本文サンプル取得
  // ※ 古いタイトルでもレビューがちゃんと取れるように filter=all に変更し、件数も増やす
  const reviewsUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&filter=all&num_per_page=100`;


  let sampleReviews: string[] = []; // ★ 後で AI 解析に使うレビュー本文
  let totalReviews = 0;
  let positiveRatio = 0; // ★ 後で整数パーセントを入れる
  let steamReviewDesc = "";

  try {
    const reviewsRes = await fetch(reviewsUrl);

    if (reviewsRes.ok) {
      const reviewsJson = (await reviewsRes.json()) as any;
      const qs = reviewsJson.query_summary ?? {};

      const totalPositive = Number(qs.total_positive ?? 0);
      const totalNegative = Number(qs.total_negative ?? 0);
      const sum = totalPositive + totalNegative;

      totalReviews = Number(qs.total_reviews ?? sum ?? 0);
      steamReviewDesc =
        qs.review_score_desc ?? reviewsJson.review_score_desc ?? "";

      if (sum > 0) {
        // 🔹 ここで整数に丸めて保存する（小数を残さない）
        positiveRatio = Math.round((totalPositive / sum) * 100);
      }
      // ★ レビュー本文サンプルを最大20件取得
      const rawReviews = Array.isArray(reviewsJson.reviews)
        ? reviewsJson.reviews
        : [];

      sampleReviews = rawReviews
        .map((r: any) => (typeof r.review === "string" ? r.review.trim() : ""))
        .filter((t: string) => t.length > 0)
        .slice(0, 20);
    } else {
      console.error("Failed to fetch appreviews", appId, reviewsRes.status);
    }
  } catch (e) {
    console.error("Error while fetching appreviews", appId, e);
  }

  // 3) メタスコアもあれば補足情報として使う
  const metacriticScore: number = data.metacritic?.score ?? 0;
  const metacriticPart =
    metacriticScore > 0 ? `Metacritic: ${metacriticScore}` : "";

  // カードに出すための reviewScoreDesc は、
  // Steam の評価テキスト + Metacritic を合わせた軽い説明にしておく
  let reviewScoreDesc = steamReviewDesc;
  if (metacriticPart) {
    reviewScoreDesc = reviewScoreDesc
      ? `${reviewScoreDesc} • ${metacriticPart}`
      : metacriticPart;
  }
  if (!reviewScoreDesc) {
    reviewScoreDesc = "No reviews yet";
  }

  // 4) 推定オーナー数 / Hidden 判定（ざっくりルール）
  const estimatedOwners = totalReviews > 0 ? totalReviews * 30 : 0;

  const isStatisticallyHidden = totalReviews < 2000 || estimatedOwners < 50000;

  let gemLabel = "Not a hidden gem" as
    | "Hidden Gem"
    | "Highly rated but not hidden"
    | "Not a hidden gem";

  const nowIso = new Date().toISOString();

  console.log("Sample reviews fetched", appId, sampleReviews.length);

  const analysis = await analyzeGameWithAI({
    appId,
    title,
    tags,
    positiveRatio,
    totalReviews,
    price,
    sampleReviews,
  });

  console.log("AI analysis finished", appId, {
    reviewQualityScore: analysis.reviewQualityScore,
    bugRisk: analysis.bugRisk,
    refundMentions: analysis.refundMentions,
  });

  // --- AI スコアを使って hiddenGemVerdict / gemLabel を決定する ---

  // 念のため安全なデフォルトを入れておく
  const reviewQualityScore = analysis.reviewQualityScore ?? 5;
  const bugRisk = analysis.bugRisk ?? 5;
  const refundMentions = analysis.refundMentions ?? 0;
  const improved = analysis.hasImprovedSinceLaunch ?? false;
  const trend = analysis.stabilityTrend ?? "Stable"; // Improving / Stable / Deteriorating

    // --- Updated Hidden Gem Verdict Logic (recent state prioritized) ---

  if (trend === "Deteriorating") {
    // 最近悪化 → Hidden Gem として推奨しない
    analysis.hiddenGemVerdict = "No";
  } else if (reviewQualityScore >= 8 && bugRisk <= 4 && refundMentions <= 3) {
    // 高品質かつ低リスク
    analysis.hiddenGemVerdict = "Yes";
  } else if (reviewQualityScore >= 7) {
    // 曖昧・情報不足
    analysis.hiddenGemVerdict = "Unknown";
  } else {
    // 品質が低い
    analysis.hiddenGemVerdict = "No";
  }

  // ★ 改善していたら、その情報を重み付け
  if (improved && analysis.hiddenGemVerdict === "Unknown") {
    analysis.hiddenGemVerdict = "Yes"; // “復活した Hidden Gem” パターン
  }


    // --- Advanced gemLabel with update-aware logic ---
  if (
    isStatisticallyHidden &&
    positiveRatio >= 85 &&
    analysis.hiddenGemVerdict === "Yes"
  ) {
    if (trend === "Improving" || improved) {
      gemLabel = "Improved Hidden Gem"; // ★ 昔は微妙、今は良くなった
    } else {
      gemLabel = "Hidden Gem";
    }
  } else if (
    isStatisticallyHidden &&
    positiveRatio >= 80 &&
    analysis.hiddenGemVerdict !== "No"
  ) {
    gemLabel = "Emerging Gem"; // ★ ほぼHidden。惜しいけど埋もれている
  } else if (positiveRatio >= 85) {
    gemLabel = "Highly rated but not hidden";
  } else {
    gemLabel = "Not a hidden gem";
  }

  // ★ 最近悪化しているなら警告カテゴリ（ただしNot hiddenよりは上）
  if (trend === "Deteriorating") {
    gemLabel = "Not a hidden gem"; // or "Declining title" 作ってもOK
  }

  const rankingGame: RankingGameData = {
    appId,
    title,
    positiveRatio,
    totalReviews,
    estimatedOwners,
    recentPlayers: 0,
    price,
    averagePlaytime: 0,
    lastUpdated: nowIso,
    tags,
    steamUrl: `https://store.steampowered.com/app/${appId}`,
    reviewScoreDesc,
    analysis, // ← ここに AI の結果が入る
    gemLabel,
    isStatisticallyHidden,
    releaseDate: releaseDateStr,
    releaseYear,
    isAvailableInStore: true,
  };

  console.log("Built rankingGame with real Steam ratio", appId, {
    positiveRatio,
    totalReviews,
    reviewScoreDesc,
    price,
  });

  return rankingGame;
}

function parseReleaseYear(releaseDate: string): number {
  if (!releaseDate) return 0;
  const match = releaseDate.match(/\d{4}/);
  if (!match) return 0;
  return Number(match[0]) || 0;
}
