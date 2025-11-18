/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GameData {
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number;
  averagePlaytime: number;
  lastUpdated: string;
  reviews: string[];
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
  currentStateSummary?: string;

  /**
   * 過去のバージョンで多かった問題の要約。
   * 例: 「ローンチ直後はクラッシュや最適化不足への不満が多かった」
   */
  historicalIssuesSummary?: string;

  /**
   * 初期バージョンと比較して改善したと判断されるかどうか。
   * 例: true のとき「昔は微妙だったが今は良くなった」系タイトル。
   */
  hasImprovedSinceLaunch?: boolean;

  /**
   * 安定性や全体評価のトレンド。
   * - "Improving": 問題が減って評価が改善している
   * - "Stable": 大きな変化はなく安定
   * - "Deteriorating": アプデ後に悪化している
   */
  stabilityTrend?: "Improving" | "Stable" | "Deteriorating";

  aiError?: boolean;
}

// Limits to keep review input safely within token constraints
const MAX_REVIEWS = 15;
const MAX_REVIEW_CHARS = 500;
const MAX_TOTAL_REVIEW_CHARS = 12000;

// Fallback object used when AI analysis fails
function buildFallbackAnalysis(errorMessage?: string): HiddenGemAnalysis {
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
    aiError: true,
  };
}

// Reduce and sanitize review text to avoid oversized prompts
function prepareReviews(rawReviews: string[]): string[] {
  if (!rawReviews || rawReviews.length === 0) return [];

  const sampled = rawReviews.slice(0, MAX_REVIEWS).map((r) => {
    if (!r) return "";
    // Truncate each review to the per-review max length
    return r.slice(0, MAX_REVIEW_CHARS);
  });

  const finalReviews: string[] = [];
  let totalChars = 0;

  for (const r of sampled) {
    const len = r.length;
    if (totalChars + len > MAX_TOTAL_REVIEW_CHARS) break;
    finalReviews.push(r);
    totalChars += len;
  }

  return finalReviews;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const gameData: GameData = await req.json();
    console.log("Analyzing game:", gameData.title);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Prepare reviews to keep the prompt size under control
    const preparedReviews = prepareReviews(gameData.reviews || []);
    console.log("Review stats:", {
      originalCount: gameData.reviews?.length ?? 0,
      usedCount: preparedReviews.length,
      totalChars: preparedReviews.reduce((sum, r) => sum + r.length, 0),
    });

    const systemPrompt = `You are an AI system that evaluates Steam games and explains why each game may qualify as a "Hidden Gem."

Hidden Gem Definition:
A game is considered a "Hidden Gem" if it satisfies both:
1. High player satisfaction (positive reviews, quality content, low bugs, good value)
2. Low visibility (under 200 reviews OR under 50,000 estimated owners)

Very important:
Many Steam games change significantly over time due to patches and major updates.
Older reviews may describe a broken or unpolished version, while newer reviews may describe a much better experience.
You MUST pay attention to wording like:
- "after the update"
- "since the latest patch"
- "at launch it was bad, but now..."
and distinguish between early-version issues and current-version quality.

Your task: Analyze the game data and return ONLY valid JSON in this exact format:

{
  "hiddenGemVerdict": "Yes" or "No" or "Unknown",
  "summary": "One-sentence high-level explanation of whether this is a hidden gem and why.",
  "labels": ["label1", "label2", ...],
  "pros": ["pro1", "pro2", ...],
  "cons": ["con1", "con2", ...],
  "riskScore": 0-10,
  "bugRisk": 0-10,
  "refundMentions": 0-10,
  "reviewQualityScore": 0-10,

  "currentStateSummary": "Short description of how the game feels in its CURRENT version, focusing on recent patches if mentioned.",
  "historicalIssuesSummary": "Short description of major problems mentioned in OLDER or pre-patch reviews, if any.",
  "hasImprovedSinceLaunch": true or false,
  "stabilityTrend": "Improving" or "Stable" or "Deteriorating"
}

Field guidelines:
- Use concise language.
- summary: 1–2 short sentences.
- pros: up to 5 bullet points, each under 120 characters.
- cons: up to 5 bullet points, each under 120 characters.
- labels: 3–6 short tags (e.g. "underrated", "polished", "buggy-at-launch", "short-and-sweet").
- riskScore: overall risk that the game will feel like a "bad purchase" (0 = no risk, 10 = very risky).
- bugRisk: how often players report crashes, softlocks or serious technical issues (0 = rock-solid, 10 = extremely buggy).
- refundMentions: how often refunds or regret are mentioned in reviews (0 = almost never, 10 = extremely often).
- reviewQualityScore: how informative, specific and trustworthy the review corpus feels (0 = low quality, 10 = very high quality).
- currentStateSummary: focus on the present experience; weigh recent reviews more heavily if they clearly reference patches.
- historicalIssuesSummary: capture early-version problems that may no longer apply (you can leave this empty if there is no sign of historical issues).
- hasImprovedSinceLaunch: true if the game appears to have significantly improved compared to older reviews.
- stabilityTrend:
  - "Improving" = problems were more common in older reviews than in newer ones.
  - "Stable" = roughly consistent quality over time.
  - "Deteriorating" = newer reviews are noticeably more negative or report new issues.

Important:
- If you cannot clearly detect time-based differences, you may still fill currentStateSummary using the overall review tone and set hasImprovedSinceLaunch to false and stabilityTrend to "Stable".
- Respond with JSON only, no explanation text or markdown.`;

    const userPrompt = `Analyze this game:

Title: ${gameData.title}
Positive Ratio: ${gameData.positiveRatio}%
Total Reviews: ${gameData.totalReviews}
Estimated Owners: ${gameData.estimatedOwners}
Recent Players: ${gameData.recentPlayers}
Price: $${gameData.price}
Average Playtime: ${gameData.averagePlaytime} hours
Last Updated: ${gameData.lastUpdated}

User Reviews:
${preparedReviews.map((r, i) => `${i + 1}. ${r}`).join("\n\n")}

Return ONLY the JSON response, no other text.`;

    const approxPromptChars = systemPrompt.length + userPrompt.length;
    const approxPromptTokens = Math.round(approxPromptChars / 4);
    console.log("Prompt size:", {
      chars: approxPromptChars,
      approxTokens: approxPromptTokens,
    });

    // Separate try/catch for the AI call to avoid returning 500 for AI failures
    try {
      const controller = new AbortController();
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
          `AI Gateway returned ${response.status}`
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
        const fallback = buildFallbackAnalysis("No content in AI response");
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
        // Handle both raw JSON and Markdown-style ```json blocks
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

        analysis = JSON.parse(jsonStr.trim());
      } catch (e) {
        console.error("Failed to parse AI response as JSON:", {
          content,
        });
        const fallback = buildFallbackAnalysis("Invalid JSON response from AI");
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      return new Response(JSON.stringify(analysis), {
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
        aiError?.message || "AI analysis error"
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
});
