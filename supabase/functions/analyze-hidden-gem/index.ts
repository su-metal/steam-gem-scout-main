// Supabase Edge Functions 用の型定義。
// ローカルの TypeScript では解決できずエラーになるためコメントアウト。
// /// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReviewWindowStats {
  /** 対象期間内のレビュー件数 */
  reviewCount: number;
  /** 対象期間内のポジティブ率（0-100） */
  positiveRatio: number;
}

interface GameData {
  title: string;
  /** Steam app id (early review fetch 用) */
  appId?: number;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number;
  averagePlaytime: number;
  lastUpdated: string;
  /** 任意：リリース日（ISO 形式など）。履歴判定に使用。 */
  releaseDate?: string;
  tags?: string[];

  /** 全期間のレビュー（互換用。既存実装から渡しているもの） */
  reviews: string[];

  /**
   * 任意：発売初期〜中期あたりのレビュー。
   * あれば current/historical 判定の信頼度に使う。
   */
  earlyReviews?: string[];

  /**
   * 任意：直近のレビュー。
   * あれば current/historical 判定の信頼度に使う。
   */
  recentReviews?: string[];

  /** 任意：期間別の集計値（レビュー数・ポジ率など）。あれば優先して使用。 */
  earlyWindowStats?: ReviewWindowStats;
  recentWindowStats?: ReviewWindowStats;
}

interface EarlyRecentBlocks {
  historicalReviews: string[];
  recentReviews: string[];
  meta: {
    historicalSource: "earlyReviews" | "allReviewsHead" | "empty";
    recentSource: "recentReviews" | "allReviewsTail" | "empty";
    historicalCount: number;
    recentCount: number;
  };
}

interface HiddenGemAnalysis {
  hiddenGemVerdict: "Yes" | "No" | "Unknown";
  summary: string;
  labels: string[];
  pros: string[];
  cons: string[];
  riskScore: number;
  bugRisk: number;
  refundMentions: number;
  reviewQualityScore: number;

  /**
   * 現在のバージョン（最近のレビューから推測した状態）の要約。
   * 例: 「最近のパッチ以降、安定性が大きく改善され高評価が増えている」
   */
  currentStateSummary?: string | null;

  /**
   * 過去のバージョンで多かった問題の要約。
   * 例: 「ローンチ直後はクラッシュや最適化不足への不満が多かった」
   */
  historicalIssuesSummary?: string | null;

  /**
   * 初期バージョンと比較して改善したと判断されるかどうか。
   * 例: true のとき「昔は微妙だったが今は良くなった」系タイトル。
   */
  hasImprovedSinceLaunch?: boolean | null;

  /**
   * 安定性や全体評価のトレンド。
   * - "Improving": 問題が減って評価が改善している
   * - "Stable": 大きな変化はなく安定
   * - "Deteriorating": アプデ後に悪化している
   */
  stabilityTrend?: "Improving" | "Stable" | "Deteriorating" | "Unknown" | null;

  /**
   * 「現在の状態」に関する分析の信頼度。
   * early/recent どちらにも十分なレビューがある場合は "high"。
   */
  currentStateReliability?: "high" | "medium" | "low" | null;

  /**
   * 「過去の問題」に関する分析の信頼度。
   */
  historicalIssuesReliability?: "high" | "medium" | "low" | null;

  aiError?: boolean;
}

// Limits to keep review input safely within token constraints
const MAX_REVIEWS = 15;
const MAX_REVIEW_CHARS = 500;
const MAX_TOTAL_REVIEW_CHARS = 12000;

// 早期レビュー用の設定
const EARLY_REVIEW_WINDOW_DAYS = 30; // 発売日から何日までを「初期」とみなすか
const MAX_EARLY_REVIEW_PAGES = 5; // Steam API を何ページまで遡るか（負荷制御用）
const MIN_EARLY_REVIEW_SAMPLES = 5; // これ未満なら「初期レビューが薄い」とみなす

// 「過去」と「現在」を分けて評価するために必要な最低レビュー数

// 「過去/現在」の履歴を信頼するために必要な最低経過日数（単位: 日）

