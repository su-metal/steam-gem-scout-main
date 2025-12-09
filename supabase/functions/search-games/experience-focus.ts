import type { Vibe, FeatureLabel } from "../_shared/feature-labels.ts";

export type ExperienceFocusId =
  // Chill
  | "chill-cozy-life-crafting"
  | "chill-gentle-exploration"
  | "chill-light-puzzle"
  | "chill-relaxed-building"
  | "chill-ambient-experience"
  | "chill-any"
  // Story
  | "story-story-driven"
  | "story-character-drama"
  | "story-mystery-investigation"
  | "story-emotional-journey"
  | "story-lore-worldbuilding"
  | "story-any"
  // Focus
  | "focus-turn-based-tactics"
  | "focus-deckbuilding-strategy"
  | "focus-grand-strategy"
  | "focus-automation-factory-strategy"
  | "focus-colony-management"
  | "focus-any"
  // Speed
  | "speed-action-combat"
  | "speed-precision-shooter"
  | "speed-rhythm-music-action"
  | "speed-sports-arena"
  | "speed-high-intensity-roguelike"
  | "speed-any"
  // Short
  | "short-run-based-roguelike"
  | "short-arcade-action"
  | "short-arcade-shooter"
  | "short-short-puzzle"
  | "short-micro-progression"
  | "short-any";

export interface ExperienceFocus {
  id: ExperienceFocusId;
  vibe: Vibe;
  /** UIに出す名前（ボタンのラベル） */
  label: string;
  /** このFocusで“強く見たい”FeatureLabel群 */
  featureLabels: FeatureLabel[];
}

