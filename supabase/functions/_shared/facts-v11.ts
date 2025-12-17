import type { ExperienceFocusId } from "../search-games/experience-focus.ts";
import { FOCUS_ID_ALIAS_MAP } from "./focus-ids.ts";
import type { Vibe } from "./feature-labels.ts";

export type MatchBand = "on" | "near" | "discovery" | "off";

export const PERSISTED_FACT_TAGS = [
  "real_time_control",
  "high_input_pressure",
  "high_stakes_failure",
  "time_pressure",
  "enemy_density_high",
  "precision_timing_required",
  "stealth_core",
  "line_of_sight_matters",
  "position_advantage_design",
  "route_selection_matters",
  "free_movement_exploration",
  "map_reveal_progression",
  "non_hostile_environment",
  "planning_required",
  "resource_management",
  "automation_core",
  "optimization_required",
  "narrative_driven_progression",
  "story-journey-and-growth",
  "reading_heavy_interaction",
  "branching_narrative",
  "choice_has_consequence",
  "lore_optional_depth",
  "low_pressure_play",
  "session_based_play",
  "pause_friendly",
  "creative_manipulation",
  "open_ended_goal",
  "logical_puzzle_core",
  "job_simulation_loop",
  "low_precision_input",
  "power_scaling_over_time",
  "battle_loop_core",
] as const;

export const DERIVED_FACT_TAGS = ["systems_interaction_depth"] as const;
export const NEVER_PERSIST_FACT_TAGS = ["systems_interaction_depth"] as const;

export const FACT_TAGS = PERSISTED_FACT_TAGS;

export type PersistedFactTag = (typeof PERSISTED_FACT_TAGS)[number];
export type DerivedFactTag = (typeof DERIVED_FACT_TAGS)[number];
export type NeverPersistFactTag = (typeof NEVER_PERSIST_FACT_TAGS)[number];
export type FactTag = PersistedFactTag | DerivedFactTag;

const PERSISTED_FACT_TAG_SET = new Set<string>(PERSISTED_FACT_TAGS);
const DERIVED_FACT_TAG_SET = new Set<string>(DERIVED_FACT_TAGS);
const NEVER_PERSIST_FACT_TAG_SET = new Set<string>(NEVER_PERSIST_FACT_TAGS);
const ALL_FACT_TAG_SET = new Set<string>([
  ...PERSISTED_FACT_TAGS,
  ...DERIVED_FACT_TAGS,
]);

export function isFactTag(x: string): x is FactTag {
  return ALL_FACT_TAG_SET.has(x);
}

export function isPersistedFactTag(x: string): x is PersistedFactTag {
  return PERSISTED_FACT_TAG_SET.has(x);
}

export function isDerivedFactTag(x: string): x is DerivedFactTag {
  return DERIVED_FACT_TAG_SET.has(x);
}

export function isNeverPersistFactTag(x: string): x is NeverPersistFactTag {
  return NEVER_PERSIST_FACT_TAG_SET.has(x);
}

export interface FocusRule {
  id: ExperienceFocusId;
  vibe: Vibe;
  must: FactTag[];
  mustAny?: FactTag[];
  boost: FactTag[];
  ban: FactTag[];
}

export function computeBand(
  facts: FactTag[] | Set<FactTag>,
  rule: FocusRule
): {
  band: MatchBand;
  matchedMust: FactTag[];
  matchedBoost: FactTag[];
  matchedBan: FactTag[];
  missingMust: FactTag[];
} {
  const factSet = facts instanceof Set ? facts : new Set(facts);

  const matchedMust = rule.must.filter((tag) => factSet.has(tag));
  const mustAny = rule.mustAny ?? [];
  const matchedMustAny = mustAny.filter((tag) => factSet.has(tag));
  const matchedBoost = rule.boost.filter((tag) => factSet.has(tag));
  const matchedBan = rule.ban.filter((tag) => factSet.has(tag));
  const missingMust = rule.must.filter((tag) => !factSet.has(tag));

  const mustNeed = rule.must.length;
  const mustHits = matchedMust.length;
  const boostHits = matchedBoost.length;
  const banHits = matchedBan.length;
  const mustOk = mustNeed === mustHits;
  const mustAnyNeed = mustAny.length;
  const mustAnyOk = mustAnyNeed === 0 || matchedMustAny.length > 0;

  if (!mustOk || !mustAnyOk) {
    if (boostHits > 0) {
      return {
        band: "discovery",
        matchedMust,
        matchedBoost,
        matchedBan,
        missingMust,
      };
    }
    return {
      band: "off",
      matchedMust,
      matchedBoost,
      matchedBan,
      missingMust,
    };
  }

  if (banHits > 0) {
    return {
      band: "near",
      matchedMust,
      matchedBoost,
      matchedBan,
      missingMust,
    };
  }

  if (boostHits > 0) {
    return {
      band: "on",
      matchedMust,
      matchedBoost,
      matchedBan,
      missingMust,
    };
  }

  return {
    band: "near",
    matchedMust,
    matchedBoost,
    matchedBan,
    missingMust,
  };
}



