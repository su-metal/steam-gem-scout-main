import type { FeatureLabel as BaseFeatureLabel } from "../_shared/feature-labels.ts";
import {
  FEATURE_LABEL_DISPLAY_NAMES,
  MECHANIC_FEATURE_LABELS,
  MOOD_FEATURE_LABELS,
} from "../_shared/feature-labels.ts";

const ADDITIONAL_STORY_SHORT_FEATURE_LABELS = [
  "story_driven",
  "character_drama",
  "mystery_investigation",
  "emotional_journey",
  "dialogue_heavy",
  "run_based_roguelike",
  "short_puzzle",
] as const;

type AdditionalStoryShortFeatureLabel =
  (typeof ADDITIONAL_STORY_SHORT_FEATURE_LABELS)[number];

export type FeatureLabel =
  | BaseFeatureLabel
  | AdditionalStoryShortFeatureLabel;

export { FEATURE_LABEL_DISPLAY_NAMES, MECHANIC_FEATURE_LABELS, MOOD_FEATURE_LABELS };

const GLOBAL_FEATURE_LABEL_MIN = 3;
const GLOBAL_FEATURE_LABEL_SOFT_MAX = 6;
const GLOBAL_FEATURE_LABEL_HARD_MAX = 12;

const STRONG_STORY_TAGS = [
  "visual novel",
  "story rich",
  "narrative",
  "interactive fiction",
  "choices matter",
  "multiple endings",
  "social deduction",
];

const WEAK_STORY_TAGS = ["mystery", "investigation", "detective", "psychological", "drama", "emotional"];

const STORY_PENALTY_TAGS = ["sports", "racing", "fighting", "simulation", "shooter"];

const DECK_TAGS = ["deckbuilding", "deck builder", "deck-card"];
const CARD_TAGS = ["card", "card battle", "card game", "tactics card"];
const ROGUE_TAGS = ["roguelike", "roguelite", "rogue lite", "run-based", "permadeath"];

const STORY_LABEL_PRIORITY: FeatureLabel[] = [
  "story_driven" as FeatureLabel,
  "character_drama" as FeatureLabel,
  "mystery_investigation" as FeatureLabel,
  "emotional_journey" as FeatureLabel,
  "dialogue_heavy" as FeatureLabel,
  "visual_novel" as FeatureLabel,
];

const STORY_HEAVY_FALLBACK_LABELS: FeatureLabel[] = [
  "story_driven" as FeatureLabel,
  "emotional_journey" as FeatureLabel,
];

