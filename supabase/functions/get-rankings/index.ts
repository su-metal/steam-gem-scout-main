/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Central list of candidate games - focused on hidden/underrated indie titles (2021-2025)
const CANDIDATE_GAMES = [
  { appId: 1408720, title: "Dome Keeper", tags: ["Roguelike", "Mining", "Indie"] },
  { appId: 1679690, title: "Cobalt Core", tags: ["Deckbuilding", "Roguelike", "Indie"] },
  { appId: 1324680, title: "Cassette Beasts", tags: ["RPG", "Creature Collector", "Indie"] },
  { appId: 1785150, title: "ANIMAL WELL", tags: ["Metroidvania", "Puzzle", "Indie"] },
  { appId: 2566630, title: "Pepper Grinder", tags: ["Action", "Platformer", "Indie"] },
  { appId: 2379780, title: "Balatro", tags: ["Card Game", "Roguelike", "Indie"] },
  { appId: 1455840, title: "Dorfromantik", tags: ["Puzzle", "Relaxing", "Strategy"] },
  { appId: 1578650, title: "Before Your Eyes", tags: ["Narrative", "Emotional", "Indie"] },
];

// Cache freshness window (in hours)
const CACHE_MAX_AGE_HOURS = 24;

interface SteamGameData {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number;
  averagePlaytime: number;
  lastUpdated: string;
  reviews: string[];
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  isAvailableInStore: boolean;
  releaseDate: string;
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
  aiError?: boolean;
}

type GemLabel = "Hidden Gem" | "Highly rated but not hidden" | "Not a hidden gem";

interface RankingGame {
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
  analysis: HiddenGemAnalysis;
  gemLabel: GemLabel;
  isStatisticallyHidden: boolean;
  releaseYear?: number;
  releaseDate?: string;
}