const BASE_RULES: Record<ExperienceFocusId, FocusRule> = {
  "chill-cozy-living": {
    id: "chill-cozy-living",
    vibe: "chill",
    must: ["low_pressure_play", "non_hostile_environment"],
    boost: ["session_based_play", "pause_friendly", "open_ended_goal"],
    ban: ["high_input_pressure", "high_stakes_failure", "real_time_control"],
  },
  "chill-gentle-exploration": {
    id: "chill-gentle-exploration",
    vibe: "chill",
    must: ["free_movement_exploration"],
    boost: [
      "map_reveal_progression",
      "non_hostile_environment",
      "creative_manipulation",
    ],
    ban: ["high_input_pressure", "high_stakes_failure"],
  },
  "chill-ambient-immersion": {
    id: "chill-ambient-immersion",
    vibe: "chill",
    must: ["non_hostile_environment"],
    boost: [
      "map_reveal_progression",
      "narrative_driven_progression",
      "lore_optional_depth",
    ],
    ban: ["high_input_pressure", "real_time_control"],
  },
  "chill-relaxed-puzzle": {
    id: "chill-relaxed-puzzle",
    vibe: "chill",
    must: ["logical_puzzle_core"],
    boost: ["low_pressure_play", "pause_friendly", "session_based_play"],
    ban: ["real_time_control", "high_input_pressure"],
  },
  "chill-slow-creation": {
    id: "chill-slow-creation",
    vibe: "chill",
    must: ["creative_manipulation"],
    boost: ["resource_management", "automation_core", "open_ended_goal"],
    ban: ["high_input_pressure", "real_time_control"],
  },
  "story-driven-play": {
    id: "story-driven-play",
    vibe: "story",
    must: ["narrative_driven_progression"],
    boost: [
      "real_time_control",
      "high_input_pressure",
      "stealth_core",
      "high_stakes_failure",
      "battle_loop_core",
    ],
    ban: ["reading_heavy_interaction"],
  },
  "story-journey-and-growth": {
    id: "story-journey-and-growth",
    vibe: "story",
    must: ["narrative_driven_progression", "battle_loop_core"],
    boost: [
      "power_scaling_over_time",
      "free_movement_exploration",
      "map_reveal_progression",
      "resource_management",
      "planning_required",
    ],
    ban: [
      "automation_core",
      "systems_interaction_depth",
      "optimization_required",
      "time_pressure",
    ],
  },
  "story-reading-centered-story": {
    id: "story-reading-centered-story",
    vibe: "story",
    must: [],
    mustAny: [
      "reading_heavy_interaction",
      "choice_has_consequence",
      "branching_narrative",
    ],
    boost: ["narrative_driven_progression", "lore_optional_depth"],
    ban: [
      "battle_loop_core",
      "high_input_pressure",
      "precision_timing_required",
      "time_pressure",
    ],
  },
  "story-mystery-investigation": {
    id: "story-mystery-investigation",
    vibe: "story",
    must: ["narrative_driven_progression", "planning_required"],
    boost: [
      "logical_puzzle_core",
      "map_reveal_progression",
      "choice_has_consequence",
    ],
    ban: ["high_input_pressure"],
  },
  "story-choice-and-consequence": {
    id: "story-choice-and-consequence",
    vibe: "story",
    must: ["narrative_driven_progression", "choice_has_consequence"],
    boost: [
      "branching_narrative",
      "lore_optional_depth",
      "reading_heavy_interaction",
    ],
    ban: ["high_input_pressure"],
  },
  "story-lore-worldbuilding": {
    id: "story-lore-worldbuilding",
    vibe: "story",
    must: ["lore_optional_depth"],
    boost: [
      "narrative_driven_progression",
      "map_reveal_progression",
      "non_hostile_environment",
    ],
    ban: ["high_input_pressure"],
  },

  "focus-battle-and-growth": {
    id: "focus-battle-and-growth",
    vibe: "focus",
    must: ["battle_loop_core", "power_scaling_over_time"],
    boost: ["planning_required", "resource_management"],
    ban: [
      "automation_core",
      "systems_interaction_depth",
      "optimization_required",
    ],
  },

  "focus-tactics-and-planning": {
    id: "focus-tactics-and-planning",
    vibe: "focus",
    must: ["planning_required"],
    boost: [
      "systems_interaction_depth",
      "logical_puzzle_core",
      "precision_timing_required",
    ],
    ban: ["low_pressure_play"],
  },
  "focus-base-and-systems": {
    id: "focus-base-and-systems",
    vibe: "focus",
    must: ["systems_interaction_depth"],
    boost: ["resource_management", "planning_required", "automation_core"],
    ban: ["high_input_pressure"],
  },
  "focus-operational-sim": {
    id: "focus-operational-sim",
    vibe: "focus",
    must: ["job_simulation_loop"],
    boost: [
      "systems_interaction_depth",
      "planning_required",
      "automation_core",
      "resource_management",
    ],
    ban: ["high_input_pressure"],
  },

  "focus-optimization-builder": {
    id: "focus-optimization-builder",
    vibe: "focus",
    must: ["automation_core"],
    boost: [
      "optimization_required",
      "systems_interaction_depth",
      "resource_management",
      "planning_required",
    ],
    ban: ["narrative_driven_progression"],
  },
  "action-exploration": {
    id: "action-exploration",
    vibe: "action",
    must: ["free_movement_exploration"],
    boost: [
      "map_reveal_progression",
      "non_hostile_environment",
      "route_selection_matters",
    ],
    ban: ["high_input_pressure", "time_pressure"],
  },
  "action-combat": {
    id: "action-combat",
    vibe: "action",
    must: ["real_time_control"],
    boost: [
      "high_input_pressure",
      "enemy_density_high",
      "precision_timing_required",
    ],
    ban: ["stealth_core", "time_pressure"],
  },
  "action-pressure": {
    id: "action-pressure",
    vibe: "action",
    must: ["high_stakes_failure"],
    boost: [
      "high_input_pressure",
      "time_pressure",
      "precision_timing_required",
    ],
    ban: ["low_pressure_play", "pause_friendly"],
  },
  "action-positioning": {
    id: "action-positioning",
    vibe: "action",
    must: ["position_advantage_design"],
    boost: [
      "stealth_core",
      "line_of_sight_matters",
      "planning_required",
      "route_selection_matters",
    ],
    ban: ["enemy_density_high", "time_pressure"],
  },
  "action-crowd-smash": {
    id: "action-crowd-smash",
    vibe: "action",
    must: ["enemy_density_high"],
    boost: [
      "low_precision_input",
      "real_time_control",
      "power_scaling_over_time",
    ],
    ban: ["stealth_core", "planning_required"],
  },
  "short-arcade-action": {
    id: "short-arcade-action",
    vibe: "short",
    must: ["real_time_control"],
    boost: ["precision_timing_required", "time_pressure"],
    ban: ["low_pressure_play"],
  },
  "short-tactical-decisions": {
    id: "short-tactical-decisions",
    vibe: "short",
    must: ["planning_required"],
    boost: ["precision_timing_required", "real_time_control"],
    ban: ["non_hostile_environment"],
  },
  "short-puzzle-moments": {
    id: "short-puzzle-moments",
    vibe: "short",
    must: ["logical_puzzle_core"],
    boost: ["precision_timing_required", "creative_manipulation"],
    ban: ["high_input_pressure"],
  },
  "short-flow-mastery": {
    id: "short-flow-mastery",
    vibe: "short",
    must: ["time_pressure"],
    boost: ["precision_timing_required", "real_time_control"],
    ban: ["low_pressure_play"],
  },
  "short-competitive-rounds": {
    id: "short-competitive-rounds",
    vibe: "short",
    must: ["high_stakes_failure"],
    boost: [
      "real_time_control",
      "precision_timing_required",
      "enemy_density_high",
    ],
    ban: ["low_pressure_play"],
  },
};

export const FACT_FOCUS_RULES = BASE_RULES;

export { FOCUS_ID_ALIAS_MAP };
