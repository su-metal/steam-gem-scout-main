// supabase/functions/generate-facts/index.ts
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 既存のFactsカタログ（SSOT）
import {
  FACT_TAGS,
  PERSISTED_FACT_TAGS,
  type FactTag,
  type PersistedFactTag,
  isFactTag,
  isNeverPersistFactTag,
} from "../_shared/facts-v11.ts";

const FACT_TAG_LIST = PERSISTED_FACT_TAGS as readonly PersistedFactTag[];
const IMPORTANT_YN_TAGS: FactTag[] = [
  "resource_management",
  "power_scaling_over_time",
  "automation_core",
  "planning_required",
  "optimization_required",
  "high_input_pressure",
  "time_pressure",
  "high_stakes_failure",
  "narrative_driven_progression",
  "creative_manipulation",
  "low_pressure_play",
  "battle_loop_core",
];
const YESNO_FACT_PROPERTIES = FACT_TAG_LIST.reduce<
  Record<PersistedFactTag, { type: "boolean" }>
>((acc, tag) => {
  acc[tag] = { type: "boolean" };
  return acc;
}, {});

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
  "free_movement_exploration",
  "job_simulation_loop",
]);

type FactSourceId = "steam" | "igdb" | "wikipedia" | "pcgw" | "reddit";

const FACT_SOURCE_POLICY_VERSION = "v1";

const FACT_TAG_SOURCES: Record<PersistedFactTag, readonly FactSourceId[]> =
  FACT_TAGS.reduce((acc, tag) => {
    acc[tag] = ["steam"];
    return acc;
  }, {} as Record<PersistedFactTag, readonly FactSourceId[]>);

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
    /(?:^|\W)story\s*:/i, // ★これで "Story:" 見出しを確実に拾う
    /\bstory[-\s]?driven\b/i,
    /\bplot\b/i,
    /\bnarrative\b/i,
    /\bstory[-\s]?rich\b/i,
    /\bcharacter[-\s]?driven\b/i,
    /\bdialogue[-\s]?heavy\b/i,
    /\bvisual\s+novel\b/i,
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
  lore_optional_depth: [/lore/, /worldbuilding/],
};

const NARRATIVE_STORY_PHRASE_PATTERNS: RegExp[] = [
  /\benjoy(?: the)? story\b/i,
  /\btimeless story\b/i,
  /\bstory told\b/i,
  /\bstory of\b/i,
];
const STORY_WORD_PATTERN = /\bstory\b/i;

