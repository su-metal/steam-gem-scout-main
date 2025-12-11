import type { FeatureLabel as BaseFeatureLabel } from "../_shared/feature-labels.ts";
import {
  FEATURE_LABEL_DISPLAY_NAMES,
  MECHANIC_FEATURE_LABELS,
  MOOD_FEATURE_LABELS,
} from "../_shared/feature-labels.ts";

export type FeatureLabel = BaseFeatureLabel;

export { FEATURE_LABEL_DISPLAY_NAMES, MECHANIC_FEATURE_LABELS, MOOD_FEATURE_LABELS };

const GLOBAL_FEATURE_LABEL_HARD_MAX = 12;

const DECK_TAGS = ["deckbuilding", "deck builder", "deck-card"];
const CARD_TAGS = ["card", "card battle", "card game", "tactics card"];
const ROGUE_TAGS = ["roguelike", "roguelite", "rogue lite", "run-based", "permadeath"];

const ALL_FEATURE_SLUGS = new Set<FeatureLabel>([
  ...MECHANIC_FEATURE_LABELS,
  ...MOOD_FEATURE_LABELS,
]);

interface AudienceSummarySegment {
  label?: string;
  description?: string;
  reason?: string;
  sub?: string;
}

export interface SummaryContextInput {
  summary?: string | null;
  labels?: string[] | null;
  pros?: string[] | null;
  cons?: string[] | null;
  audiencePositive?: AudienceSummarySegment[] | null;
  audienceNeutral?: AudienceSummarySegment[] | null;
  audienceNegative?: AudienceSummarySegment[] | null;
}

export interface SummaryContextFlags {
  // 補正ロジックを廃止したため、フラグは未使用のダミー
  hasStorySignals: boolean;
  hasStrategySignals: boolean;
  hasActionSignals: boolean;
  hasPuzzleSignals: boolean;
  hasChillSignals: boolean;
  hasProductivitySignals: boolean;
  hasCustomizationSignals: boolean;
}

const SUMMARY_CONTEXT_KEYWORDS: Record<keyof SummaryContextFlags, string[]> = {
  hasStorySignals: [],
  hasStrategySignals: [],
  hasActionSignals: [],
  hasPuzzleSignals: [],
  hasChillSignals: [],
  hasProductivitySignals: [],
  hasCustomizationSignals: [],
};

// Productivity 補正は廃止のため未使用ダミー
const PRODUCTIVITY_ALLOWED_LABELS: FeatureLabel[] = [];
const PRODUCTIVITY_BLOCKED_LABELS: FeatureLabel[] = [];

interface LabelPolicy {
  allowed: Set<FeatureLabel> | null;
  banned: Set<FeatureLabel>;
}

function containsAnyKeyword(text: string, keywords: string[]): boolean {
  for (const keyword of keywords) {
    if (keyword && text.includes(keyword)) {
      return true;
    }
  }
  return false;
}

function collectAudienceTextSegments(
  segments?: AudienceSummarySegment[] | null
): string[] {
  if (!Array.isArray(segments)) return [];
  const snippets: string[] = [];
  for (const seg of segments) {
    if (!seg) continue;
    if (seg.label) snippets.push(seg.label);
    if (seg.description) snippets.push(seg.description);
    if (seg.reason) snippets.push(seg.reason);
    if (seg.sub) snippets.push(seg.sub);
  }
  return snippets;
}

export function buildSummaryContextFlags(
  input: SummaryContextInput
): SummaryContextFlags {
  // 補正ロジックを廃止したため、ダミーのフラグを返す
  return {
    hasStorySignals: false,
    hasStrategySignals: false,
    hasActionSignals: false,
    hasPuzzleSignals: false,
    hasChillSignals: false,
    hasProductivitySignals: false,
    hasCustomizationSignals: false,
  };
}

function determineLabelPolicy(
  ctx: SummaryContextFlags
): LabelPolicy {
  // どんなコンテキストでも補正しない
  return {
    allowed: null,
    banned: new Set<FeatureLabel>(),
  };
}

