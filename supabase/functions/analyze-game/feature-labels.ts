import type { FeatureLabel } from "../_shared/feature-labels.ts";
import {
  FEATURE_LABEL_DISPLAY_NAMES,
  MECHANIC_FEATURE_LABELS,
  MOOD_FEATURE_LABELS,
} from "../_shared/feature-labels.ts";

export { FeatureLabel, FEATURE_LABEL_DISPLAY_NAMES, MECHANIC_FEATURE_LABELS, MOOD_FEATURE_LABELS };

const ALL_FEATURE_SLUGS = new Set<FeatureLabel>([
  ...MECHANIC_FEATURE_LABELS,
  ...MOOD_FEATURE_LABELS,
]);

const AI_TAG_TO_FEATURE_LABEL: Record<string, FeatureLabel> = {
  // Mechanics
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
  "procedural": "procedural_generation",
  "procedural generation": "procedural_generation",
  "random generation": "procedural_generation",
  roguelike: "roguelike_structure",
  roguelite: "roguelike_structure",
  "rogue-like": "roguelike_structure",
  "rogue lite": "roguelike_structure",
  action: "combat_focused",
  combat: "combat_focused",
  shooter: "combat_focused",
  "hack and slash": "combat_focused",
  "twin stick shooter": "combat_focused",
  difficult: "high_skill_action",
  "soulslike": "high_skill_action",
  "precision": "high_skill_action",
  platformer: "platforming",
  platforming: "platforming",
  puzzle: "puzzle_solving",
  logic: "puzzle_solving",
  "deckbuilder": "deckbuilding",
  "card game": "deckbuilding",
  tactic: "turn_based_tactics",
  tactics: "turn_based_tactics",
  "turn-based strategy": "turn_based_tactics",
  strategy: "turn_based_tactics",
  management: "resource_management",
  economy: "resource_management",
  tycoon: "resource_management",
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
  "vehicle": "vehicle_driving",
  racing: "vehicle_driving",
  driving: "vehicle_driving",
  "coop": "coop_core",
  "co-op": "coop_core",
  "multiplayer coop": "coop_core",
  "rhythm": "rhythm_action",
  "music game": "rhythm_action",
  "visual novel": "visual_novel",
  vn: "visual_novel",
  sports: "sports_gameplay",
  football: "sports_gameplay",
  soccer: "sports_gameplay",
  basketball: "sports_gameplay",

  // Mood
  cozy: "cozy",
  "cozy life": "cozy",
  relaxing: "relaxing",
  calm: "calm_exploration",
  tranquil: "calm_exploration",
  atmospheric: "atmospheric",
  tense: "tense",
  suspense: "tense",
  "high intensity": "high_intensity",
  "high-intensity": "high_intensity",
  horror: "horror_tinged",
  "horror tinged": "horror_tinged",
  isolation: "isolation",
  lonely: "isolation",
  emotional: "emotional_narrative",
  narrative: "emotional_narrative",
  meditative: "meditative",
  calming: "meditative",
  wholesome: "wholesome",
  heartwarming: "wholesome",
  chaotic: "chaotic_fastpaced",
  "fast paced": "chaotic_fastpaced",
  "fast-paced": "chaotic_fastpaced",
};

const PATTERN_BASED_LABELS: Array<[RegExp, FeatureLabel]> = [
  [/\bcraft\b/, "crafting"],
  [/\bsurvival\b/, "survival_loop"],
  [/\bexplor[ae]tion\b/, "exploration_core"],
[/\broguelik/, "roguelike_structure"],
  [/\bdeck\b/, "deckbuilding"],
  [/\btactics\b/, "turn_based_tactics"],
  [/\bmanagement\b/, "resource_management"],
  [/\bautomation\b/, "automation_systems"],
  [/\bcolony\b/, "colony_management"],
  [/\bfarm\b/, "farming_life_sim"],
  [/\brpg\b/, "rpg_progression"],
  [/\bstealth\b/, "stealth_gameplay"],
  [/\bvehicle\b/, "vehicle_driving"],
  [/\bcoop\b/, "coop_core"],
  [/\brhythm\b/, "rhythm_action"],
  [/\bvisual novel\b/, "visual_novel"],
  [/\bsports\b/, "sports_gameplay"],
  [/\bcozy\b/, "cozy"],
  [/\brelax\b/, "relaxing"],
  [/\bcalm\b/, "calm_exploration"],
  [/\batmosphere\b/, "atmospheric"],
  [/\btense\b/, "tense"],
  [/\bhigh intensity\b/, "high_intensity"],
  [/\bhorror\b/, "horror_tinged"],
  [/\bisolation\b/, "isolation"],
  [/\bemotion\b/, "emotional_narrative"],
  [/\bmeditat\b/, "meditative"],
  [/\bwholesome\b/, "wholesome"],
  [/\bchaotic\b/, "chaotic_fastpaced"],
];

function normalizeSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().toLowerCase();
}

function mapTagToLabel(tag: string): FeatureLabel | undefined {
  const key = tag.trim().toLowerCase();
  if (AI_TAG_TO_FEATURE_LABEL[key]) {
    return AI_TAG_TO_FEATURE_LABEL[key];
  }

  for (const [pattern, label] of PATTERN_BASED_LABELS) {
    if (pattern.test(key)) {
      return label;
    }
  }

  return undefined;
}

export function mapAiTagsToFeatureLabels(
  aiTags: string[],
  featureTagSlugs?: string[]
): FeatureLabel[] {
  const result = new Set<FeatureLabel>();

  if (Array.isArray(featureTagSlugs)) {
    for (const slug of featureTagSlugs) {
      const normalizedSlug = normalizeSlug(slug);
      if (!normalizedSlug) continue;
      if (!ALL_FEATURE_SLUGS.has(normalizedSlug as FeatureLabel)) continue;
      result.add(normalizedSlug as FeatureLabel);
    }
  }

  if (result.size >= 12) {
    return Array.from(result);
  }

  if (Array.isArray(aiTags) && aiTags.length > 0) {
    for (const raw of aiTags) {
      if (!raw) continue;
      const label = mapTagToLabel(raw);
      if (!label) continue;
      result.add(label);
      if (result.size >= 12) break;
    }
  }

  return Array.from(result).slice(0, 12);
}
