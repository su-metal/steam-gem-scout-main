import type { FeatureLabel } from "../_shared/feature-labels.ts";
import {
  FEATURE_LABEL_DISPLAY_NAMES,
  MECHANIC_FEATURE_LABELS,
  MOOD_FEATURE_LABELS,
} from "../_shared/feature-labels.ts";

export { FeatureLabel, FEATURE_LABEL_DISPLAY_NAMES, MECHANIC_FEATURE_LABELS, MOOD_FEATURE_LABELS };

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
]);

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

function normalizeTagList(aiTags: string[] | null | undefined): string[] {
  if (!aiTags) return [];
  return aiTags
    .map((t) => (t ?? "").toString().toLowerCase().trim())
    .filter(Boolean);
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
): FeatureLabel[] {
  const next = [...labels];
  for (const candidate of candidates) {
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
  storyHeavy: boolean
): FeatureLabel[] {
  let next = [...labels];

  if (next.length < GLOBAL_FEATURE_LABEL_MIN) {
    if (storyHeavy) {
      next = fillFromFallback(next, STORY_HEAVY_FALLBACK_LABELS, GLOBAL_FEATURE_LABEL_MIN);
    } else {
      next = fillFromFallback(next, STORY_HEAVY_FALLBACK_LABELS, GLOBAL_FEATURE_LABEL_MIN);
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
