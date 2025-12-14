import type { ExperienceFocusId } from "../search-games/experience-focus.ts";
import type { Vibe } from "./feature-labels.ts";

export type MatchBand = "on" | "near" | "discovery" | "off";

export const FACT_TAGS = [
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
  "systems_interaction_depth",
  "resource_management",
  "automation_core",
  "optimization_required",
  "narrative_driven_progression",
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
] as const;

export type FactTag = (typeof FACT_TAGS)[number];

const FACT_TAG_SET = new Set<string>(FACT_TAGS);

export interface FocusRule {
  id: ExperienceFocusId;
  vibe: Vibe;
  must: FactTag[];
  boost: FactTag[];
  ban: FactTag[];
}

export function isFactTag(x: string): x is FactTag {
  return FACT_TAG_SET.has(x);
}

export function computeBand(
  facts: FactTag[],
  rule: FocusRule
): {
  band: MatchBand;
  matchedMust: FactTag[];
  matchedBoost: FactTag[];
  matchedBan: FactTag[];
} {
  const factSet = new Set(facts);

  const matchedMust = rule.must.filter((tag) => factSet.has(tag));
  const matchedBoost = rule.boost.filter((tag) => factSet.has(tag));
  const matchedBan = rule.ban.filter((tag) => factSet.has(tag));

  if (matchedBan.length > 0) {
    return {
      band: "off",
      matchedMust,
      matchedBoost,
      matchedBan,
    };
  }

  const mustHits = matchedMust.length;
  const mustNeed = rule.must.length;
  const boostHits = matchedBoost.length;

  if (mustNeed > 0) {
    if (mustHits === mustNeed && boostHits >= 2) {
      return {
        band: "on",
        matchedMust,
        matchedBoost,
        matchedBan,
      };
    }
    if (mustHits === mustNeed && boostHits >= 1) {
      return {
        band: "near",
        matchedMust,
        matchedBoost,
        matchedBan,
      };
    }
    if (boostHits >= 2) {
      return {
        band: "discovery",
        matchedMust,
        matchedBoost,
        matchedBan,
      };
    }
    return {
      band: "off",
      matchedMust,
      matchedBoost,
      matchedBan,
    };
  }

  if (boostHits >= 3) {
    return {
      band: "on",
      matchedMust,
      matchedBoost,
      matchedBan,
    };
  }
  if (boostHits >= 2) {
    return {
      band: "near",
      matchedMust,
      matchedBoost,
      matchedBan,
    };
  }
  if (boostHits >= 1) {
    return {
      band: "discovery",
      matchedMust,
      matchedBoost,
      matchedBan,
    };
  }

  return {
    band: "off",
    matchedMust,
    matchedBoost,
    matchedBan,
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
  "story-narrative-action": {
    id: "story-narrative-action",
    vibe: "story",
    must: ["narrative_driven_progression"],
    boost: ["real_time_control", "high_input_pressure"],
    ban: ["reading_heavy_interaction"],
  },
  "story-reading-centered-story": {
    id: "story-reading-centered-story",
    vibe: "story",
    must: ["narrative_driven_progression", "reading_heavy_interaction"],
    boost: [
      "choice_has_consequence",
      "branching_narrative",
      "lore_optional_depth",
    ],
    ban: ["high_input_pressure"],
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
    must: ["planning_required", "resource_management"],
    boost: ["high_input_pressure", "high_stakes_failure", "automation_core"],
    ban: ["non_hostile_environment"],
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
    must: ["automation_core"],
    boost: [
      "resource_management",
      "systems_interaction_depth",
      "planning_required",
    ],
    ban: ["high_input_pressure"],
  },
  "focus-operational-sim": {
    id: "focus-operational-sim",
    vibe: "focus",
    must: ["resource_management"],
    boost: [
      "systems_interaction_depth",
      "planning_required",
      "automation_core",
    ],
    ban: ["high_input_pressure"],
  },

  "focus-optimization-builder": {
    id: "focus-optimization-builder",
    vibe: "focus",
    must: ["optimization_required"],
    boost: [
      "automation_core",
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
      "open_ended_goal",
    ],
    ban: ["high_input_pressure"],
  },
  "action-combat": {
    id: "action-combat",
    vibe: "action",
    must: ["real_time_control"],
    boost: [
      "high_input_pressure",
      "enemy_density_high",
      "high_stakes_failure",
      "precision_timing_required",
    ],
    ban: ["low_pressure_play"],
  },
  "action-pressure": {
    id: "action-pressure",
    vibe: "action",
    must: ["real_time_control"],
    boost: [
      "high_input_pressure",
      "high_stakes_failure",
      "time_pressure",
      "enemy_density_high",
      "precision_timing_required",
    ],
    ban: ["low_pressure_play"],
  },
  "action-positioning": {
    id: "action-positioning",
    vibe: "action",
    must: ["real_time_control"],
    boost: [
      "stealth_core",
      "line_of_sight_matters",
      "position_advantage_design",
      "route_selection_matters",
    ],
    ban: ["non_hostile_environment"],
  },
  "action-crowd-smash": {
    id: "action-crowd-smash",
    vibe: "action",
    must: ["enemy_density_high"],
    boost: ["high_input_pressure", "real_time_control", "time_pressure"],
    ban: ["low_pressure_play"],
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