function applyLabelPolicy(
  candidates: FeatureLabel[],
  policy: LabelPolicy
): FeatureLabel[] {
  const seen = new Set<FeatureLabel>();
  const result: FeatureLabel[] = [];

  for (const label of candidates) {
    if (seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }

  return result;
}

const AI_TAG_TO_FEATURE_LABEL: Record<string, FeatureLabel> = {
  crafting: "crafting",
  craft: "crafting",
  "crafting-game": "crafting",
  "item crafting": "crafting",
  "base building": "base_building",
  "base-building": "base_building",
  building: "base_building",
  construction: "base_building",
  survival: "survival_loop",
  "survival loop": "survival_loop",
  exploration: "exploration_core",
  "open world": "exploration_core",
  roguelike: "roguelike_structure",
  roguelite: "roguelike_structure",
  "rogue-like": "roguelike_structure",
  action: "combat_focused",
  combat: "combat_focused",
  shooter: "combat_focused",
  "hack and slash": "combat_focused",
  "high intensity": "high_intensity",
  "high-intensity": "high_intensity",
  platformer: "platforming",
  platforming: "platforming",
  puzzle: "puzzle_solving",
  logic: "puzzle_solving",
  "deckbuilder": "deckbuilding",
  "card game": "deckbuilding",
  management: "resource_management",
  economy: "resource_management",
  automation: "automation_systems",
  factory: "automation_systems",
  colony: "colony_management",
  "city builder": "colony_management",
  "farming": "farming_life_sim",
  "life sim": "farming_life_sim",
  rpg: "rpg_progression",
  jrpg: "rpg_progression",
  arpg: "rpg_progression",
  stealth: "stealth_gameplay",
  vehicle: "vehicle_driving",
  racing: "vehicle_driving",
  driving: "vehicle_driving",
  coop: "coop_core",
  "co-op": "coop_core",
  rhythm: "rhythm_action",
  "music game": "rhythm_action",
  "visual novel": "visual_novel",
  sports: "sports_gameplay",
  football: "sports_gameplay",
  soccer: "sports_gameplay",
  basketball: "sports_gameplay",
  cozy: "cozy",
  relaxing: "relaxing",
  calm: "calm_exploration",
  ambient: "atmospheric",
  emotional: "emotional_narrative",
  narrative: "emotional_narrative",
  meditative: "meditative",
  wholesome: "wholesome",
  chaos: "chaotic_fastpaced",
  psychological: "psychological_atmosphere",
  "psychological horror": "psychological_atmosphere",
  "branching choice": "branching_choice",
  branching: "branching_choice",
  choice: "branching_choice",
  microprogression: "micro_progression",
  "micro progression": "micro_progression",
};

const TEXT_HINTS: Array<{
  label: FeatureLabel;
  keywords: string[];
}> = [
  {
    label: "visual_novel",
    keywords: ["ビジュアルノベル", "visual novel", "ヴィジュアルノベル"],
  },
  {
    label: "deckbuilding",
    keywords: ["デッキ構築", "カード構築", "カードデッキ", "カードゲーム", "deckbuilding"],
  },
  {
    label: "emotional_journey",
    keywords: ["感情", "泣ける", "エモーショナル", "心が揺さぶる", "涙", "感情の旅"],
  },
  {
    label: "branching_choice",
    keywords: ["分岐", "選択肢", "マルチエンディング", "選択によって", "枝分かれ"],
  },
  {
    label: "psychological_atmosphere",
    keywords: ["心理", "精神的", "psychological", "サイコ", "雰囲気ホラー"],
  },
  {
    label: "micro_progression",
    keywords: ["小刻み", "ミクロな進行", "小さな成長", "micro progression", "少しずつ進む"],
  },
  {
    label: "cozy",
    keywords: ["まったり", "のんびり", "ゆったり", "癒やし"],
  },
  {
    label: "relaxing",
    keywords: ["リラックス", "relax", "relaxing"],
  },
  {
    label: "calm_exploration",
    keywords: ["静かな探索", "静かに歩く", "calm exploration", "穏やかな旅"],
  },
  {
    label: "atmospheric",
    keywords: ["雰囲気", "ambient", "atmospheric", "没入感", "世界観"],
  },
  {
    label: "wholesome",
    keywords: ["心温まる", "wholesome", "優しい", "ほっこり", "穏やか"],
  },
  {
    label: "meditative",
    keywords: ["瞑想", "meditative", "静謐", "落ち着く"],
  },
  {
    label: "puzzle_solving",
    keywords: ["パズル", "謎解き", "ロジック", "仕掛け", "puzzle"],
  },
];

const TEXT_DERIVATION_THRESHOLD = 2;
const TEXT_DERIVATION_LIMIT = 3;

function normalizeTagList(aiTags: string[] | null | undefined): string[] {
  if (!aiTags) return [];
  return aiTags
    .map((t) => (t ?? "").toString().toLowerCase().trim())
    .filter(Boolean);
}

function normalizeAnalysisFeatureLabels(
  raw?: string[] | null
): FeatureLabel[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const seen = new Set<string>();
  const result: FeatureLabel[] = [];

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!ALL_FEATURE_SLUGS.has(lower as FeatureLabel)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(lower as FeatureLabel);
  }

  return result;
}

