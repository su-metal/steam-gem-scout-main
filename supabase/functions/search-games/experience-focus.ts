import type { FeatureLabelV2, Vibe } from "../_shared/feature-labels.ts";

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
  featureLabels: FeatureLabelV2[];
}

export const EXPERIENCE_FOCUS_LIST: ExperienceFocus[] = [
  // 🌿 Chill
  {
    id: "chill-cozy-life-crafting",
    vibe: "chill",
    label: "Cozy Life & Crafting",
    featureLabels: [
      "cozy_experience",
      "cozy_tone",
      "environment_customization",
      "routine_loop_play",
    ],
  },
  {
    id: "chill-gentle-exploration",
    vibe: "chill",
    label: "Gentle Exploration",
    featureLabels: [
      "gentle_exploration",
      "exploration_core",
      "ambient_mood",
      "atmospheric_world",
    ],
  },
  {
    id: "chill-light-puzzle",
    vibe: "chill",
    label: "Light Puzzle",
    featureLabels: ["light_puzzleplay", "quick_puzzle", "relaxing_flow"],
  },
  {
    id: "chill-relaxed-building",
    vibe: "chill",
    label: "Relaxed Building",
    featureLabels: [
      "construction_building",
      "environment_customization",
      "cozy_experience",
      "routine_loop_play",
    ],
  },
  {
    id: "chill-ambient-experience",
    vibe: "chill",
    label: "Ambient Experience",
    featureLabels: ["ambient_mood", "atmospheric_world", "cozy_tone", "whimsical_vibe"],
  },
  {
    id: "chill-any",
    vibe: "chill",
    label: "Any",
    featureLabels: [],
  },

  // 📖 Story
  {
    id: "story-story-driven",
    vibe: "story",
    label: "Story-Driven",
    featureLabels: ["story_driven", "dialogue_heavy", "worldbuilding_depth"],
  },
  {
    id: "story-character-drama",
    vibe: "story",
    label: "Character Drama",
    featureLabels: ["character_drama", "emotional_journey", "dialogue_heavy"],
  },
  {
    id: "story-mystery-investigation",
    vibe: "story",
    label: "Mystery & Investigation",
    featureLabels: ["mystery_investigation", "worldbuilding_depth", "atmospheric_world"],
  },
  {
    id: "story-emotional-journey",
    vibe: "story",
    label: "Emotional Journey",
    featureLabels: ["emotional_journey", "story_driven"],
  },
  {
    id: "story-lore-worldbuilding",
    vibe: "story",
    label: "Lore / Worldbuilding",
    featureLabels: [
      "worldbuilding_depth",
      "atmospheric_world",
      "sci_fi_atmosphere",
      "fantasy_atmosphere",
    ],
  },
  {
    id: "story-any",
    vibe: "story",
    label: "Any",
    featureLabels: [],
  },

  // 🧠 Focus（Tactical）
  {
    id: "focus-turn-based-tactics",
    vibe: "focus",
    label: "Turn-Based Tactics",
    featureLabels: ["turn_based_tactics", "tactical_turn_combat", "logistics_planning"],
  },
  {
    id: "focus-deckbuilding-strategy",
    vibe: "focus",
    label: "Deckbuilding Strategy",
    featureLabels: ["deckbuilding_strategy", "turn_based_tactics", "micro_progression"],
  },
  {
    id: "focus-grand-strategy",
    vibe: "focus",
    label: "Grand Strategy",
    featureLabels: [
      "grand_strategy",
      "logistics_planning",
      "resource_management",
      "colony_management",
    ],
  },
  {
    id: "focus-automation-factory-strategy",
    vibe: "focus",
    label: "Automation / Factory Strategy",
    featureLabels: ["automation_logic", "automation_processes", "resource_management"],
  },
  {
    id: "focus-colony-management",
    vibe: "focus",
    label: "Colony Management",
    featureLabels: [
      "colony_management",
      "colony_simulation",
      "resource_management",
      "logistics_planning",
      "survival_mechanics",
    ],
  },
  {
    id: "focus-any",
    vibe: "focus",
    label: "Any",
    featureLabels: [],
  },

  // ⚡ Speed（Adrenaline）
  {
    id: "speed-action-combat",
    vibe: "speed",
    label: "Action Combat",
    featureLabels: ["action_combat", "real_time_combat", "high_intensity_challenge"],
  },
  {
    id: "speed-precision-shooter",
    vibe: "speed",
    label: "Precision Shooter",
    featureLabels: ["precision_shooter", "high_intensity_challenge"],
  },
  {
    id: "speed-rhythm-music-action",
    vibe: "speed",
    label: "Rhythm / Music Action",
    featureLabels: ["rhythm_action", "high_intensity_challenge", "micro_progression"],
  },
  {
    id: "speed-sports-arena",
    vibe: "speed",
    label: "Sports & Arena",
    featureLabels: [
      "action_combat",
      "real_time_combat",
      "high_intensity_challenge",
      "arcade_actionstyle",
    ],
  },
  {
    id: "speed-high-intensity-roguelike",
    vibe: "speed",
    label: "High-Intensity Roguelike",
    featureLabels: [
      "roguelike_run_structure",
      "high_intensity_challenge",
      "run_based_structure",
      "survival_mechanics",
    ],
  },
  {
    id: "speed-any",
    vibe: "speed",
    label: "Any",
    featureLabels: [],
  },

  // ⏱ Short（Quick Run）
  {
    id: "short-run-based-roguelike",
    vibe: "short",
    label: "Run-Based Roguelike",
    featureLabels: [
      "run_based_structure",
      "roguelike_run_structure",
      "high_intensity_challenge",
    ],
  },
  {
    id: "short-arcade-action",
    vibe: "short",
    label: "Arcade Action",
    featureLabels: ["arcade_actionstyle", "high_intensity_challenge"],
  },
  {
    id: "short-arcade-shooter",
    vibe: "short",
    label: "Arcade Shooter",
    featureLabels: ["arcade_shooter", "precision_shooter", "arcade_actionstyle"],
  },
  {
    id: "short-short-puzzle",
    vibe: "short",
    label: "Short Puzzle",
    featureLabels: ["quick_puzzle", "light_puzzleplay", "relaxing_flow"],
  },
  {
    id: "short-micro-progression",
    vibe: "short",
    label: "Micro Progression",
    featureLabels: ["micro_progression", "routine_loop_play"],
  },
  {
    id: "short-any",
    vibe: "short",
    label: "Any",
    featureLabels: [],
  },
];

export const EXPERIENCE_FOCUS_BY_VIBE: Record<Vibe, ExperienceFocus[]> = {
  chill: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "chill"),
  story: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "story"),
  focus: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "focus"),
  speed: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "speed"),
  short: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "short"),
};
