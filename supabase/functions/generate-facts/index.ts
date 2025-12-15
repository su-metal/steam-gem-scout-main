// supabase/functions/generate-facts/index.ts
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 既存のFactsカタログ（SSOT）
import { FACT_TAGS, type FactTag } from "../_shared/facts-v11.ts";

// facts-v11.ts 側に isFactTag が無い前提で、ここで確定ガードを作る
const FACT_TAG_SET = new Set<string>(
  (FACT_TAGS as readonly string[]).map((t) => String(t).trim().toLowerCase())
);
const FACT_TAG_LIST = FACT_TAGS as readonly FactTag[];
const YESNO_FACT_PROPERTIES = FACT_TAG_LIST.reduce<Record<string, { type: "boolean" }>>(
  (acc, tag) => {
    acc[tag] = { type: "boolean" };
    return acc;
  },
  {}
);
function isFactTag(t: string) {
  return FACT_TAG_SET.has(String(t).trim().toLowerCase());
}

const MAX_FACT_TAGS = 10;

const EVIDENCE_REQUIRED_TAGS = new Set<FactTag>([
  "branching_narrative",
  "choice_has_consequence",
  "reading_heavy_interaction",
  "lore_optional_depth",
]);

const EVIDENCE_OPTIONAL_TAGS = new Set<FactTag>([
  "automation_core",
  "optimization_required",
  "resource_management",
  "systems_interaction_depth",
  "free_movement_exploration",
  "job_simulation_loop",
]);

type FactSourceId = "steam" | "igdb" | "wikipedia" | "pcgw" | "reddit";

const FACT_SOURCE_POLICY_VERSION = "v1";

const FACT_TAG_SOURCES: Record<FactTag, readonly FactSourceId[]> = FACT_TAGS.reduce(
  (acc, tag) => {
    acc[tag] = ["steam"];
    return acc;
  },
  {} as Record<FactTag, readonly FactSourceId[]>
) as Record<FactTag, readonly FactSourceId[]>;

type GenerationMode = "tags" | "yesno";

const DEFAULT_GENERATION_MODE: GenerationMode = "tags";

type GenerateFactsRequest = {
  appId: number | string;
  force?: boolean;
  sources?: string[];
  debug?: boolean;
  mode?: GenerationMode;
};

type EvidenceItem = {
  source: string;
  quote: string;
  confidence?: number;
};

const NARRATIVE_GUARD_TAGS: Set<FactTag> = new Set([
  "narrative_driven_progression",
  "branching_narrative",
  "choice_has_consequence",
  "reading_heavy_interaction",
  "lore_optional_depth",
]);

const NARRATIVE_TRIGGER_PATTERNS: Partial<Record<FactTag, RegExp[]>> = {
  narrative_driven_progression: [
    /story[-\s]?driven/,
    /plot/,
    /narrative/,
    /story[-\s]?rich/,
    /campaign story/,
    /character[-\s]?driven/,
    /dialogue[-\s]?heavy/,
    /visual novel/,
  ],
  branching_narrative: [
    /branching/,
    /multiple endings/,
    /choices? matter/,
    /decision[-\s]?driven/,
  ],
  choice_has_consequence: [
    /choices? matter/,
    /decision[-\s]?driven/,
    /consequences?/,
  ],
  reading_heavy_interaction: [
    /visual novel/,
    /text[-\s]?based/,
    /dialogue[-\s]?heavy/,
    /lots of reading/,
  ],
  lore_optional_depth: [
    /lore/,
    /worldbuilding/,
  ],
};

function isNarrativeAllowedByCorpus(corpus: string, tag: FactTag) {
  const patterns = NARRATIVE_TRIGGER_PATTERNS[tag];
  if (!patterns?.length) return true;
  const normalized = corpus.toLowerCase();
  return patterns.some((pattern) => pattern.test(normalized));
}

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

const ALL_SOURCE_IDS: FactSourceId[] = ["steam", "igdb", "wikipedia", "pcgw", "reddit"];

function normalizeSource(value: unknown): FactSourceId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase() as FactSourceId;
  return ALL_SOURCE_IDS.includes(normalized) ? normalized : null;
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

function parseModeValue(value: unknown): GenerationMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "tags" || normalized === "yesno") {
    return normalized;
  }
  return null;
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