// Fallback object used when AI analysis fails
function buildFallbackAnalysis(
  errorMessage?: string,
  opts?: {
    title?: string;
    currentStateReliability?: "high" | "medium" | "low";
    historicalIssuesReliability?: "high" | "medium" | "low";
  }
): HiddenGemAnalysis {
  const title = opts?.title ?? "this game";
  const currentRel = opts?.currentStateReliability ?? null;
  const historicalRel = opts?.historicalIssuesReliability ?? null;

  return {
    hiddenGemVerdict: "Unknown",
    summary:
      "AI analysis failed. Showing fallback values based on basic metrics only.",
    labels: ["AI-error", "fallback"],
    pros: [],
    cons: [],
    riskScore: 5,
    bugRisk: 5,
    refundMentions: 5,
    reviewQualityScore: 5,
    currentStateSummary: null,
    historicalIssuesSummary: null,
    hasImprovedSinceLaunch: null,
    stabilityTrend: "Unknown",
    currentStateReliability: currentRel,
    historicalIssuesReliability: historicalRel,
    aiError: true,
  };
}

const RECENT_REVIEW_LIMIT = 40;
const HISTORICAL_REVIEW_LIMIT = 40;

// Reduce and sanitize review text to avoid oversized prompts
function prepareReviews(
  rawReviews: string[],
  maxItems = MAX_REVIEWS
): string[] {
  if (!rawReviews || rawReviews.length === 0) return [];

  const sampled = rawReviews.slice(0, maxItems).map((r) => {
    if (!r) return "";
    // Truncate each review to the per-review max length
    return r.slice(0, MAX_REVIEW_CHARS);
  });

  const finalReviews: string[] = [];
  const seen = new Set<string>();
  let totalChars = 0;

  for (const r of sampled) {
    const len = r.length;
    if (totalChars + len > MAX_TOTAL_REVIEW_CHARS) break;
    if (!r.trim()) continue;
    if (seen.has(r)) continue;
    seen.add(r);
    finalReviews.push(r.trim());
    totalChars += len;
  }

  return finalReviews;
}

function buildEarlyRecentBlocksFromLocal(
  gameData: GameData
): EarlyRecentBlocks {
  const baseAll = prepareReviews(gameData.reviews ?? [], 80);

  let historicalReviews: string[] = [];
  let recentReviews: string[] = [];
  let historicalSource: EarlyRecentBlocks["meta"]["historicalSource"] = "empty";
  let recentSource: EarlyRecentBlocks["meta"]["recentSource"] = "empty";

  // 1) まず earlyReviews / recentReviews を優先して使う
  if (
    Array.isArray(gameData.earlyReviews) &&
    gameData.earlyReviews.length > 0
  ) {
    historicalReviews = prepareReviews(
      gameData.earlyReviews,
      HISTORICAL_REVIEW_LIMIT
    );
    historicalSource = "earlyReviews";
  }

  if (
    Array.isArray(gameData.recentReviews) &&
    gameData.recentReviews.length > 0
  ) {
    recentReviews = prepareReviews(gameData.recentReviews, RECENT_REVIEW_LIMIT);
    recentSource = "recentReviews";
  }

  // 2) 足りない場合は baseAll の head/tail で補完
  if (historicalReviews.length === 0 && baseAll.length > 0) {
    historicalReviews = baseAll.slice(0, HISTORICAL_REVIEW_LIMIT);
    historicalSource = "allReviewsHead";
  }

  if (recentReviews.length === 0 && baseAll.length > 0) {
    recentReviews = baseAll.slice(-RECENT_REVIEW_LIMIT);
    recentSource = "allReviewsTail";
  }

  // 3) historical と recent が被っている場合は recent から重複を削除
  if (historicalReviews.length && recentReviews.length) {
    const historicalSet = new Set(historicalReviews);
    const filteredRecent = recentReviews.filter(
      (review) => !historicalSet.has(review)
    );
    if (filteredRecent.length > 0) {
      recentReviews = filteredRecent;
    }
  }

  return {
    historicalReviews,
    recentReviews,
    meta: {
      historicalSource,
      recentSource,
      historicalCount: historicalReviews.length,
      recentCount: recentReviews.length,
    },
  };
}