const ALL_FEATURE_SLUGS = new Set<FeatureLabel>([
  ...MECHANIC_FEATURE_LABELS,
  ...MOOD_FEATURE_LABELS,
  ...ADDITIONAL_STORY_SHORT_FEATURE_LABELS,
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
  hasStorySignals: boolean;
  hasStrategySignals: boolean;
  hasActionSignals: boolean;
  hasPuzzleSignals: boolean;
  hasChillSignals: boolean;
  hasProductivitySignals: boolean;
  hasCustomizationSignals: boolean;
}

const SUMMARY_CONTEXT_KEYWORDS: Record<keyof SummaryContextFlags, string[]> = {
  hasStorySignals: ["ストーリー", "物語", "シナリオ", "キャラクター", "ドラマ", "visual novel", "story driven"],
  hasStrategySignals: ["戦略", "タクティクス", "tactics", "ターン制", "資源", "管理", "マネージャー", "resource", "strategy"],
  hasActionSignals: ["戦闘", "アクション", "反応", "シューティング", "コンボ", "攻撃", "high intensity", "skill", "fight"],
  hasPuzzleSignals: ["パズル", "謎解き", "ロジック", "パターン", "数独", "puzzle", "riddle"],
  hasChillSignals: ["癒やし", "癒し", "リラックス", "落ち着く", "ゆったり", "チル", "BGM", "ambient", "calm", "relax"],
  hasProductivitySignals: ["作業", "勉強", "集中", "時間管理", "タイマー", "ポモドーロ", "todo", "タスク", "フォーカス", "生産性", "進捗"],
  hasCustomizationSignals: ["アバター", "部屋", "インテリア", "カスタマイズ", "装飾", "家具", "衣装", "コーデ"],
};

const PRODUCTIVITY_ALLOWED_LABELS: FeatureLabel[] = [
  "cozy",
  "relaxing",
  "calm_exploration",
  "atmospheric",
  "meditative",
  "wholesome",
  "short_puzzle",
  "puzzle_solving",
];

const PRODUCTIVITY_BLOCKED_LABELS: FeatureLabel[] = [
  "crafting",
  "base_building",
  "survival_loop",
  "exploration_core",
  "procedural_generation",
  "roguelike_structure",
  "combat_focused",
  "high_skill_action",
  "platforming",
  "deckbuilding",
  "turn_based_tactics",
  "resource_management",
  "automation_systems",
  "colony_management",
  "farming_life_sim",
  "rpg_progression",
  "stealth_gameplay",
  "vehicle_driving",
  "coop_core",
  "rhythm_action",
  "visual_novel",
  "sports_gameplay",
  "story_driven" as FeatureLabel,
  "character_drama" as FeatureLabel,
  "mystery_investigation" as FeatureLabel,
  "emotional_journey" as FeatureLabel,
  "dialogue_heavy" as FeatureLabel,
  "run_based_roguelike" as FeatureLabel,
];

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
  const parts: string[] = [];
  if (input.summary) parts.push(input.summary);
  if (input.labels) parts.push(...input.labels);
  if (input.pros) parts.push(...input.pros);
  if (input.cons) parts.push(...input.cons);
  parts.push(...collectAudienceTextSegments(input.audiencePositive));
  parts.push(...collectAudienceTextSegments(input.audienceNeutral));
  parts.push(...collectAudienceTextSegments(input.audienceNegative));
  const combined = parts.join(" ").toLowerCase();

  const flags: SummaryContextFlags = {
    hasStorySignals: containsAnyKeyword(combined, SUMMARY_CONTEXT_KEYWORDS.hasStorySignals),
    hasStrategySignals: containsAnyKeyword(combined, SUMMARY_CONTEXT_KEYWORDS.hasStrategySignals),
    hasActionSignals: containsAnyKeyword(combined, SUMMARY_CONTEXT_KEYWORDS.hasActionSignals),
    hasPuzzleSignals: containsAnyKeyword(combined, SUMMARY_CONTEXT_KEYWORDS.hasPuzzleSignals),
    hasChillSignals: containsAnyKeyword(combined, SUMMARY_CONTEXT_KEYWORDS.hasChillSignals),
    hasProductivitySignals: containsAnyKeyword(
      combined,
      SUMMARY_CONTEXT_KEYWORDS.hasProductivitySignals
    ),
    hasCustomizationSignals: containsAnyKeyword(
      combined,
      SUMMARY_CONTEXT_KEYWORDS.hasCustomizationSignals
    ),
  };

  return flags;
}

function determineLabelPolicy(
  ctx: SummaryContextFlags
): LabelPolicy {
  const banned = new Set<FeatureLabel>();
  let allowed: Set<FeatureLabel> | null = null;

  const isProductivityToolish =
    (ctx.hasProductivitySignals || ctx.hasCustomizationSignals) &&
    !ctx.hasActionSignals &&
    !ctx.hasPuzzleSignals &&
    !ctx.hasStrategySignals &&
    !ctx.hasStorySignals;

  if (isProductivityToolish) {
    allowed = new Set(PRODUCTIVITY_ALLOWED_LABELS);
    for (const label of PRODUCTIVITY_BLOCKED_LABELS) {
      banned.add(label);
    }
  }

  return { allowed, banned };
}

function applyLabelPolicy(
  candidates: FeatureLabel[],
  policy: LabelPolicy
): FeatureLabel[] {
  const allowed = policy.allowed;
  const seen = new Set<FeatureLabel>();
  const result: FeatureLabel[] = [];

  for (const label of candidates) {
    if (policy.banned.has(label)) continue;
    if (allowed && !allowed.has(label)) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }

  return result;
}

const STORY_HEAVY_IGNORED_LABELS = new Set<FeatureLabel>([
  "deckbuilding" as FeatureLabel,
  "turn_based_tactics" as FeatureLabel,
  "resource_management" as FeatureLabel,
  "automation_systems" as FeatureLabel,
  "colony_management" as FeatureLabel,
  "roguelike_structure" as FeatureLabel,
]);

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
  tactic: "turn_based_tactics",
  tactics: "turn_based_tactics",
  strategy: "turn_based_tactics",
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
  visceral: "visual_novel",
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
};