function deriveFeatureLabelsFromText(
  textPieces: string[],
  existing: Set<FeatureLabel>,
  hints: Array<{ label: FeatureLabel; keywords: string[] }> = TEXT_HINTS
): FeatureLabel[] {
  if (!textPieces || !textPieces.length) return [];
  const combined = textPieces.filter(Boolean).join(" ").toLowerCase();
  if (!combined) return [];

  const derived: FeatureLabel[] = [];
  let added = 0;

  for (const hint of hints) {
    if (existing.has(hint.label)) continue;
    if (hint.keywords.some((keyword) => combined.includes(keyword))) {
      derived.push(hint.label);
      existing.add(hint.label);
      added += 1;
      if (added >= TEXT_DERIVATION_LIMIT) {
        break;
      }
    }
  }

  return derived;
}

function ensureMinimumLabels(
  labels: FeatureLabel[],
  _aiTags: string[] | null | undefined,
  _storyHeavy: boolean,
  _banned?: Set<FeatureLabel>
): FeatureLabel[] {
  // Story Heavy の補正は廃止。重複除去とハード上限のみ。
  const seen = new Set<FeatureLabel>();
  const result: FeatureLabel[] = [];

  for (const label of labels) {
    if (seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }

  if (result.length > GLOBAL_FEATURE_LABEL_HARD_MAX) {
    return result.slice(0, GLOBAL_FEATURE_LABEL_HARD_MAX);
  }

  return result;
}

function shouldAddDeckbuilding(tags: string[]): boolean {
  const hasDeck = tags.some((t) => DECK_TAGS.some((keyword) => t.includes(keyword)));
  const hasCard = tags.some((t) => CARD_TAGS.some((keyword) => t.includes(keyword)));
  return hasDeck && hasCard;
}

function shouldAddRoguelike(tags: string[]): boolean {
  return tags.some((t) => ROGUE_TAGS.some((keyword) => t.includes(keyword)));
}

export function mapAiTagsToFeatureLabels(
  aiTags: string[] | null | undefined,
  featureTagSlugs?: string[] | null | undefined
): FeatureLabel[] {
  const normalizedAiTags = normalizeTagList(aiTags);
  const result = new Set<FeatureLabel>();

  if (Array.isArray(featureTagSlugs)) {
    for (const slug of featureTagSlugs) {
      const normalizedSlug = typeof slug === "string" ? slug.trim().toLowerCase() : "";
      if (!normalizedSlug) continue;
      if (!ALL_FEATURE_SLUGS.has(normalizedSlug as FeatureLabel)) continue;
      result.add(normalizedSlug as FeatureLabel);
    }
  }

  if (normalizedAiTags.length > 0) {
    for (const raw of normalizedAiTags) {
      if (!raw) continue;

      const mapped = AI_TAG_TO_FEATURE_LABEL[raw];
      if (mapped) {
        result.add(mapped);
      }
    }
  }

  const labels = Array.from(result);
  return ensureMinimumLabels(labels, aiTags, false);
}

export function buildFeatureLabelsFromAnalysis(
  analysisFeatureLabels: string[] | null | undefined,
  evidenceText: string[],
  aiTags: string[] | null | undefined,
  summaryContext: SummaryContextInput,
  featureTagSlugs?: string[] | null | undefined
): FeatureLabel[] {
  const normalizedFromAnalysis = normalizeAnalysisFeatureLabels(analysisFeatureLabels);
  const summaryCtx = buildSummaryContextFlags(summaryContext);

  const summaryPieces = [
    summaryContext.summary,
    ...(summaryContext.labels ?? []),
  ].filter(
    (text): text is string =>
      typeof text === "string" && text.trim().length > 0
  );

  const summaryExisting = new Set<FeatureLabel>(normalizedFromAnalysis);
  const summaryDerived = deriveFeatureLabelsFromText(summaryPieces, summaryExisting);

  const reinforcementExisting = new Set<FeatureLabel>([
    ...normalizedFromAnalysis,
    ...summaryDerived,
  ]);
  const reinforcementDerived = deriveFeatureLabelsFromText(
    evidenceText,
    reinforcementExisting
  );

  const aiDerived = mapAiTagsToFeatureLabels(aiTags, featureTagSlugs);
  const policy = determineLabelPolicy(summaryCtx);
  const combinedCandidates = [
    ...normalizedFromAnalysis,
    ...summaryDerived,
    ...reinforcementDerived,
    ...aiDerived,
  ];

  const filtered = applyLabelPolicy(combinedCandidates, policy);

  const ensured = ensureMinimumLabels(filtered, aiTags, false);

  const rawAnalysisSet = new Set(
    (analysisFeatureLabels ?? [])
      .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
      .filter(Boolean)
  );

  const safeResult = ensured.filter((label) => {
    if (label !== "turn_based_tactics") return true;
    return rawAnalysisSet.has("turn_based_tactics");
  });

  return safeResult;
}