export const EXPERIENCE_FOCUS_LIST: ExperienceFocus[] = [
  // 🌿 Chill
  {
    id: "chill-cozy-life-crafting",
    vibe: "chill",
    label: "Cozy Life & Crafting",
    featureLabels: ["crafting", "farming_life_sim", "cozy", "wholesome"],
  },
  {
    id: "chill-gentle-exploration",
    vibe: "chill",
    label: "Gentle Exploration",
    featureLabels: ["exploration_core", "calm_exploration", "relaxing"],
  },
  {
    id: "chill-light-puzzle",
    vibe: "chill",
    label: "Light Puzzle",
    featureLabels: ["puzzle_solving", "relaxing", "meditative"],
  },
  {
    id: "chill-relaxed-building",
    vibe: "chill",
    label: "Relaxed Building",
    featureLabels: ["base_building", "relaxing", "cozy"],
  },
  {
    id: "chill-ambient-experience",
    vibe: "chill",
    label: "Ambient Experience",
    featureLabels: ["atmospheric", "meditative"],
  },
  {
    id: "chill-any",
    vibe: "chill",
    label: "Any",
    featureLabels: [
      "crafting",
      "farming_life_sim",
      "cozy",
      "wholesome",
      "exploration_core",
      "calm_exploration",
      "relaxing",
      "puzzle_solving",
      "meditative",
      "base_building",
      "atmospheric",
    ],
  },

  // 📖 Story
  {
    id: "story-story-driven",
    vibe: "story",
    label: "Story-Driven",
    featureLabels: ["emotional_narrative", "rpg_progression"],
  },
  {
    id: "story-character-drama",
    vibe: "story",
    label: "Character Drama",
    featureLabels: ["emotional_narrative", "wholesome"],
  },
  {
    id: "story-mystery-investigation",
    vibe: "story",
    label: "Mystery & Investigation",
    featureLabels: ["puzzle_solving", "emotional_narrative", "tense"],
  },
  {
    id: "story-emotional-journey",
    vibe: "story",
    label: "Emotional Journey",
    featureLabels: ["emotional_narrative", "atmospheric"],
  },
  {
    id: "story-lore-worldbuilding",
    vibe: "story",
    label: "Lore / Worldbuilding",
    featureLabels: ["atmospheric", "exploration_core"],
  },
  {
    id: "story-any",
    vibe: "story",
    label: "Any",
    featureLabels: [
      "emotional_narrative",
      "rpg_progression",
      "wholesome",
      "puzzle_solving",
      "tense",
      "atmospheric",
      "exploration_core",
    ],
  },

  // 🧠 Focus（Tactical）
  {
    id: "focus-turn-based-tactics",
    vibe: "focus",
    label: "Turn-Based Tactics",
    featureLabels: ["turn_based_tactics", "rpg_progression", "resource_management"],
  },
  {
    id: "focus-deckbuilding-strategy",
    vibe: "focus",
    label: "Deckbuilding Strategy",
    featureLabels: ["deckbuilding", "roguelike_structure"],
  },
  {
    id: "focus-grand-strategy",
    vibe: "focus",
    label: "Grand Strategy",
    featureLabels: ["resource_management", "colony_management"],
  },
  {
    id: "focus-automation-factory-strategy",
    vibe: "focus",
    label: "Automation / Factory Strategy",
    featureLabels: ["automation_systems", "resource_management"],
  },
  {
    id: "focus-colony-management",
    vibe: "focus",
    label: "Colony Management",
    featureLabels: ["colony_management", "resource_management"],
  },
  {
    id: "focus-any",
    vibe: "focus",
    label: "Any",
    featureLabels: [
      "turn_based_tactics",
      "rpg_progression",
      "resource_management",
      "deckbuilding",
      "roguelike_structure",
      "colony_management",
      "automation_systems",
    ],
  },

  // ⚡ Speed（Adrenaline）
  {
    id: "speed-action-combat",
    vibe: "speed",
    label: "Action Combat",
    featureLabels: ["combat_focused", "high_intensity", "high_skill_action"],
  },
  {
    id: "speed-precision-shooter",
    vibe: "speed",
    label: "Precision Shooter",
    featureLabels: ["combat_focused", "high_skill_action", "high_intensity"],
  },
  {
    id: "speed-rhythm-music-action",
    vibe: "speed",
    label: "Rhythm / Music Action",
    featureLabels: ["rhythm_action", "high_intensity"],
  },
  {
    id: "speed-sports-arena",
    vibe: "speed",
    label: "Sports & Arena",
    featureLabels: ["sports_gameplay", "high_intensity", "coop_core"],
  },
  {
    id: "speed-high-intensity-roguelike",
    vibe: "speed",
    label: "High-Intensity Roguelike",
    featureLabels: ["roguelike_structure", "procedural_generation", "high_intensity"],
  },
  {
    id: "speed-any",
    vibe: "speed",
    label: "Any",
    featureLabels: [
      "combat_focused",
      "high_intensity",
      "high_skill_action",
      "rhythm_action",
      "sports_gameplay",
      "coop_core",
      "roguelike_structure",
      "procedural_generation",
    ],
  },

  // ⏱ Short（Quick Run）
  {
    id: "short-run-based-roguelike",
    vibe: "short",
    label: "Run-Based Roguelike",
    featureLabels: ["roguelike_structure", "procedural_generation"],
  },
  {
    id: "short-arcade-action",
    vibe: "short",
    label: "Arcade Action",
    featureLabels: ["combat_focused", "high_intensity"],
  },
  {
    id: "short-arcade-shooter",
    vibe: "short",
    label: "Arcade Shooter",
    featureLabels: ["combat_focused", "high_intensity"],
  },
  {
    id: "short-short-puzzle",
    vibe: "short",
    label: "Short Puzzle",
    featureLabels: ["puzzle_solving"],
  },
  {
    id: "short-micro-progression",
    vibe: "short",
    label: "Micro Progression",
    featureLabels: ["rpg_progression", "roguelike_structure"],
  },
  {
    id: "short-any",
    vibe: "short",
    label: "Any",
    featureLabels: [
      "roguelike_structure",
      "procedural_generation",
      "combat_focused",
      "high_intensity",
      "puzzle_solving",
      "rpg_progression",
    ],
  },
];

export const EXPERIENCE_FOCUS_BY_VIBE: Record<Vibe, ExperienceFocus[]> = {
  chill: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "chill"),
  story: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "story"),
  focus: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "focus"),
  speed: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "speed"),
  short: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "short"),
};