const TEXT_HINTS: Array<{
  label: FeatureLabel;
  keywords: string[];
}> = [
  {
    label: "visual_novel",
    keywords: ["ビジュアルノベル", "visual novel", "ヴィジュアルノベル", "文字読み", "テキスト主導"],
  },
  {
    label: "story_driven",
    keywords: ["ストーリー", "物語", "物語主導", "story driven"],
  },
  {
    label: "character_drama",
    keywords: ["キャラクター", "人間関係", "ドラマ", "感情描写", "関係性"],
  },
  {
    label: "mystery_investigation",
    keywords: ["推理", "ミステリー", "謎解き", "調査", "真相"],
  },
  {
    label: "emotional_journey",
    keywords: ["感情", "泣ける", "エモーショナル", "心が揺さぶる", "涙"],
  },
  {
    label: "dialogue_heavy",
    keywords: ["会話", "掛け合い", "対話", "シナリオ"],
  },
  {
    label: "run_based_roguelike",
    keywords: ["周回", "ループ", "リプレイ", "ラン", "run based", "run-based", "リトライ"],
  },
  {
    label: "deckbuilding",
    keywords: ["デッキ構築", "カード構築", "カードデッキ", "カードゲーム", "deckbuilding"],
  },
  {
    label: "short_puzzle",
    keywords: ["短時間", "隙間時間", "スキマ時間", "短いセッション"],
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

function computeStoryScore(tags: string[]): number {
  let score = 0;
  for (const tag of tags) {
    if (STRONG_STORY_TAGS.some((keyword) => tag.includes(keyword))) {
      score += 2;
    }
    if (WEAK_STORY_TAGS.some((keyword) => tag.includes(keyword))) {
      score += 1;
    }
    if (STORY_PENALTY_TAGS.some((keyword) => tag.includes(keyword))) {
      score -= 1;
    }
  }
  return score;
}

function isStoryHeavyGame(aiTags: string[] | null | undefined): boolean {
  const tags = normalizeTagList(aiTags);
  const score = computeStoryScore(tags);
  return score >= 3;
}

function ensureStoryOrder(labels: FeatureLabel[], storyHeavy: boolean): FeatureLabel[] {
  if (!storyHeavy) return labels;

  const storySet = new Set(STORY_LABEL_PRIORITY);
  const storyLabels = labels.filter((label) => storySet.has(label));
  const others = labels.filter((label) => !storySet.has(label));

  if (storyLabels.length === 0) {
    return [...STORY_HEAVY_FALLBACK_LABELS, ...others];
  }

  return [...storyLabels, ...others];
}

function truncateToLimit(labels: FeatureLabel[], limit: number): FeatureLabel[] {
  if (labels.length <= limit) return labels;
  const storySet = new Set(STORY_LABEL_PRIORITY);
  const storyPart = labels.filter((label) => storySet.has(label));
  const rest = labels.filter((label) => !storySet.has(label));
  return [...storyPart, ...rest].slice(0, limit);
}

function fillFromFallback(
  labels: FeatureLabel[],
  candidates: FeatureLabel[],
  minCount: number
  ,
  banned?: Set<FeatureLabel>
): FeatureLabel[] {
  const next = [...labels];
  for (const candidate of candidates) {
    if (banned && banned.has(candidate)) continue;
    if (next.length >= minCount) break;
    if (!next.includes(candidate)) {
      next.push(candidate);
    }
  }
  return next;
}

function ensureMinimumLabels(
  labels: FeatureLabel[],
  aiTags: string[] | null | undefined,
  storyHeavy: boolean,
  banned?: Set<FeatureLabel>
): FeatureLabel[] {
  let next = [...labels];

  if (next.length < GLOBAL_FEATURE_LABEL_MIN) {
    if (storyHeavy) {
      next = fillFromFallback(
        next,
        STORY_HEAVY_FALLBACK_LABELS,
        GLOBAL_FEATURE_LABEL_MIN,
        banned
      );
    } else {
      next = fillFromFallback(
        next,
        STORY_HEAVY_FALLBACK_LABELS,
        GLOBAL_FEATURE_LABEL_MIN,
        banned
      );
    }
  }

  next = ensureStoryOrder(next, storyHeavy);

  next = truncateToLimit(next, GLOBAL_FEATURE_LABEL_SOFT_MAX);
  next = truncateToLimit(next, GLOBAL_FEATURE_LABEL_HARD_MAX);

  return next;
}

function addStoryLabels(result: Set<FeatureLabel>, tags: string[]): void {
  const hasVisualNovel = tags.some((t) => t.includes("visual novel"));
  const hasSocialDeduction = tags.some((t) => t.includes("social deduction"));
  const hasMystery = tags.some((t) => t.includes("mystery") || t.includes("investigation"));
  const hasEmotional = tags.some((t) => t.includes("emotional"));

  if (hasVisualNovel) {
    result.add("story_driven" as FeatureLabel);
    result.add("character_drama" as FeatureLabel);
    result.add("dialogue_heavy" as FeatureLabel);
  }

  if (hasSocialDeduction) {
    result.add("social_deduction_narrative" as FeatureLabel);
    result.add("mystery_investigation" as FeatureLabel);
  }

  if (hasMystery) {
    result.add("mystery_investigation" as FeatureLabel);
  }

  if (hasEmotional) {
    result.add("emotional_journey" as FeatureLabel);
  }

  if (![...result].some((label) => STORY_LABEL_PRIORITY.includes(label))) {
    result.add("story_driven" as FeatureLabel);
    result.add("emotional_journey" as FeatureLabel);
  }
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
  const storyHeavy = isStoryHeavyGame(normalizedAiTags);
  const result = new Set<FeatureLabel>();

  if (Array.isArray(featureTagSlugs)) {
    for (const slug of featureTagSlugs) {
      const normalizedSlug = typeof slug === "string" ? slug.trim().toLowerCase() : "";
      if (!normalizedSlug) continue;
      if (!ALL_FEATURE_SLUGS.has(normalizedSlug as FeatureLabel)) continue;
      result.add(normalizedSlug as FeatureLabel);
    }
  }

  if (storyHeavy) {
    addStoryLabels(result, normalizedAiTags);
  }

  if (normalizedAiTags.length > 0) {
    for (const raw of normalizedAiTags) {
      if (!raw) continue;
      if (storyHeavy && STORY_HEAVY_IGNORED_LABELS.has(raw as FeatureLabel)) {
        continue;
      }

      if (raw.includes("puzzle")) {
        result.add("light_puzzle" as FeatureLabel);
      }
      if (raw.includes("craft")) {
        result.add(storyHeavy ? ("cozy_life_crafting" as FeatureLabel) : "crafting");
      }
      if (raw.includes("explore")) {
        result.add("exploration_core");
      }
      if (raw.includes("cozy") || raw.includes("relax") || raw.includes("ambient")) {
        result.add("cozy" as FeatureLabel);
        result.add("ambient_experience" as FeatureLabel);
      }
      if (raw.includes("deckbuilding") && shouldAddDeckbuilding(normalizedAiTags)) {
        result.add("deckbuilding" as FeatureLabel);
      }
      if (raw.includes("rogue") && shouldAddRoguelike(normalizedAiTags)) {
        result.add("run_based_roguelike" as FeatureLabel);
      }
      const mapped = AI_TAG_TO_FEATURE_LABEL[raw];
      if (mapped) {
        result.add(mapped);
      }
    }
  }

  const labels = Array.from(result);
  return ensureMinimumLabels(labels, aiTags, storyHeavy);
}

export function buildFeatureLabelsFromAnalysis(
  analysisFeatureLabels: string[] | null | undefined,
  evidenceText: string[],
  aiTags: string[] | null | undefined,
  featureTagSlugs?: string[] | null | undefined,
  summaryContext: SummaryContextInput
): FeatureLabel[] {
  const normalizedFromAnalysis = normalizeAnalysisFeatureLabels(analysisFeatureLabels);
  const summaryCtx = buildSummaryContextFlags(summaryContext);

  const summaryPieces = [
    summaryContext.summary,
    ...(summaryContext.labels ?? []),
  ].filter((text): text is string => typeof text === "string" && text.trim());

  const summaryExisting = new Set<FeatureLabel>(normalizedFromAnalysis);
  const summaryDerived = deriveFeatureLabelsFromText(summaryPieces, summaryExisting);

  if (
    summaryCtx.hasStorySignals &&
    !summaryCtx.hasActionSignals &&
    !summaryCtx.hasStrategySignals &&
    !summaryCtx.hasPuzzleSignals
  ) {
    const storyPriority: FeatureLabel[] = [
      "story_driven",
      "character_drama",
      "emotional_journey",
      "mystery_investigation",
      "dialogue_heavy",
      "visual_novel",
    ];
    for (const label of storyPriority) {
      if (summaryExisting.has(label)) continue;
      summaryDerived.push(label);
      summaryExisting.add(label);
    }
  }

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
  const storyHeavy = isStoryHeavyGame(aiTags);

  return ensureMinimumLabels(filtered, aiTags, storyHeavy, policy.banned);
}
