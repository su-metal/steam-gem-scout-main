import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import {
  MoodVector,
  calcRawMood,
  normalizeMood,
} from "../_shared/mood.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase URL or service role key");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PAGE_SIZE = Number(Deno.env.get("BACKFILL_BATCH") ?? "200");

type CacheRow = {
  id?: number;
  app_id?: number;
  data?: Record<string, unknown>;
};

type SteamRow = {
  app_id: number;
  tags?: string[] | string | null;
};

const normalizeTags = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean);
  }

  if (typeof input === "string") {
    return input
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  return [];
};

const calcMoodScores = (tags: string[]): MoodVector | null => {
  if (!tags.length) return null;
  return normalizeMood(calcRawMood(tags));
};

const updateCacheRow = async (
  appId: number,
  existingData: Record<string, unknown>,
  moodScores: MoodVector
) => {
  const nextData = {
    ...existingData,
    mood_scores: moodScores,
  };

  const { error } = await supabase
    .from("game_rankings_cache")
    .update({ data: nextData })
    .eq("app_id", appId);

  if (error) {
    console.error("Failed to update cache row", { appId, error });
  }
};

const updateSteamRow = async (appId: number, moodScores: MoodVector) => {
  const { error } = await supabase
    .from("steam_games")
    .update({ mood_scores: moodScores })
    .eq("app_id", appId);

  if (error) {
    console.error("Failed to update steam row", { appId, error });
  }
};

const processBatch = async (offset: number): Promise<number> => {
  const { data: cacheRows, error } = await supabase
    .from("game_rankings_cache")
    .select("app_id, data")
    .order("app_id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error("Failed to fetch cache rows", error);
    throw error;
  }

  if (!cacheRows || cacheRows.length === 0) {
    return 0;
  }

  let updated = 0;

  for (const row of cacheRows as CacheRow[]) {
    const appId = row.app_id;
    if (!appId) continue;

    const data = (row.data ?? {}) as Record<string, unknown>;
    const hasMood = data.mood_scores != null;
    const tagsFromData = normalizeTags(data.tags);

    if (hasMood && tagsFromData.length === 0) {
      continue;
    }

    let tags = tagsFromData;

    if (tags.length === 0) {
      const { data: steamRow, error: steamError } = await supabase
        .from("steam_games")
        .select("tags")
        .eq("app_id", appId)
        .maybeSingle<SteamRow>();

      if (steamError) {
        console.error("Failed to fetch steam row", { appId, steamError });
        continue;
      }

      tags = normalizeTags(steamRow?.tags);
    }

    const moodScores = calcMoodScores(tags);
    if (!moodScores) continue;

    await updateCacheRow(appId, data, moodScores);
    await updateSteamRow(appId, moodScores);
    updated++;
  }

  return updated;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Only POST is supported" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    let totalUpdated = 0;
    let offset = 0;

    while (true) {
      const processed = await processBatch(offset);
      if (processed === 0) break;
      totalUpdated += processed;
      offset += PAGE_SIZE;
    }

    return new Response(
      JSON.stringify({ updated: totalUpdated }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Backfill failed", error);
    return new Response(
      JSON.stringify({ error: "Backfill failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