async function fetchEarlyReviewsFromSteam(
  appId: number,
  releaseDateIso: string
): Promise<string[]> {
  const releaseDate = new Date(releaseDateIso);
  if (!releaseDateIso || Number.isNaN(releaseDate.getTime())) {
    return [];
  }

  const earlyWindowEnd = new Date(
    releaseDate.getTime() + EARLY_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const collected: string[] = [];
  let cursor = "*";

  for (let page = 0; page < MAX_EARLY_REVIEW_PAGES; page++) {
    const url =
      `https://store.steampowered.com/appreviews/${appId}` +
      `?json=1&language=all&review_type=all&purchase_type=all` +
      `&filter=recent&num_per_page=100&cursor=${encodeURIComponent(cursor)}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Early review fetch failed:", {
        appId,
        status: res.status,
      });
      break;
    }

    const json = (await res.json()) as any;
    const reviews = Array.isArray(json?.reviews) ? json.reviews : [];
    if (reviews.length === 0) {
      break;
    }

    let reachedBeforeRelease = false;

    for (const item of reviews) {
      const text = typeof item?.review === "string" ? item.review.trim() : "";
      const ts =
        typeof item?.timestamp_created === "number"
          ? item.timestamp_created
          : undefined;

      if (!text || !ts) continue;

      const createdAt = new Date(ts * 1000);
      if (createdAt < releaseDate) {
        // 発売日より前まで来たら、それ以降のページは見る必要なし
        reachedBeforeRelease = true;
        continue;
      }

      // 発売〜EARLY_REVIEW_WINDOW_DAYS 日のレビューだけを拾う
      if (createdAt <= earlyWindowEnd) {
        collected.push(text);
      }
    }

    if (collected.length >= MIN_EARLY_REVIEW_SAMPLES || reachedBeforeRelease) {
      break;
    }

    const nextCursor = typeof json?.cursor === "string" ? json.cursor : null;
    if (!nextCursor || nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
  }

  // 既存のトークン制御ロジックに合わせて圧縮／重複除去
  return prepareReviews(collected, HISTORICAL_REVIEW_LIMIT);
}

async function buildEarlyRecentBlocks(
  gameData: GameData
): Promise<EarlyRecentBlocks> {
  // まずは既存ロジックだけで組み立てる
  const localBlocks = buildEarlyRecentBlocksFromLocal(gameData);

  // appId or releaseDate が無ければ、Steam には取りに行けない
  if (!gameData.appId || !gameData.releaseDate) {
    return localBlocks;
  }

  // すでに初期レビューが十分あるなら、わざわざ取りに行かない
  if (localBlocks.meta.historicalCount >= MIN_EARLY_REVIEW_SAMPLES) {
    return localBlocks;
  }

  // 環境変数で ON/OFF できるようにしておく（必要なければ常に true でもOK）
  const enableEarlyFetch =
    Deno.env.get("ENABLE_STEAM_EARLY_REVIEWS") === "true";
  if (!enableEarlyFetch) {
    return localBlocks;
  }

  try {
    const earlyFromSteam = await fetchEarlyReviewsFromSteam(
      gameData.appId,
      gameData.releaseDate
    );

    if (!earlyFromSteam.length) {
      return localBlocks;
    }

    return {
      historicalReviews: earlyFromSteam,
      recentReviews: localBlocks.recentReviews,
      meta: {
        ...localBlocks.meta,
        historicalCount: earlyFromSteam.length,
      },
    };
  } catch (e) {
    console.error("Failed to fetch early reviews from Steam:", e);
    return localBlocks;
  }
}

async function buildReviewSections(gameData: GameData): Promise<{
  recentReviews: string[];
  historicalReviews: string[];
}> {
  const blocks = await buildEarlyRecentBlocks(gameData);
  return {
    recentReviews: blocks.recentReviews,
    historicalReviews: blocks.historicalReviews,
  };
}

function formatReviewBlock(
  label: string,
  reviews: string[],
  emptyInstruction: string
): string {
  if (!reviews.length) {
    return `${label}:\n${emptyInstruction}`;
  }

  const lines = reviews.map((review, index) => `${index + 1}. ${review}`);
  return `${label}:\n${lines.join("\n")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let fallbackTitle = "Unknown Game";

  try {
    const gameData: GameData = await req.json();
    console.log("Analyzing game:", gameData.title);
    fallbackTitle = gameData.title || fallbackTitle;

    const totalReviewCount =
      typeof gameData.totalReviews === "number"
        ? gameData.totalReviews
        : Array.isArray(gameData.reviews)
        ? gameData.reviews.length
        : 0;

    const { recentReviews, historicalReviews } = await buildReviewSections(
      gameData
    );

    console.log("Review blocks prepared:", {
      totalReviewCount,

      recentSamples: recentReviews.length,

      historicalSamples: historicalReviews.length,
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const recentReviewsText = formatReviewBlock(
      "Recent reviews (reflect the current build)",

      recentReviews,

      "No reliable recent reviews were supplied. Describe the currentStateSummary only if other metadata makes it clear."
    );

    const historicalReviewsText = formatReviewBlock(
      "Historical / early reviews",
      historicalReviews,
        "No trustworthy early-launch reviews were provided. If this block is empty, you should still infer any clear launch or early-version problems from other evidence when possible (such as the overall review tone, pros/cons, and metadata) and describe that trajectory directly inside currentStateSummary. historicalIssuesSummary is deprecated and should normally remain an empty string."
    );

    const systemPrompt = `You are an AI analyst who evaluates Steam games and contrasts their CURRENT experience with their HISTORICAL launch/early issues.


Return ONLY valid JSON using this schema:

{

  "hiddenGemVerdict": "Yes" | "No" | "Unknown",

  "summary": "One or two concise sentences explaining the overall evaluation",

  "labels": ["short label", ...],

  "pros": ["strength 1", ...],

  "cons": ["weakness 1", ...],

  "riskScore": 1-10,

  "bugRisk": 1-10,

  "refundMentions": 0-10,

  "reviewQualityScore": 1-10,

    "currentStateSummary": string | "" | null,

  // historicalIssuesSummary is deprecated for the UI.
  // Always return this as an empty string or null; any important launch/early
  // issues and their resolution should be folded into currentStateSummary instead.
  "historicalIssuesSummary": "" | null,

  "hasImprovedSinceLaunch": true | false | null,

  "stabilityTrend": "Improving" | "Stable" | "Deteriorating" | "Unknown",

  "currentStateReliability": "high" | "medium" | "low" | null,

  "historicalIssuesReliability": "high" | "medium" | "low" | null

}



Rules:

1. Base currentStateSummary ONLY on the recent/current review block. Mention stability, polish, standout positives, or new issues that affect players now.

2. historicalIssuesSummary is deprecated for the UI. In normal cases you should return this as an empty string and not place any important information there. When the data shows clear launch/early issues and later improvement, describe that history directly in currentStateSummary instead of using historicalIssuesSummary.

3. Set hasImprovedSinceLaunch to true/false only when the difference between historical and recent reviews is obvious. Otherwise, use null.

4. stabilityTrend must be one of the allowed strings above. Use "Unknown" when the direction is unclear.

5. Never fabricate statements like "not enough data" inside the summaries. Prefer empty strings or null values when evidence is missing.

6. Keep sentences concise (under 3 sentences per field) and avoid markdown or bullet formatting.



Always respond with raw JSON only.`;

    const userPrompt = `
Game metadata:
- Title: ${gameData.title}
- Tags: ${(gameData.tags ?? []).join(", ")}
- Positive ratio: ${gameData.positiveRatio}
- Total reviews: ${totalReviewCount}
- Price: ${gameData.price}
- Estimated owners: ${gameData.estimatedOwners}
- Average playtime (minutes): ${gameData.averagePlaytime}

Recent review evidence:
${recentReviewsText}

Historical / early review evidence:
${historicalReviewsText}

IMPORTANT:
- When the data clearly shows that the game has changed over time (for example: a very rough or buggy launch that later improved after patches), briefly describe that trajectory directly inside currentStateSummary.
- historicalIssuesSummary is deprecated for the UI and should normally be returned as an empty string. Do not move important information into historicalIssuesSummary; instead, fold notable launch/early issues and their resolution into currentStateSummary.
`.trim();
    const controller = new AbortController();
    try {
      const timeoutMs = 25000;
      const timeoutId = setTimeout(() => {
        controller.abort("AI request timeout");
      }, timeoutMs);

      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
          }),
          signal: controller.signal,
        }
      ).finally(() => {
        clearTimeout(timeoutId);
      });

      if (!response.ok) {
        let errorText = "";
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = "Unable to read error response";
        }
        console.error("AI Gateway error:", {
          status: response.status,
          statusText: response.statusText,
          errorText,
        });

        // Keep explicit 4xx for rate limiting and credits so frontend can react
        if (response.status === 429) {
          return new Response(
            JSON.stringify({
              error: "Rate limit exceeded. Please try again later.",
            }),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }

        if (response.status === 402) {
          return new Response(
            JSON.stringify({
              error: "AI credits depleted. Please add credits to continue.",
            }),
            {
              status: 402,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }

        // For all other error codes (including 500), return a safe fallback
        console.log("Returning fallback analysis due to AI Gateway error");
        const fallback = buildFallbackAnalysis(
          `AI Gateway returned ${response.status}`,
          {
            title: fallbackTitle,
          }
        );
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.error("No content in AI response:", data);
        const fallback = buildFallbackAnalysis("No content in AI response", {
          title: fallbackTitle,
        });
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      console.log("Raw AI response content:", content);

      // Parse JSON from AI response
      let analysis: HiddenGemAnalysis;
      try {
        const jsonMatch =
          typeof content === "string"
            ? content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
            : null;
        const jsonStr =
          jsonMatch && jsonMatch[1]
            ? jsonMatch[1]
            : typeof content === "string"
            ? content
            : JSON.stringify(content);

        const parsed = JSON.parse(jsonStr.trim());
        analysis = normalizeAnalysisPayload(parsed);
      } catch (e) {
        console.error("Failed to parse AI response as JSON:", {
          content,
        });
        const fallback = buildFallbackAnalysis(
          "Invalid JSON response from AI",
          {
            title: fallbackTitle,
          }
        );
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      return new Response(JSON.stringify(analysis), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    } catch (aiError: any) {
      // Catch network errors, timeouts, and unexpected AI errors
      console.error("AI analysis error:", {
        message: aiError?.message,
        name: aiError?.name,
        stack: aiError?.stack,
      });

      const fallback = buildFallbackAnalysis(
        aiError?.message || "AI analysis error",
        {
          title: fallbackTitle,
        }
      );
      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }
  } catch (error) {
    // Only unrecoverable server-side issues should return 500
    console.error("Error in analyze-hidden-gem:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  // 型システム対策用のフォールバック（ここには通常到達しない）
  return new Response(
    JSON.stringify({ error: "Unhandled request in analyze-hidden-gem" }),
    {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
});

function normalizeStringArray(input?: any[]): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of input) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function clampInt(value: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return min;
  }
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

const VALID_VERDICTS = new Set(["Yes", "No", "Unknown"]);
const VALID_TRENDS = new Set([
  "Improving",
  "Stable",
  "Deteriorating",
  "Unknown",
]);
const VALID_RELIABILITIES = new Set(["high", "medium", "low"]);

function normalizeOptionalString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeVerdict(value: unknown): "Yes" | "No" | "Unknown" {
  return typeof value === "string" && VALID_VERDICTS.has(value)
    ? (value as "Yes" | "No" | "Unknown")
    : "Unknown";
}

function normalizeTrend(
  value: unknown
): "Improving" | "Stable" | "Deteriorating" | "Unknown" {
  return typeof value === "string" && VALID_TRENDS.has(value)
    ? (value as "Improving" | "Stable" | "Deteriorating" | "Unknown")
    : "Unknown";
}

function normalizeReliability(
  value: unknown
): "high" | "medium" | "low" | null {
  return typeof value === "string" && VALID_RELIABILITIES.has(value)
    ? (value as "high" | "medium" | "low")
    : null;
}

function normalizeAnalysisPayload(parsed: any): HiddenGemAnalysis {
  const normalized: HiddenGemAnalysis = {
    hiddenGemVerdict: normalizeVerdict(parsed?.hiddenGemVerdict),
    summary: normalizeOptionalString(parsed?.summary),
    labels: normalizeStringArray(parsed?.labels),
    pros: normalizeStringArray(parsed?.pros),
    cons: normalizeStringArray(parsed?.cons),
    riskScore: clampInt(parsed?.riskScore ?? 5, 0, 10),
    bugRisk: clampInt(parsed?.bugRisk ?? 5, 0, 10),
    refundMentions: clampInt(parsed?.refundMentions ?? 0, 0, 20),
    reviewQualityScore: clampInt(parsed?.reviewQualityScore ?? 5, 0, 10),
    currentStateSummary: normalizeOptionalString(parsed?.currentStateSummary),
    historicalIssuesSummary: normalizeOptionalString(
      parsed?.historicalIssuesSummary
    ),
    hasImprovedSinceLaunch:
      typeof parsed?.hasImprovedSinceLaunch === "boolean"
        ? parsed.hasImprovedSinceLaunch
        : null,
    stabilityTrend: normalizeTrend(parsed?.stabilityTrend),
    currentStateReliability: normalizeReliability(
      parsed?.currentStateReliability
    ),
    historicalIssuesReliability: normalizeReliability(
      parsed?.historicalIssuesReliability
    ),
  };

  if (typeof parsed?.statGemScore === "number") {
    (normalized as any).statGemScore = parsed.statGemScore;
  }

  if (typeof parsed?.aiError === "boolean") {
    normalized.aiError = parsed.aiError;
  }

  return normalized;
}