// Helper function to compute gem label
function computeGemLabel(
  totalReviews: number,
  estimatedOwners: number,
  aiVerdict: "Yes" | "No" | "Unknown"
): { gemLabel: GemLabel; isStatisticallyHidden: boolean } {
  const isStatisticallyHidden = totalReviews < 200 || estimatedOwners < 50000;

  let gemLabel: GemLabel;
  if (isStatisticallyHidden && aiVerdict === "Yes") {
    gemLabel = "Hidden Gem";
  } else if (!isStatisticallyHidden && aiVerdict === "Yes") {
    gemLabel = "Highly rated but not hidden";
  } else {
    gemLabel = "Not a hidden gem";
  }

  return { gemLabel, isStatisticallyHidden };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Read filter parameters from query string
    const url = new URL(req.url);

    // recentDays filter (released within last N days)
    let RECENT_DAYS: number | null = null;
    const recentDaysParam = url.searchParams.get("recentDays");
    if (recentDaysParam) {
      const parsed = Number(recentDaysParam);
      if (!Number.isNaN(parsed) && parsed > 0) {
        // clamp between 1 day and 5 years (approx 1825 days)
        const clamped = Math.min(Math.max(parsed, 1), 1825);
        RECENT_DAYS = clamped;
      }
    }

    console.log("Fetching rankings for", CANDIDATE_GAMES.length, "games with filters - recentDays:", RECENT_DAYS);

    const rankings: RankingGame[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    // Process each game sequentially to avoid rate limiting
    for (const game of CANDIDATE_GAMES) {
      try {
        console.log(`Processing game: ${game.title} (${game.appId})`);

        // Step 1: Check cache first
        const { data: cachedData } = await supabase
          .from("game_rankings_cache")
          .select("data, updated_at")
          .eq("app_id", game.appId)
          .maybeSingle();

        // Check if cache is fresh
        if (cachedData) {
          const cacheAge = Date.now() - new Date(cachedData.updated_at).getTime();
          const cacheAgeHours = cacheAge / (1000 * 60 * 60);

          if (cacheAgeHours < CACHE_MAX_AGE_HOURS) {
            console.log(`✓ ${game.title}: Loaded from cache (age: ${cacheAgeHours.toFixed(1)}h)`);
            rankings.push(cachedData.data as RankingGame);
            cacheHits++;
            continue; // Skip fetching and analysis
          } else {
            console.log(`⟳ ${game.title}: Cache stale (age: ${cacheAgeHours.toFixed(1)}h), refreshing...`);
          }
        } else {
          console.log(`⟳ ${game.title}: No cache found, fetching...`);
        }

        cacheMisses++;

        // Step 2: Fetch Steam data
        const { data: steamData, error: steamError } = await supabase.functions.invoke(
          "fetch-steam-game",
          {
            body: { appId: game.appId },
          }
        );

        if (steamError || !steamData) {
          console.error(`Failed to fetch Steam data for ${game.title}:`, steamError);
          continue;
        }

        const gameData = steamData as SteamGameData;

        // Skip games not available in store (we don't cache these at all)
        if (!gameData.isAvailableInStore) {
          console.log(`⊘ ${game.title}: Skipping - not available in store`);
          continue;
        }

        // Extract release year for filtering later
        let releaseYear: number | undefined = undefined;
        if (gameData.releaseDate) {
          const yearPart = gameData.releaseDate.slice(0, 4);
          const parsed = Number(yearPart);
          if (!Number.isNaN(parsed)) {
            releaseYear = parsed;
          }
        }

        // Step 3: Analyze with AI
        const { data: analysis, error: analysisError } = await supabase.functions.invoke(
          "analyze-hidden-gem",
          {
            body: {
              title: gameData.title,
              positiveRatio: gameData.positiveRatio,
              totalReviews: gameData.totalReviews,
              estimatedOwners: gameData.estimatedOwners,
              recentPlayers: gameData.recentPlayers,
              price: gameData.price,
              averagePlaytime: gameData.averagePlaytime,
              lastUpdated: gameData.lastUpdated,
              reviews: gameData.reviews || [],
              tags: gameData.tags || [],
              steamUrl: gameData.steamUrl,
              reviewScoreDesc: gameData.reviewScoreDesc,
            },
          }
        );

        if (analysisError || !analysis) {
          console.error(`Failed to analyze ${game.title}:`, analysisError);
          continue;
        }

        const aiAnalysis = analysis as HiddenGemAnalysis;

        // Step 3: Compute gem label
        const { gemLabel, isStatisticallyHidden } = computeGemLabel(
          gameData.totalReviews,
          gameData.estimatedOwners,
          aiAnalysis.hiddenGemVerdict
        );

        // Step 4: Combine data
        const rankingGame: RankingGame = {
          appId: game.appId,
          title: gameData.title,
          positiveRatio: gameData.positiveRatio,
          totalReviews: gameData.totalReviews,
          estimatedOwners: gameData.estimatedOwners,
          recentPlayers: gameData.recentPlayers,
          price: gameData.price,
          averagePlaytime: gameData.averagePlaytime,
          lastUpdated: gameData.lastUpdated,
          tags: gameData.tags || game.tags,
          steamUrl: gameData.steamUrl,
          reviewScoreDesc: gameData.reviewScoreDesc,
          analysis: aiAnalysis,
          gemLabel,
          isStatisticallyHidden,
          releaseYear,
          releaseDate: gameData.releaseDate,
        };

        rankings.push(rankingGame);

        // Step 5: Update cache
        await supabase
          .from("game_rankings_cache")
          .upsert({
            app_id: game.appId,
            data: rankingGame,
            updated_at: new Date().toISOString(),
          });

        console.log(`✓ ${game.title}: ${gemLabel} (cached)`);
      } catch (gameError) {
        console.error(`Error processing ${game.title}:`, gameError);
      }
    }

    console.log(`Successfully processed ${rankings.length} games (${cacheHits} from cache, ${cacheMisses} refreshed)`);

    // Apply recency filter at response time (if provided)
    let filtered = rankings;

    if (RECENT_DAYS !== null) {
      const now = Date.now();
      const cutoff = now - RECENT_DAYS * 24 * 60 * 60 * 1000;

      filtered = rankings.filter(game => {
        if (!game.releaseDate) {
          // If we don't know the date, consider it NOT recent
          return false;
        }
        const ts = Date.parse(game.releaseDate);
        if (Number.isNaN(ts)) {
          return false;
        }
        return ts >= cutoff;
      });
    }

    console.log(`Returning ${filtered.length} games after applying filters (recentDays: ${RECENT_DAYS})`);

    return new Response(JSON.stringify(filtered), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error in get-rankings:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
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