async function generateFactsViaLLM(args: {
  appId: number;
  corpus: string;
  mode?: GenerationMode;
}) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = Deno.env.get("OPENAI_FACTS_MODEL") ?? "gpt-4o-mini";
  const mode = args.mode ?? DEFAULT_GENERATION_MODE;
  const isYesNo = mode === "yesno";

  // カタログ（facts-v11.ts の FACT_TAGS）をプロンプトで“列挙”して幻覚を抑える
  const allowedTags = Array.from(FACT_TAG_SET).sort();

  // Structured Outputs: json_schema で固定（スキーマに必ず一致）
  // Docs: response_format = { type:"json_schema", json_schema:{...} } :contentReference[oaicite:1]{index=1}
  const tagsSchema = {
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

  const yesNoSchema = {
    name: "facts_yesno",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["facts"],
      properties: {
        facts: {
          type: "object",
          additionalProperties: false,
          required: FACT_TAG_LIST as string[],
          properties: YESNO_FACT_PROPERTIES,
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
        },
        notes: {
          type: "string",
        },
      },
    },
  } as const;

  const schema = isYesNo ? yesNoSchema : tagsSchema;

  const system = [
    "You are a facts extractor for Steam games.",
    "Return ONLY JSON that matches the provided JSON Schema.",
    "Select tags ONLY from the provided allowed tag list.",
    "Evidence keys must match the returned tags (lowercase).",
    "If a tag clearly applies but no direct quote is available in the corpus, output the tag with an empty evidence array.",
    "Every returned tag MUST have at least 1 evidence item when available.",
    `For these tags you must provide at least 1 evidence quote; otherwise omit the tag: ${Array.from(
      EVIDENCE_REQUIRED_TAGS
    ).join(", ")}.`,
    "automation_core is ONLY for factory/logistics/production lines/self-running automated systems. Do NOT use it for crafting/upgrades/stealth/planning or figurative automation.",
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

  const evidenceRequirementInstruction = `
Evidence requirement:
- For the following tags you MUST provide at least 1 evidence quote; otherwise omit the tag: ${Array.from(
    EVIDENCE_REQUIRED_TAGS
  ).join(", ")}.
`;

  const automationInstruction = `
automation_core is ONLY for factory/logistics/production lines/self-running automated systems. Do NOT use it for crafting/upgrades/stealth/planning or figurative “automation”.
`;

  const disambiguationRules = `
Disambiguation rules (avoid false positives):
- free_movement_exploration:
  Only if exploration/traversal is a PRIMARY loop (open world roaming, exploration-first structure, traversal as core activity).
  Do NOT select just because the game has towns/fields/world map or "go on an adventure" marketing text.

- open_ended_goal:
  Only if players set their own goals with no fixed main objective (sandbox, self-directed play).
  Do NOT select for RPGs with a main quest/story progression, even if there is optional content.

- resource_management:
  Only if scarcity/allocation/budgeting is CENTRAL and repeatedly constrains play (limited supplies, strict economy, survival resources).
  Do NOT select just because the game has items, gold, equipment, or inventory.
`;

  const promptIntro = `${glossaryIntro}\n${productRules}\n${negativeRules}\n${selectionPolicy}\n${evidenceRequirementInstruction}\n${automationInstruction}`;

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

  const baseSystemParts = [
    system,
    productRules,
    negativeRules,
    selectionPolicy,
    disambiguationRules,
    glossaryIntro,
    glossaryBody,
  ];

  const yesNoModeInstructions = [
    "Yes/No mode instructions:",
    "- Respond ONLY with JSON matching the schema.",
    "- Return a facts object that lists every FACT_TAG with true or false. If uncertain, set false.",
    "- Each facts key must be the literal boolean `true` or `false`. Do NOT return `null`, strings, numbers, yes/no words, or any other placeholder values.",
    "- Provide evidence arrays when possible; empty arrays are acceptable.",
    "- Include a confidence level (high|medium|low) and optional notes.",
    "- Decide each tag only from its allowed primary sources. If the source is missing or inconclusive, output false.",
    "- Never guess narrative focus: only set narrative_driven_progression true when the corpus explicitly uses story-driven, narrative-driven, story campaign, story-rich, plot, character-driven, dialogue-heavy, visual novel, or equivalent language stating story/campaign is the progression core. If those exact cues are absent or ambiguous (e.g., lore/world/setting/sandbox/automation/simulation hints), set narrative_driven_progression false.",
    "- The narrative cluster (narrative_driven_progression, branching_narrative, choice_has_consequence, reading_heavy_interaction, lore_optional_depth) must likewise be false unless the corpus explicitly confirms a story-driven or choice-driven progression in plain terms.",
  ].join("\n");
  const sourcePolicyLines = [
    "Source policy:",
    "- Use only the allowed primary sources listed below for each tag.",
    ...FACT_TAG_LIST.map((tag) => {
      const allowed = FACT_TAG_SOURCES[tag] ?? ["steam"];
      return `- ${tag}: ${Array.from(new Set(allowed)).join(", ")}`;
    }),
  ].join("\n");

  const fullSystem = isYesNo
    ? [...baseSystemParts, yesNoModeInstructions, sourcePolicyLines].join("\n\n")
    : baseSystemParts.join("\n\n");

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

  const choicesContent = json?.choices?.[0]?.message?.content;
  const legacyOutputContent = json?.output?.[0]?.content;
  const ensureArray = (value: unknown): any[] => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
    return [];
  };
  const choiceEntries = ensureArray(choicesContent);
  const legacyEntries = ensureArray(legacyOutputContent);
  const combinedEntries = [...choiceEntries, ...legacyEntries];

  const firstTextEntry =
    combinedEntries.find((entry) => typeof entry?.text === "string")?.text ??
    "";
  const fallbackRawText =
    typeof json?.output_text === "string" ? json.output_text : "";
  const rawText =
    typeof choicesContent === "string"
      ? choicesContent
      : firstTextEntry || fallbackRawText;

  const structuredYesNoEntry = combinedEntries.find(
    (entry) => entry?.type === yesNoSchema.name
  );

  if (!rawText && !(isYesNo && structuredYesNoEntry?.content)) {
    console.error("[generate-facts] openai missing content", {
      status,
      jsonPreview: JSON.stringify(json).slice(0, 800),
    });
    throw new Error(`OpenAI response missing content (HTTP ${status})`);
  }

  let parsed: any;
  if (isYesNo && structuredYesNoEntry?.content) {
    parsed = structuredYesNoEntry.content;
  } else {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("[generate-facts] model content not json", {
        rawTextPreview: rawText.slice(0, 800),
      });
      throw new Error(
        `Model output is not valid JSON: ${rawText.slice(0, 800)}`
      );
    }
  }

  if (isYesNo) {
    const factsSource = parsed?.facts;
    if (!factsSource || typeof factsSource !== "object" || Array.isArray(factsSource)) {
      throw new Error("Yes/No response missing facts object");
    }

    const normalizedFacts: Record<FactTag, boolean> = {} as Record<
      FactTag,
      boolean
    >;
    const typeErrors: Array<{
      tag: FactTag;
      valueType: string;
      rawValuePreview: string;
    }> = [];

    const normalizeValue = (tag: FactTag, rawValue: unknown): boolean => {
      if (typeof rawValue === "boolean") return rawValue;
      if (typeof rawValue === "string") {
        const lowered = rawValue.trim().toLowerCase();
        if (lowered === "true") return true;
        if (lowered === "false") return false;
        typeErrors.push({
          tag,
          valueType: "string",
          rawValuePreview: rawValue.slice(0, 80),
        });
        return false;
      }
      if (typeof rawValue === "number") {
        if (rawValue === 1) return true;
        if (rawValue === 0) return false;
        typeErrors.push({
          tag,
          valueType: "number",
          rawValuePreview: String(rawValue),
        });
        return false;
      }
      if (rawValue == null) {
        typeErrors.push({
          tag,
          valueType: rawValue === null ? "null" : "undefined",
          rawValuePreview: String(rawValue),
        });
        return false;
      }
      typeErrors.push({
        tag,
        valueType: typeof rawValue,
        rawValuePreview: JSON.stringify(rawValue)?.slice(0, 80) ?? "",
      });
      return false;
    };

    for (const tag of FACT_TAG_LIST) {
      const rawValue = factsSource[tag];
      normalizedFacts[tag] = normalizeValue(tag, rawValue);
    }

    const trueTags = FACT_TAG_LIST.filter((tag) => normalizedFacts[tag]);

    const evidenceRaw = normalizeEvidenceMap(
      parsed?.evidence && typeof parsed.evidence === "object"
        ? (parsed.evidence as Record<string, EvidenceItem[]>)
        : {}
    );

    return {
      model,
      mode,
      yesnoFacts: normalizedFacts,
      yesnoRawFacts: factsSource,
      yesnoConfidence:
        typeof parsed?.confidence === "string" ? parsed.confidence : undefined,
      yesnoNotes:
        typeof parsed?.notes === "string" ? parsed.notes : undefined,
      yesnoTypeErrors: typeErrors,
      tags: trueTags,
      evidence: evidenceRaw,
    };
  }

  return {
    model,
    ...(parsed ?? {}),
    mode,
  };
}

