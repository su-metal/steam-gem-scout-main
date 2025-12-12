import type { FeatureLabelV2, Vibe } from "../_shared/feature-labels.ts";

export type ExperienceFocusId =
  | "chill-cozy-living"
  | "chill-gentle-exploration"
  | "chill-ambient-immersion"
  | "chill-relaxed-puzzle"
  | "chill-slow-creation"
  | "story-narrative-action"
  | "story-reading-centered-story"
  | "story-mystery-investigation"
  | "story-choice-and-consequence"
  | "story-lore-worldbuilding"
  | "focus-battle-and-growth"
  | "focus-tactics-and-planning"
  | "focus-base-and-systems"
  | "focus-simulation"
  | "focus-optimization-builder"
  | "action-exploration"
  | "action-combat"
  | "action-competitive"
  | "action-tactical-stealth"
  | "action-crowd-smash"
  | "short-arcade-action"
  | "short-tactical-decisions"
  | "short-puzzle-moments"
  | "short-flow-mastery"
  | "short-competitive-rounds";

export interface ExperienceFocus {
  id: ExperienceFocusId;
  vibe: Vibe;
  /** UIに出す名前（ボタンのラベル） */
  label: string;
  /** このFocusで“強く見たい”FeatureLabel群 */
  featureLabels: FeatureLabelV2[];
}

export const EXPERIENCE_FOCUS_LIST: ExperienceFocus[] = [
  {
    id: "chill-cozy-living",
    vibe: "chill",
    label: "Cozy Living",
    featureLabels: [
      "cozy_experience",
      "cozy_tone",
      "environment_customization",
      "shared_activity_feel",
    ],
  },
  {
    id: "chill-gentle-exploration",
    vibe: "chill",
    label: "Gentle Exploration",
    featureLabels: [
      "gentle_exploration",
      "exploration_core",
      "relaxing_flow",
      "ambient_mood",
    ],
  },
  {
    id: "chill-ambient-immersion",
    vibe: "chill",
    label: "Ambient Immersion",
    featureLabels: [
      "ambient_mood",
      "atmospheric_world",
      "whimsical_vibe",
      "cozy_tone",
    ],
  },
  {
    id: "chill-relaxed-puzzle",
    vibe: "chill",
    label: "Relaxed Puzzle",
    featureLabels: ["light_puzzleplay", "quick_puzzle", "relaxing_flow"],
  },
  {
    id: "chill-slow-creation",
    vibe: "chill",
    label: "Slow Creation",
    featureLabels: [
      "routine_loop_play",
      "construction_building",
      "sandbox_creation",
    ],
  },
  {
    id: "story-narrative-action",
    vibe: "story",
    label: "Narrative Action",
    featureLabels: ["story_driven", "action_combat", "dialogue_heavy"],
  },
  {
    id: "story-reading-centered-story",
    vibe: "story",
    label: "Reading-Centered Story",
    featureLabels: ["dialogue_heavy", "character_drama", "emotional_journey"],
  },
  {
    id: "story-mystery-investigation",
    vibe: "story",
    label: "Mystery / Investigation",
    featureLabels: [
      "mystery_investigation",
      "worldbuilding_depth",
      "sci_fi_atmosphere",
    ],
  },
  {
    id: "story-choice-and-consequence",
    vibe: "story",
    label: "Choice & Consequence",
    featureLabels: [
      "branching_narrative_structure",
      "choice_and_consequence",
      "dialogue_heavy",
    ],
  },
  {
    id: "story-lore-worldbuilding",
    vibe: "story",
    label: "Lore / Worldbuilding",
    featureLabels: [
      "worldbuilding_depth",
      "atmospheric_world",
      "fantasy_atmosphere",
    ],
  },
  {
    id: "focus-battle-and-growth",
    vibe: "focus",
    label: "Battle & Growth",
    featureLabels: [
      "character_progression",
      "skill_tree_systems",
      "high_intensity_challenge",
      "loot_and_rewards_loop",
    ],
  },
  {
    id: "focus-tactics-and-planning",
    vibe: "focus",
    label: "Tactics & Planning",
    featureLabels: [
      "turn_based_tactics",
      "tactical_turn_combat",
      "logistics_planning",
    ],
  },
  {
    id: "focus-base-and-systems",
    vibe: "focus",
    label: "Base & Systems",
    featureLabels: ["construction_building", "automation_processes", "resource_management"],
  },
  {
    id: "focus-simulation",
    vibe: "focus",
    label: "Simulation",
    featureLabels: ["automation_logic", "colony_management", "sandbox_creation"],
  },
  {
    id: "focus-optimization-builder",
    vibe: "focus",
    label: "Optimization / Builder",
    featureLabels: [
      "automation_logic",
      "resource_management",
      "construction_building",
    ],
  },
  {
    id: "action-exploration",
    vibe: "action",
    label: "Exploration",
    featureLabels: ["exploration_core", "gentle_exploration", "ambient_mood"],
  },
  {
    id: "action-combat",
    vibe: "action",
    label: "Combat",
    featureLabels: [
      "action_combat",
      "real_time_combat",
      "high_intensity_challenge",
    ],
  },
  {
    id: "action-competitive",
    vibe: "action",
    label: "Competitive",
    featureLabels: ["high_intensity_challenge", "precision_shooter", "rhythm_action"],
  },
  {
    id: "action-tactical-stealth",
    vibe: "action",
    label: "Tactical / Stealth",
    featureLabels: [
      "tactical_turn_combat",
      "stealth_mechanics",
      "precision_control_platforming",
    ],
  },
  {
    id: "action-crowd-smash",
    vibe: "action",
    label: "Crowd Smash",
    featureLabels: [
      "arcade_actionstyle",
      "high_intensity_challenge",
      "run_based_structure",
    ],
  },
  {
    id: "short-arcade-action",
    vibe: "short",
    label: "Arcade Action",
    featureLabels: ["arcade_actionstyle", "high_intensity_challenge"],
  },
  {
    id: "short-tactical-decisions",
    vibe: "short",
    label: "Tactical Decisions",
    featureLabels: ["tactical_turn_combat", "turn_based_tactics"],
  },
  {
    id: "short-puzzle-moments",
    vibe: "short",
    label: "Puzzle Moments",
    featureLabels: ["quick_puzzle", "light_puzzleplay", "relaxing_flow"],
  },
  {
    id: "short-flow-mastery",
    vibe: "short",
    label: "Flow Mastery",
    featureLabels: ["relaxing_flow", "gentle_exploration", "quick_puzzle"],
  },
  {
    id: "short-competitive-rounds",
    vibe: "short",
    label: "Competitive Rounds",
    featureLabels: [
      "arcade_actionstyle",
      "precision_shooter",
      "high_intensity_challenge",
    ],
  },
];

export const EXPERIENCE_FOCUS_BY_VIBE: Record<Vibe, ExperienceFocus[]> = {
  chill: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "chill"),
  story: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "story"),
  focus: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "focus"),
  action: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "action"),
  short: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "short"),
};
