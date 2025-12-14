// supabase/functions/generate-facts/index.ts
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 既存のFactsカタログ（SSOT）
import { FACT_TAGS } from "../_shared/facts-v11.ts";

// facts-v11.ts 側に isFactTag が無い前提で、ここで確定ガードを作る
const FACT_TAG_SET = new Set<string>(
  (FACT_TAGS as readonly string[]).map((t) => String(t).trim().toLowerCase())
);
function isFactTag(t: string) {
  return FACT_TAG_SET.has(String(t).trim().toLowerCase());
}

type GenerateFactsRequest = {
  appId: number | string;
  force?: boolean;
  sources?: string[];
  debug?: boolean;
};

type EvidenceItem = {
  source: string;
  quote: string;
  confidence?: number;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function badRequest(message: string) {
  return json(400, { error: message });
}

function normalizeBool(v: unknown, fallback = false) {
  return typeof v === "boolean" ? v : fallback;
}

function normalizeTagKey(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[;:,.'"]+$/, "")
    .replace(/[\s_-]+/g, "_");
}

function normalizeEvidenceMap(
  rawEvidence: Record<string, EvidenceItem[]> | undefined
): Record<string, EvidenceItem[]> {
  const normalized: Record<string, EvidenceItem[]> = {};
  if (!rawEvidence || typeof rawEvidence !== "object") return normalized;
  for (const [key, value] of Object.entries(rawEvidence)) {
    const normalizedKey = normalizeTagKey(key);
    if (!normalizedKey || !Array.isArray(value)) continue;
    normalized[normalizedKey] = value;
  }
  return normalized;
}

function parseAppId(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

async function fetchSteamAppDetails(appId: number) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`;
  const res = await fetch(url, {
    headers: { "user-agent": "generate-facts/1.0" },
  });
  if (!res.ok) return { ok: false as const, status: res.status, url };
  const data = await res.json();
  const entry = data?.[String(appId)];
  if (!entry?.success || !entry?.data)
    return { ok: false as const, status: 404, url };
  return { ok: true as const, status: 200, url, data: entry.data };
}

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCorpusFromSteam(app: any) {
  const short =
    typeof app?.short_description === "string" ? app.short_description : "";
  const about =
    typeof app?.about_the_game === "string" ? app.about_the_game : "";
  const genres = Array.isArray(app?.genres)
    ? app.genres.map((g: any) => g?.description).filter(Boolean)
    : [];
  const categories = Array.isArray(app?.categories)
    ? app.categories.map((c: any) => c?.description).filter(Boolean)
    : [];

  const corpus = [
    `steam.short:\n${stripHtml(short)}`,
    `steam.about:\n${stripHtml(about)}`,
    `steam.genres:\n${genres.join(", ")}`,
    `steam.categories:\n${categories.join(", ")}`,
  ].join("\n\n");

  const MAX_CHARS = 16000;
  return corpus.length > MAX_CHARS ? corpus.slice(0, MAX_CHARS) : corpus;
}

async function generateFactsViaLLM(args: { appId: number; corpus: string }) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = Deno.env.get("OPENAI_FACTS_MODEL") ?? "gpt-4o-mini";

  // カタログ（facts-v11.ts の FACT_TAGS）をプロンプトで“列挙”して幻覚を抑える
  const allowedTags = Array.from(FACT_TAG_SET).sort();

  // Structured Outputs: json_schema で固定（スキーマに必ず一致）
  // Docs: response_format = { type:"json_schema", json_schema:{...} } :contentReference[oaicite:1]{index=1}
  const schema = {
    name: "facts_output",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["tags", "evidence"],
      properties: {
        tags: {
          type: "array",
          items: { type: "string", enum: allowedTags },
          description: "Allowed tag ids only (lowercase).",
        },
        evidence: {
          type: "object",
          additionalProperties: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source", "quote"],
              properties: {
                source: { type: "string" },
                quote: { type: "string" },
                confidence: { type: "number" },
              },
            },
          },
          description:
            "Map tag -> evidence items (at least 1 per returned tag).",
        },
      },
    },
  } as const;

  const system = [
    "You are a facts extractor for Steam games.",
    "Return ONLY JSON that matches the provided JSON Schema.",
    "Select tags ONLY from the provided allowed tag list.",
    "Evidence keys must match the returned tags (lowercase).",
    "If a tag clearly applies but no direct quote is available in the corpus, output the tag with an empty evidence array.",
    "Every returned tag MUST have at least 1 evidence item when available.",
    "Evidence quotes must be short excerpts copied from the corpus (no paraphrase).",
    "Otherwise, omit the tag.",
    "Return at most 10 tags, prioritizing the most meaningful ones.",
  ].join("\n");

  const productRules = `
Product rules (read carefully):
- Facts are concrete gameplay experience signals, NOT genre labels and NOT story themes.
- Choose tags only when they are clearly supported by the provided inputs (reviews/summary/features/etc).
- Prefer tags that reflect repeatable player actions/constraints (controls, pressure, loops, exploration structure).
- If uncertain between two tags, pick the closest one from the glossary; do NOT invent new tags.
- Output MUST be conservative: include a tag only if you can justify it with evidence; otherwise omit it.
`;

  const negativeRules = `
Critical disambiguation rules (avoid false positives):
- job_simulation_loop means a core "work/job simulation loop" (e.g., doing jobs/tasks as the main repeated activity, shift-based work, running a job like chef/barista/office/driver, etc.).
- Do NOT select job_simulation_loop for "job/class/vocation" systems in RPGs (e.g., Warrior/Mage/Thief, class change, vocation/job system). That is NOT a work-sim loop.
- For RPG class/vocation systems, prefer narrative_driven_progression or open_ended_goal (if applicable), but never job_simulation_loop unless the game is actually about working as a job.
`;

  const glossaryIntro =
    "Tag glossary: Choose ONLY from the allowed tags. Pick the closest tag based on these definitions. Do NOT invent new tags. If none apply, return an empty array.";

  const selectionPolicy = `
Selection policy:
- Return at most 10 tags.
- Prefer tags with strong, repeated evidence. If many apply, choose the most distinctive ones.
- Avoid overlapping tags that describe the same thing; pick the sharper signal.
- If the game is a narrative RPG, do NOT automatically add branching_narrative / choice_has_consequence unless choices materially change outcomes (routes/endings/quests/flags).
`;

  const promptIntro = `${glossaryIntro}\n${productRules}\n${negativeRules}\n${selectionPolicy}`;

  const glossaryBody =
    `
real_time_control:
  Real-time moment-to-moment control; outcomes depend on continuous player input.
  Keywords: real-time, twitch, reflex, live control, constant input, APM

high_input_pressure:
  Requires frequent and precise inputs; low input rate is punished.
  Keywords: high APM, hectic, demanding controls, micromanagement, fast clicking

high_stakes_failure:
  Mistakes cause major loss or irreversible setbacks.
  Keywords: permadeath, severe penalty, wipe, harsh punishment, ironman

time_pressure:
  Time limits or urgency force quick decisions.
  Keywords: timer, countdown, deadline, race against time, urgency

enemy_density_high:
  Many enemies are present simultaneously.
  Keywords: hordes, swarms, waves, crowded fights, mob pressure

precision_timing_required:
  Success depends on tight timing windows.
  Keywords: parry, perfect timing, i-frames, frame-perfect, rhythm timing

stealth_core:
  Avoidance and concealment are core progression methods.
  Keywords: stealth, sneaking, detection meter, silent takedown

line_of_sight_matters:
  Visibility and sightlines govern detection or advantage.
  Keywords: line of sight, vision cones, visibility, spotted, cover

position_advantage_design:
  Positioning provides decisive advantages.
  Keywords: positioning, flanking, high ground, cover, chokepoints

route_selection_matters:
  Route choice meaningfully changes risk or outcome.
  Keywords: branching paths, route choice, alternate routes

free_movement_exploration:
  Free roaming and spatial exploration drive play.
  Keywords: free roam, exploration, wandering, traversal

map_reveal_progression:
  Progression tied to uncovering the map.
  Keywords: fog of war, map discovery, reveal areas

non_hostile_environment:
  World is largely safe or non-violent.
  Keywords: peaceful, safe world, non-combat, relaxing

planning_required:
  Success depends on planning before execution.
  Keywords: planning, preparation, layout planning, prioritization

systems_interaction_depth:
  Multiple systems interact in complex, emergent ways.
  Keywords: deep systems, emergent gameplay, synergies

resource_management:
  Managing scarce resources is central.
  Keywords: economy, inventory, budgeting, allocation, scarcity

automation_core:
  Building self-running systems is core gameplay.
  Keywords: automation, factory, production lines, logistics, pipelines

optimization_required:
  Efficiency optimization is required for success.
  Keywords: optimization, min-max, throughput, efficiency tuning

narrative_driven_progression:
  Progression is driven primarily by story.
  Keywords: story-driven, narrative focus, plot progression

reading_heavy_interaction:
  Reading text is a primary interaction.
  Keywords: text-heavy, dialogue-heavy, visual novel

branching_narrative:
  Story branches into different paths or endings.
  Keywords: multiple endings, branching story, narrative routes

choice_has_consequence:
  Choices meaningfully change outcomes.
  Keywords: decisions matter, consequences, moral choices

lore_optional_depth:
  Deep lore is optional but available.
  Keywords: lore-rich, codex, worldbuilding, logs

low_pressure_play:
  Low stress and forgiving pacing.
  Keywords: chill, cozy, relaxing, casual-friendly

session_based_play:
  Play is divided into short, repeatable sessions.
  Keywords: runs, rounds, matches, short sessions

pause_friendly:
  Easy to pause or stop at any time.
  Keywords: pause anytime, interruptible, save anytime

creative_manipulation:
  Creativity emerges from system manipulation.
  Keywords: sandbox, experimentation, creative solutions

open_ended_goal:
  Goals are self-directed rather than fixed.
  Keywords: sandbox, self-directed, no fixed objective

logical_puzzle_core:
  Core gameplay is logical problem solving.
  Keywords: logic puzzle, deduction, reasoning
`.trim() + "\n";

  const user = [
    `appId: ${args.appId}`,
    "",
    "Allowed facts tags (exact match, lowercase):",
    allowedTags.join(", "),
    "",
    "Corpus (sources are prefixed like steam.short / steam.about / steam.genres / steam.categories):",
    args.corpus,
  ].join("\n");

  // ここで必ず定義（messagesより上）
  const fullSystem = [
    system,
    "",
    promptIntro,
    "",
    "Glossary (definitions + keyword hints):",
    glossaryBody,
  ].join("\n");

  const body = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: fullSystem }, // ← system ではなく fullSystem
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const status = res.status;
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    console.error("[generate-facts] openai http error", {
      status,
      textPreview: text.slice(0, 400),
    });
    throw new Error(`OpenAI HTTP ${status}: ${text.slice(0, 800)}`);
  }

  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    console.error("[generate-facts] openai json parse failed", {
      status,
      textPreview: text.slice(0, 800),
    });
    throw new Error(
      `OpenAI parse failed (HTTP ${status}): ${text.slice(0, 800)}`
    );
  }

  const content =
    json?.choices?.[0]?.message?.content ??
    json?.output?.[0]?.content?.find?.((c: any) => c?.type === "output_text")
      ?.text ??
    json?.output_text;

  const rawText = typeof content === "string" ? content : "";
  if (!rawText) {
    console.error("[generate-facts] openai missing content", {
      status,
      jsonPreview: JSON.stringify(json).slice(0, 800),
    });
    throw new Error(`OpenAI response missing content (HTTP ${status})`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("[generate-facts] model content not json", {
      rawTextPreview: rawText.slice(0, 800),
    });
    throw new Error(`Model output is not valid JSON: ${rawText.slice(0, 800)}`);
  }

  return {
    model,
    ...(parsed ?? {}),
  };
}

function guardFacts(raw: {
  tags: string[];
  evidence: Record<string, EvidenceItem[]>;
}) {
  const MAX_TAGS = 8;

  const normalizedTags = (raw.tags ?? [])
    .map((t) => normalizeTagKey(t))
    .filter((t) => t.length > 0);

  const seen = new Set<string>();
  const candidates: string[] = [];
  const rejectedNotInCatalog: string[] = [];

  for (const t of normalizedTags) {
    if (!isFactTag(t)) {
      rejectedNotInCatalog.push(t);
      continue;
    }
    if (seen.has(t)) continue;
    seen.add(t);
    candidates.push(t);
  }

  const evidenceMap = normalizeEvidenceMap(raw.evidence);
  const outEvidence: Record<string, EvidenceItem[]> = {};
  const withEvidence: string[] = [];
  const withoutEvidence: string[] = [];

  for (const t of candidates) {
    const ev = Array.isArray(evidenceMap[t]) ? evidenceMap[t] : [];
    const cleanedEv = ev
      .map((e) => ({
        source: e?.source ? String(e.source).trim() : "",
        quote: e?.quote ? String(e.quote).trim() : "",
        confidence:
          typeof e?.confidence === "number" ? e.confidence : undefined,
      }))
      .filter((entry) => entry.source.length > 0 && entry.quote.length > 0);

    outEvidence[t] = cleanedEv;
    if (cleanedEv.length > 0) {
      withEvidence.push(t);
    } else {
      withoutEvidence.push(t);
    }
  }

  const outTags = [...withEvidence, ...withoutEvidence].slice(0, MAX_TAGS);
  const finalEvidence: Record<string, EvidenceItem[]> = {};
  for (const tag of outTags) {
    finalEvidence[tag] = outEvidence[tag] ?? [];
  }

  return {
    tags: outTags,
    evidence: finalEvidence,
    rawTags: normalizedTags,
    rejectedNotInCatalog,
  };
}

// serve import をやめて Deno.serve を使う（型も Request で確定）
Deno.serve(async (req: Request) => {
  console.log("[generate-facts] request", {
    method: req.method,
    url: req.url,
    at: new Date().toISOString(),
  });

  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  let body: GenerateFactsRequest;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const appId = parseAppId(body?.appId);
  if (!appId) return badRequest("appId is required");

  const force = normalizeBool(body?.force, false);
  const debug = normalizeBool(body?.debug, false);
  const sources = Array.isArray(body?.sources) ? body.sources : ["steam"];

  console.log("[generate-facts] parsed", { appId, force, debug, sources });

  if (sources.length === 0 || sources.some((s) => s !== "steam")) {
    return badRequest("sources must be ['steam'] for now");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json(500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: existing, error: readErr } = await supabase
    .from("game_rankings_cache")
    .select("app_id, data")
    .eq("app_id", appId)
    .maybeSingle();

  if (readErr)
    return json(500, { error: "DB read failed", details: readErr.message });

  console.log("[generate-facts] cache row lookup", {
    table: "game_rankings_cache",
    key: "app_id",
    appId,
    found: !!existing,
  });

  // A案：publish 前（=行が無い）なら保存できないので終了
  if (!existing) {
    return json(200, { appId, saved: false, reason: "missing-cache-row" });
  }

  const existingFacts = (existing as any)?.data?.facts;
  if (existingFacts && !force) {
    return json(200, { appId, saved: false, reason: "already-exists" });
  }

  const steam = await fetchSteamAppDetails(appId);
  if (!steam.ok) {
    return json(404, {
      error: "steam-appdetails-not-found",
      appId,
      status: steam.status,
      url: steam.url,
    });
  }

  const corpus = buildCorpusFromSteam(steam.data);

  let raw: Awaited<ReturnType<typeof generateFactsViaLLM>> | null = null;
  try {
    raw = await generateFactsViaLLM({ appId, corpus });
  } catch (e) {
    console.error("[generate-facts] openai failed", {
      appId,
      message: (e as any)?.message ?? String(e),
    });
    return json(500, {
      error: "openai_failed",
      appId,
      details: (e as any)?.message ?? String(e),
    });
  }
  console.log("[generate-facts] llm raw", {
    model: raw?.model,
    rawTagCount: Array.isArray(raw?.tags) ? raw.tags.length : null,
    rawTagsPreview: Array.isArray(raw?.tags) ? raw.tags.slice(0, 10) : null,
  });

  const guarded = guardFacts({
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    evidence:
      raw?.evidence && typeof raw.evidence === "object"
        ? (raw.evidence as Record<string, EvidenceItem[]>)
        : {},
  });
  console.log("[generate-facts] guarded", {
    savedTagCount: guarded.tags.length,
    savedTags: guarded.tags,
  });

  console.log("[generate-facts] guard diff", {
    rawTags: guarded.rawTags,
    guardedTags: guarded.tags,
    rejectedNotInCatalog: guarded.rejectedNotInCatalog,
  });

  const now = new Date().toISOString();

  const nextData = {
    ...((existing as any)?.data ?? {}),
    facts: guarded.tags,
    facts_meta: {
      version: "v1.1",
      generatedAt: now,
      model: raw.model ?? "unknown",
      rawTags: guarded.rawTags,
      rejectedNotInCatalog: guarded.rejectedNotInCatalog,
      evidence: guarded.evidence,
      sources: {
        steam: {
          fetchedAt: now,
          appDetailsOk: true,
          storeApiUrl: steam.url,
        },
      },
      updatedAt: now,
      notes: "facts-only",
    },
  };

  const { error: updateErr } = await supabase
    .from("game_rankings_cache")
    .update({ data: nextData })
    .eq("app_id", appId);

  console.log("[generate-facts] update", {
    ok: !updateErr,
    error: updateErr?.message ?? null,
    factsCount: Array.isArray((nextData as any)?.facts)
      ? (nextData as any).facts.length
      : null,
  });

  if (updateErr) {
    console.error("[generate-facts] update failed", updateErr);
    return json(500, {
      error: "db_update_failed",
      appId,
      details: updateErr.message,
    });
  }

  const { data: checkRow, error: checkErr } = await supabase
    .from("game_rankings_cache")
    .select("app_id, data")
    .eq("app_id", appId)
    .maybeSingle();

  console.log("[generate-facts] post-check", {
    ok: !checkErr,
    hasFacts: Array.isArray((checkRow as any)?.data?.facts),
    factsCount: Array.isArray((checkRow as any)?.data?.facts)
      ? (checkRow as any).data.facts.length
      : null,
    error: checkErr?.message ?? null,
  });

  if (debug) {
    return json(200, {
      appId,
      saved: true,
      facts: guarded.tags,
      debug: {
        corpusChars: corpus.length,
        rawTags: guarded.rawTags,
        guardedTags: guarded.tags,
        rejectedNotInCatalog: guarded.rejectedNotInCatalog,
      },
    });
  }

  return json(200, { appId, saved: true, facts: guarded.tags });
});