function guardFacts(raw: {
  tags: string[];
  evidence: Record<string, EvidenceItem[]>;
}) {
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
  const evidenceCountsByTag: Record<string, number> = {};
  const withEvidence: string[] = [];
  const withoutEvidence: string[] = [];
  const rejectedNoEvidenceRequired: string[] = [];
  const keptWithoutEvidence: string[] = [];

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

    evidenceCountsByTag[t] = cleanedEv.length;
    if (EVIDENCE_REQUIRED_TAGS.has(t as FactTag) && cleanedEv.length === 0) {
      rejectedNoEvidenceRequired.push(t);
      continue;
    }

    outEvidence[t] = cleanedEv;
    if (cleanedEv.length > 0) {
      withEvidence.push(t);
    } else {
      withoutEvidence.push(t);
      keptWithoutEvidence.push(t);
    }
  }

  const outTags = [...withEvidence, ...withoutEvidence].slice(0, MAX_FACT_TAGS);
  const finalEvidence: Record<string, EvidenceItem[]> = {};
  for (const tag of outTags) {
    finalEvidence[tag] = outEvidence[tag] ?? [];
  }

  return {
    tags: outTags,
    evidence: finalEvidence,
    rawTags: normalizedTags,
    rejectedNotInCatalog,
    rejectedNoEvidenceRequired,
    keptWithoutEvidence,
    evidenceCountsByTag,
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

  const url = new URL(req.url);

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
  const rawSources = Array.isArray(body?.sources) ? body.sources : ["steam"];
  const requestedSourcesNormalized = rawSources
    .map(normalizeSource)
    .filter((v): v is FactSourceId => v !== null);
  if (requestedSourcesNormalized.length === 0) {
    requestedSourcesNormalized.push("steam");
  }

  const hasModeInBody = Object.prototype.hasOwnProperty.call(body ?? {}, "mode");
  const parsedBodyMode = parseModeValue(body?.mode);
  if (hasModeInBody && parsedBodyMode === null) {
    return badRequest("invalid_mode");
  }

  const queryModeRaw = url.searchParams.get("mode");
  const hasModeInQuery = queryModeRaw !== null;
  const parsedQueryMode = parseModeValue(queryModeRaw);
  if (hasModeInQuery && parsedQueryMode === null) {
    return badRequest("invalid_mode");
  }

  const mode: GenerationMode =
    parsedBodyMode ?? parsedQueryMode ?? DEFAULT_GENERATION_MODE;
  const modeSource = parsedBodyMode
    ? "body"
    : parsedQueryMode
    ? "query"
    : "default";

  const parsedLog: Record<string, unknown> = {
    appId,
    force,
    debug,
    requestedSources: requestedSourcesNormalized,
    mode,
    modeSource,
  };
  if (debug) {
    parsedLog.requestBodyKeys = Object.keys(body ?? {});
  }
  console.log("[generate-facts] parsed", parsedLog);

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

  const corpusPieces: string[] = [];
  const effectiveSources = new Set<FactSourceId>();

  let steamAppDetails: Awaited<ReturnType<typeof fetchSteamAppDetails>> | null = null;
  if (requestedSourcesNormalized.includes("steam")) {
    const steam = await fetchSteamAppDetails(appId);
    if (!steam.ok) {
      return json(404, {
        error: "steam-appdetails-not-found",
        appId,
        status: steam.status,
        url: steam.url,
      });
    }
    steamAppDetails = steam;
    effectiveSources.add("steam");
    corpusPieces.push(buildCorpusFromSteam(steam.data));
  } else {
    return json(400, {
      error: "steam source is required for now",
    });
  }

  const corpus = corpusPieces.join("\n\n");
  const tagsMissingAllowedSources: FactTag[] = FACT_TAG_LIST.filter((tag) => {
    const allowed = FACT_TAG_SOURCES[tag] ?? ["steam"];
    return !allowed.some((src) => effectiveSources.has(src));
  });

  let raw: Awaited<ReturnType<typeof generateFactsViaLLM>> | null = null;
  try {
    raw = await generateFactsViaLLM({ appId, corpus, mode });
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
    mode,
    rawTagCount: Array.isArray(raw?.tags) ? raw.tags.length : null,
    rawTagsPreview: Array.isArray(raw?.tags) ? raw.tags.slice(0, 10) : null,
  });

  if (mode === "yesno") {
    console.log("[generate-facts] yn_v1 preview", {
      trueCount: Array.isArray(raw?.tags) ? raw.tags.length : 0,
      trueTagsPreview: Array.isArray(raw?.tags) ? raw.tags.slice(0, 10) : [],
      confidence: raw?.yesnoConfidence ?? null,
      missingAllowedSourceTags: tagsMissingAllowedSources.slice(0, 10),
      ynTypeErrorCount: Array.isArray(raw?.yesnoTypeErrors)
        ? raw.yesnoTypeErrors.length
        : 0,
    });
  }

  let guardTags = Array.isArray(raw?.tags) ? [...raw.tags] : [];
  const narrativeForcedFalse: FactTag[] = [];
  if (mode === "yesno") {
    guardTags = guardTags.filter((tag) => {
      const factTag = tag as FactTag;
      if (!NARRATIVE_GUARD_TAGS.has(factTag)) return true;
      if (isNarrativeAllowedByCorpus(corpus, factTag)) return true;
      narrativeForcedFalse.push(factTag);
      return false;
    });
  }

  const guarded = guardFacts({
    tags: guardTags,
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
    rejectedNoEvidenceRequired: guarded.rejectedNoEvidenceRequired,
    keptWithoutEvidence: guarded.keptWithoutEvidence,
  });

  const now = new Date().toISOString();
  const effectiveSourcesList = Array.from(effectiveSources);
  const sourcesUsedByTag: Partial<Record<FactTag, FactSourceId[]>> = {};
  for (const tag of guarded.tags) {
    const allowed = FACT_TAG_SOURCES[tag] ?? ["steam"];
    const used = allowed.filter((src) => effectiveSources.has(src));
    sourcesUsedByTag[tag] = used.length > 0 ? used : [allowed[0]];
  }

  const nextData = {
    ...((existing as any)?.data ?? {}),
    facts: guarded.tags,
    facts_meta: {
      version: "v1.1",
      generatedAt: now,
      model: raw.model ?? "unknown",
      rawTags: guarded.rawTags,
      rejectedNotInCatalog: guarded.rejectedNotInCatalog,
      catalogMisses: guarded.rejectedNotInCatalog,
      acceptedTags: guarded.tags,
      rejectedNoEvidenceRequired: guarded.rejectedNoEvidenceRequired,
      keptWithoutEvidence: guarded.keptWithoutEvidence,
      evidenceCountsByTag: guarded.evidenceCountsByTag,
      evidence: guarded.evidence,
      requestedSources: requestedSourcesNormalized,
      effectiveSources: effectiveSourcesList,
      tagSourcePolicyVersion: FACT_SOURCE_POLICY_VERSION,
      sourcesUsedByTag,
      sources: {
        steam: {
          fetchedAt: now,
          appDetailsOk: true,
          storeApiUrl: steamAppDetails?.url ?? null,
        },
      },
      updatedAt: now,
      notes: "facts-only",
      ynRawPreview:
        mode === "yesno" && Array.isArray(raw?.tags) ? raw.tags : undefined,
      narrativeForcedFalse,
      ynTypeErrors:
        mode === "yesno" && Array.isArray(raw?.yesnoTypeErrors)
          ? raw.yesnoTypeErrors
          : undefined,
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
        rejectedNoEvidenceRequired: guarded.rejectedNoEvidenceRequired,
        keptWithoutEvidence: guarded.keptWithoutEvidence,
        evidenceCountsByTag: guarded.evidenceCountsByTag,
        requestedSources: requestedSourcesNormalized,
        effectiveSources: effectiveSourcesList,
        sourcesUsedByTag,
        missingAllowedSourceTags: tagsMissingAllowedSources,
        narrativeForcedFalse,
        ynTypeErrors:
          mode === "yesno" && Array.isArray(raw?.yesnoTypeErrors)
            ? raw.yesnoTypeErrors
            : undefined,
        ynRaw:
          mode === "yesno"
            ? {
                facts: raw?.yesnoRawFacts ?? raw?.yesnoFacts,
                confidence: raw?.yesnoConfidence,
                notes: raw?.yesnoNotes,
                forcedFalse: narrativeForcedFalse,
              }
            : undefined,
      },
    });
  }

  return json(200, { appId, saved: true, facts: guarded.tags });
});