function isNarrativeAllowedByCorpus(
  corpus: string,
  tag: FactTag,
  yesnoFacts?: Record<FactTag, boolean>
) {
  const patterns = NARRATIVE_TRIGGER_PATTERNS[tag];
  const normalized = corpus.toLowerCase();
  if (!patterns?.length) return true;
  if (patterns.some((pattern) => pattern.test(normalized))) return true;
  if (tag !== "narrative_driven_progression") return false;
  const storyPhraseHit = NARRATIVE_STORY_PHRASE_PATTERNS.some((pattern) =>
    pattern.test(normalized)
  );
  const storyWordHit = STORY_WORD_PATTERN.test(normalized);
  if (!storyWordHit) return false;
  const hasGenreSignal = /genres:\s*.*\b(rpg|adventure)\b/i.test(corpus);
  const narrativeTrue = !!yesnoFacts?.narrative_driven_progression;
  const allowStoryWord =
    storyWordHit &&
    (storyPhraseHit || hasGenreSignal || (narrativeTrue && storyWordHit));
  return allowStoryWord;
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

const ALL_SOURCE_IDS: FactSourceId[] = [
  "steam",
  "igdb",
  "wikipedia",
  "pcgw",
  "reddit",
];

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

function filterNeverPersistTags(tags: unknown[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => normalizeTagKey(tag))
    .filter((tag) => tag.length > 0 && !isNeverPersistFactTag(tag));
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

const NARRATIVE_STRONG_PATTERNS: RegExp[] = [
  /story[-\s]?driven/i,
  /plot/i,
  /narrative/i,
  /story[-\s]?rich/i,
  /campaign story/i,
  /character[-\s]?driven/i,
  /dialogue[-\s]?heavy/i,
  /visual novel/i,
  /(?:^|\W)story\s*:/i,
  /\benjoy(?: the)? story\b/i,
  /\btimeless story\b/i,
  /\bstory told\b/i,
  /\bstory of\b/i,
];
const NARRATIVE_WEAK_PATTERNS: RegExp[] = [
  /adventure/i,
  /journey/i,
  /chapter/i,
  /episode/i,
  /reimagining/i,
  /reimagination/i,
  /reborn/i,
  /legendary/i,
  /classic/i,
  /timeless/i,
];

const TIME_PRESSURE_HARD_PATTERN = /\b(time limit|timed|race against time|countdown|before time runs out|within \d+\s*minutes?|beat the clock)\b/i;
const ATB_PATTERN = /\b(active time battle|atb|time gauge|battle gauge|gauge fills|active battle)\b/i;

function findHits(patterns: RegExp[], text: string, cap = 6) {
  const hits: string[] = [];
  for (const re of patterns) {
    if (re.test(text)) {
      hits.push(re.source);
      if (hits.length >= cap) break;
    }
  }
  return hits;
}

function normalizeConflicts(tags: string[], corpus: string) {
  const normalizedCorpus = corpus.toLowerCase();
  const hasHighInput = tags.includes("high_input_pressure");
  const hasTimePressure = tags.includes("time_pressure");
  const hasPauseFriendly = tags.includes("pause_friendly");
  const hasExplicitTimeEvidence = TIME_PRESSURE_HARD_PATTERN.test(
    normalizedCorpus
  );
  const hasAtbSignal = ATB_PATTERN.test(normalizedCorpus);
  const conflictRejected = new Set<FactTag>();
  const filtered: string[] = [];

  for (const tag of tags) {
    if (tag === "low_pressure_play" && (hasHighInput || hasTimePressure)) {
      conflictRejected.add("low_pressure_play");
      continue;
    }
    if (
      tag === "time_pressure" &&
      hasPauseFriendly &&
      hasAtbSignal &&
      !hasExplicitTimeEvidence
    ) {
      conflictRejected.add("time_pressure");
      continue;
    }
    filtered.push(tag);
  }

  return {
    tags: filtered,
    conflictRejected: Array.from(conflictRejected),
  };
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

type SteamCorpusInfo = {
  corpus: string;
  fieldsUsed: string[];
  charCounts: Record<string, number>;
  totalChars: number;
  fieldPreview: Record<string, string>;
  preview: string;
};

function buildCorpusFromSteam(app: any): SteamCorpusInfo {
  const short =
    typeof app?.short_description === "string"
      ? stripHtml(app.short_description)
      : "";
  const about =
    typeof app?.about_the_game === "string"
      ? stripHtml(app.about_the_game)
      : "";
  const genres = Array.isArray(app?.genres)
    ? app.genres.map((g: any) => g?.description).filter(Boolean)
    : [];
  const categories = Array.isArray(app?.categories)
    ? app.categories.map((c: any) => c?.description).filter(Boolean)
    : [];

  const corpusParts = [
    `steam.short:\n${short}`,
    `steam.about:\n${about}`,
    `steam.genres:\n${genres.join(", ")}`,
    `steam.categories:\n${categories.join(", ")}`,
  ];

  const fieldEntries: [string, string][] = [];
  if (short.length > 0) fieldEntries.push(["short_description", short]);
  if (about.length > 0) fieldEntries.push(["about_the_game", about]);
  const genreText = genres.join(", ");
  if (genreText.length > 0) fieldEntries.push(["genres", genreText]);
  const categoryText = categories.join(", ");
  if (categoryText.length > 0) fieldEntries.push(["categories", categoryText]);

  const corpus = corpusParts.join("\n\n");
  const MAX_CHARS = 16000;
  const finalCorpus =
    corpus.length > MAX_CHARS ? corpus.slice(0, MAX_CHARS) : corpus;

  const charCounts: Record<string, number> = {};
  const preview: Record<string, string> = {};
  let totalChars = 0;
  for (const [key, value] of fieldEntries) {
    charCounts[key] = value.length;
    preview[key] = value.slice(0, 300);
    totalChars += value.length;
  }

  const previewSnippet = finalCorpus.slice(0, 600).replace(/\s+/g, " ").trim();

  return {
    corpus: finalCorpus,
    fieldsUsed: fieldEntries.map(([key]) => key),
    charCounts,
    totalChars,
    fieldPreview: preview,
    preview: previewSnippet,
  };
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
  const allowedTags = Array.from(FACT_TAGS).sort();

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
    "Derived-only tags (e.g., systems_interaction_depth) must not be emitted; they are calculated separately.",
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

time_pressure
  The game applies time limits, deadlines, timers, or urgency where delay is punished.
  Keywords: time limit, timer, deadline, race against time, urgency, time pressure, countdown

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

low_pressure_play
  Relaxed pace; mistakes are forgiving and the game does not demand constant attention.
  Keywords: relaxing, chill, laid-back, cozy, casual pace, forgiving, no stress
  Note: If high_input_pressure or time_pressure is true, low_pressure_play should be treated as false (conflict).

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

battle_loop_core:
  Repeated combat encounters form the central gameplay loop, where players
  regularly fight enemies as a primary means of progression or engagement.
  Keywords: turn-based battles, random encounters, combat-focused loop,
            frequent battles, core combat system


power_scaling_over_time:
  Player power increases meaningfully over time via leveling/XP, stat growth, skill acquisition, perks/skill trees, or gear/equipment upgrades (i.e., you become stronger as you progress).
  Keywords: level up, leveling, XP, experience points, stat growth, skill tree, perk, progression system, gear upgrade, equipment upgrade, stronger over time, character growth


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
    "- If the corpus contains a clear story header like \"Story:\" or \"Plot:\", set narrative_driven_progression true.",
    "- power_scaling_over_time: Set true only if the Steam corpus explicitly indicates progression that increases player power over time (e.g., leveling/XP, stat growth, skill acquisition, perks/skill trees, or gear/equipment upgrades, becoming stronger over time). Do NOT assume it just because it is an RPG.",
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
    ? [...baseSystemParts, yesNoModeInstructions, sourcePolicyLines].join(
        "\n\n"
      )
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
    const factsSourceRaw = parsed?.facts;
    if (!factsSourceRaw || typeof factsSourceRaw !== "object") {
      throw new Error("Yes/No response missing facts object");
    }

    type YnInputShape = "object" | "string_list" | "unknown";
    let ynInputShape: YnInputShape = "unknown";
    let factsMapForNormalization: Record<string, unknown> = {};
    let stringListTrueSet: Set<string> | null = null;

    if (Array.isArray(factsSourceRaw)) {
      const isStringList = factsSourceRaw.every(
        (entry) => typeof entry === "string"
      );
      ynInputShape = isStringList ? "string_list" : "unknown";
      if (isStringList) {
        stringListTrueSet = new Set(
          factsSourceRaw
            .map((entry) => normalizeTagKey(entry))
            .filter((entry) => entry.length > 0)
        );
        const stringListMap: Record<string, boolean> = {};
        for (const tag of FACT_TAG_LIST) {
          stringListMap[tag] = stringListTrueSet.has(tag);
        }
        factsMapForNormalization = stringListMap;
      } else {
        factsMapForNormalization = {};
      }
    } else {
      ynInputShape = "object";
      factsMapForNormalization = factsSourceRaw as Record<string, unknown>;
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
    const missingKeys = new Set<FactTag>();

    const normalizeValue = (tag: FactTag, rawValue: unknown): boolean => {
      if (rawValue === undefined) {
        missingKeys.add(tag);
        return false;
      }
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
      if (rawValue === null) {
        typeErrors.push({
          tag,
          valueType: "null",
          rawValuePreview: "null",
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
      const rawValue = factsMapForNormalization[tag];
      normalizedFacts[tag] = normalizeValue(tag, rawValue);
    }

    if (stringListTrueSet) {
      for (const tag of IMPORTANT_YN_TAGS) {
        if (!stringListTrueSet.has(tag)) {
          missingKeys.add(tag);
        }
      }
    }

    const missingKeysArray = Array.from(missingKeys).filter(isFactTag);
    const trueTags = FACT_TAG_LIST.filter((tag) => normalizedFacts[tag]);
    const ynOmittedKeyCountApprox =
      stringListTrueSet !== null
        ? Math.max(FACT_TAG_LIST.length - stringListTrueSet.size, 0)
        : undefined;

    const evidenceRaw = normalizeEvidenceMap(
      parsed?.evidence && typeof parsed.evidence === "object"
        ? (parsed.evidence as Record<string, EvidenceItem[]>)
        : {}
    );

    return {
      model,
      mode,
      yesnoFacts: normalizedFacts,
      yesnoRawFacts: factsSourceRaw,
      yesnoConfidence:
        typeof parsed?.confidence === "string" ? parsed.confidence : undefined,
      yesnoNotes: typeof parsed?.notes === "string" ? parsed.notes : undefined,
      yesnoTypeErrors: typeErrors,
      ynMissingKeys: missingKeysArray,
      ynInputShape,
      ynOmittedKeyCountApprox,
      ynRaw: factsSourceRaw,
      ynTrueCount: trueTags.length,
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
  const rejectedNeverPersist: string[] = [];
  const filteredNormalizedTags = normalizedTags.filter((tag) => {
    if (isNeverPersistFactTag(tag)) {
      rejectedNeverPersist.push(tag);
      return false;
    }
    return true;
  });

  const seen = new Set<string>();
  const candidates: string[] = [];
  const rejectedNotInCatalog: string[] = [];

  for (const t of filteredNormalizedTags) {
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
    rawTags: filteredNormalizedTags,
    rejectedNotInCatalog,
    rejectedNeverPersist,
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

  const hasModeInBody = Object.prototype.hasOwnProperty.call(
    body ?? {},
    "mode"
  );
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
  let steamCorpusFieldsUsed: string[] = [];
  let steamCorpusCharCounts: Record<string, number> = {};
  let steamCorpusTotalChars = 0;
  let steamCorpusPreview = "";
  let steamCorpusFieldPreview: Record<string, string> = {};

  let steamAppDetails: Awaited<ReturnType<typeof fetchSteamAppDetails>> | null =
    null;
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
    const steamCorpusInfo = buildCorpusFromSteam(steam.data);
    steamCorpusFieldsUsed = steamCorpusInfo.fieldsUsed;
    steamCorpusCharCounts = steamCorpusInfo.charCounts;
    steamCorpusTotalChars = steamCorpusInfo.totalChars;
    steamCorpusFieldPreview = steamCorpusInfo.fieldPreview;
    steamCorpusPreview = steamCorpusInfo.preview;
    corpusPieces.push(steamCorpusInfo.corpus);
  } else {
    return json(400, {
      error: "steam source is required for now",
    });
  }

  const corpus = corpusPieces.join("\n\n");
  const narrativeTriggerHitSet = new Set<string>();
  const narrativeTriggerHits: string[] = [];
  for (const [tag, patterns] of Object.entries(NARRATIVE_TRIGGER_PATTERNS)) {
    for (const pattern of patterns ?? []) {
      if (pattern.test(corpus)) {
        const key = `${tag}:${pattern.source}`;
        if (!narrativeTriggerHitSet.has(key)) {
          narrativeTriggerHitSet.add(key);
          if (narrativeTriggerHits.length < 10) {
            narrativeTriggerHits.push(key);
          }
        }
      }
    }
  }
  const narrativeTriggerHitCount = narrativeTriggerHitSet.size;
  console.log("[generate-facts] steam corpus", {
    fieldsUsed: steamCorpusFieldsUsed,
    charCounts: steamCorpusCharCounts,
    totalChars: steamCorpusTotalChars,
    preview: steamCorpusPreview,
    previewFields: steamCorpusFieldPreview,
  });
  console.log("[generate-facts] narrative triggers", {
    narrativeTriggerHitCount,
    narrativeTriggerHits,
  });
  const narrativeStrongHits = findHits(NARRATIVE_STRONG_PATTERNS, corpus);
  const narrativeWeakHits = findHits(NARRATIVE_WEAK_PATTERNS, corpus);
  const narrativeStrongHitCount = narrativeStrongHits.length;
  const narrativeWeakHitCount = narrativeWeakHits.length;
  let narrativeDecision: "strong" | "weak_combo" | "none" = "none";
  let narrativeDecisionHasRpgSignal = false;
  let narrativeCorpusOverride = false;
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
  if (mode === "yesno" && raw?.yesnoFacts) {
    const yesnoFacts = raw.yesnoFacts;
    const hasRpgSignal =
      yesnoFacts.battle_loop_core === true ||
      yesnoFacts.power_scaling_over_time === true ||
      /genres:\s*.*\bRPG\b/i.test(corpus) ||
      /\bRPG\b/i.test(corpus);
    narrativeDecisionHasRpgSignal = hasRpgSignal;
    const weakOk = narrativeWeakHitCount >= 2 && hasRpgSignal;
    const strong = narrativeStrongHitCount >= 1;
    narrativeDecision = strong ? "strong" : weakOk ? "weak_combo" : "none";
    narrativeCorpusOverride = strong || weakOk;
    if (narrativeCorpusOverride) {
      yesnoFacts.narrative_driven_progression = true;
    }
    const updatedTags = FACT_TAG_LIST.filter((tag) => yesnoFacts[tag]);
    raw.tags = updatedTags;
  }
  const sanitizedLLMRawTags = filterNeverPersistTags(raw?.tags);
  console.log("[generate-facts] llm raw", {
    model: raw?.model,
    mode,
    rawTagCount: sanitizedLLMRawTags.length,
    rawTagsPreview: sanitizedLLMRawTags.slice(0, 10),
    ynInputShape: raw?.ynInputShape,
    ynOmittedKeyCountApprox: raw?.ynOmittedKeyCountApprox,
  });

  console.log("[generate-facts] narrative decision", {
    strongHitCount: narrativeStrongHitCount,
    weakHitCount: narrativeWeakHitCount,
    hasRpgSignal: narrativeDecisionHasRpgSignal,
    decision: narrativeDecision,
  });

  if (mode === "yesno") {
    console.log("[generate-facts] yn_v1 preview", {
      trueCount: sanitizedLLMRawTags.length,
      trueTagsPreview: sanitizedLLMRawTags.slice(0, 10),
      confidence: raw?.yesnoConfidence ?? null,
      missingAllowedSourceTags: tagsMissingAllowedSources.slice(0, 10),
      ynTypeErrorCount: Array.isArray(raw?.yesnoTypeErrors)
        ? raw.yesnoTypeErrors.length
        : 0,
      ynMissingKeyCount: Array.isArray(raw?.ynMissingKeys)
        ? raw.ynMissingKeys.length
        : 0,
      ynTrueCount:
        typeof raw?.ynTrueCount === "number"
          ? raw.ynTrueCount
          : sanitizedLLMRawTags.length,
      ynInputShape: raw?.ynInputShape,
      ynOmittedKeyCountApprox: raw?.ynOmittedKeyCountApprox,
    });
  }

  let guardTags = Array.isArray(raw?.tags) ? [...raw.tags] : [];
  const narrativeForcedFalse: FactTag[] = [];
  if (mode === "yesno") {
    guardTags = guardTags.filter((tag) => {
      const factTag = tag as FactTag;
      if (factTag === "narrative_driven_progression" && narrativeCorpusOverride) {
        return true;
      }
      if (!NARRATIVE_GUARD_TAGS.has(factTag)) return true;
      if (isNarrativeAllowedByCorpus(corpus, factTag, raw?.yesnoFacts))
        return true;
      narrativeForcedFalse.push(factTag);
      return false;
    });
  }

  const conflictNormalizationBeforeCount = guardTags.length;
  const conflictResult = normalizeConflicts(guardTags, corpus);
  const conflictRejected = conflictResult.conflictRejected;
  if (conflictRejected.length > 0) {
    console.log("[generate-facts] conflict filtered", {
      conflictRejected,
      beforeCount: conflictNormalizationBeforeCount,
      afterCount: conflictResult.tags.length,
    });
  }
  guardTags = conflictResult.tags;

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
    rejectedNeverPersist: guarded.rejectedNeverPersist,
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
      rejectedNeverPersist: guarded.rejectedNeverPersist,
      catalogMisses: guarded.rejectedNotInCatalog,
      acceptedTags: guarded.tags,
      rejectedNoEvidenceRequired: guarded.rejectedNoEvidenceRequired,
      keptWithoutEvidence: guarded.keptWithoutEvidence,
      conflictRejected,
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
      ynRawPreview: mode === "yesno" ? sanitizedLLMRawTags : undefined,
      narrativeForcedFalse,
      steamCorpusFieldsUsed,
      steamCorpusCharCounts,
      steamCorpusTotalChars,
      steamCorpusPreview,
      narrativeTriggerHitCount,
      narrativeTriggerHits: debug ? narrativeTriggerHits : undefined,
      narrativeStrongHitCount,
      narrativeWeakHitCount,
      narrativeStrongHitsPreview: narrativeStrongHits,
      narrativeWeakHitsPreview: narrativeWeakHits,
      narrativeDecision,
      narrativeDecisionHasRpgSignal,
      ynInputShape:
        mode === "yesno" && typeof raw?.ynInputShape === "string"
          ? raw.ynInputShape
          : undefined,
      ynOmittedKeyCountApprox:
        mode === "yesno" ? raw?.ynOmittedKeyCountApprox : undefined,
      ynRaw: mode === "yesno" && debug ? raw?.ynRaw : undefined,
      ynMissingKeys:
        mode === "yesno" && Array.isArray(raw?.ynMissingKeys)
          ? raw.ynMissingKeys
          : undefined,
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
        conflictRejected,
        steamCorpusFieldsUsed,
        steamCorpusCharCounts,
        steamCorpusTotalChars,
        steamCorpusPreview,
        narrativeTriggerHitCount,
        narrativeTriggerHits,
        narrativeStrongHitCount,
        narrativeWeakHitCount,
        narrativeDecision,
        narrativeDecisionHasRpgSignal,
        ynMissingKeys:
          mode === "yesno" && Array.isArray(raw?.ynMissingKeys)
            ? raw?.ynMissingKeys
            : undefined,
        ynMissingKeyCount:
          mode === "yesno" && Array.isArray(raw?.ynMissingKeys)
            ? raw.ynMissingKeys.length
            : undefined,
        ynTrueCount: mode === "yesno" ? raw?.ynTrueCount : undefined,
        ynInputShape: mode === "yesno" ? raw?.ynInputShape : undefined,
        ynOmittedKeyCountApprox:
          mode === "yesno" ? raw?.ynOmittedKeyCountApprox : undefined,
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
                inputShape: raw?.ynInputShape,
                missingKeys: Array.isArray(raw?.ynMissingKeys)
                  ? raw.ynMissingKeys
                  : undefined,
                omittedKeyCountApprox: raw?.ynOmittedKeyCountApprox,
              }
            : undefined,
      },
    });
  }

  return json(200, { appId, saved: true, facts: guarded.tags });
});
