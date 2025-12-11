// supabase/functions/_shared/feature-labels.ts

// ※ すでに別の場所で定義済みなら、ここは現在の実装に合わせて調整してください。
export type Vibe = "chill" | "story" | "focus" | "speed" | "short";

/**
 * FeatureLabel
 *
 * - Mechanics（ゲームが「何をさせるか」）
 * - Mood（プレイ中の「雰囲気・感情」）
 */
export type FeatureLabel =
  // === Mechanics (23) ===
  | "crafting"
  | "base_building"
  | "survival_loop"
  | "exploration_core"
  | "procedural_generation"
  | "roguelike_structure"
  | "combat_focused"
  | "high_skill_action"
  | "platforming"
  | "puzzle_solving"
  | "deckbuilding"
  | "run_based_roguelike"
  | "turn_based_tactics"
  | "resource_management"
  | "automation_systems"
  | "colony_management"
  | "farming_life_sim"
  | "rpg_progression"
  | "stealth_gameplay"
  | "vehicle_driving"
  | "coop_core"
  | "rhythm_action"
  | "visual_novel"
  | "sports_gameplay"
  | "branching_choice"
  | "micro_progression"
  | "co_op_multiplayer"
  // === Mood (12) ===
  | "cozy"
  | "relaxing"
  | "calm_exploration"
  | "atmospheric"
  | "tense"
  | "high_intensity"
  | "horror_tinged"
  | "isolation"
  | "emotional_narrative"
  | "emotional_journey"
  | "psychological_atmosphere"
  | "sci_fi_mystery"
  | "meditative"
  | "wholesome"
  | "chaotic_fastpaced"
  | "story_driven"
  | "character_drama";

/**
 * FeatureLabel V2（次世代ラベル設計）
 */
export type FeatureLabelV2 =
  // === Experience: Calm / Chill / Zen ===
  | "cozy_experience"
  | "gentle_exploration"
  | "light_puzzleplay"
  | "ambient_mood"
  | "relaxing_flow"
  // === Experience: Narrative / Story / Emotion ===
  | "story_driven"
  | "emotional_journey"
  | "character_drama"
  | "mystery_investigation"
  | "dialogue_heavy"
  | "worldbuilding_depth"
  // === Experience: Strategy / Thinking / Planning ===
  | "turn_based_tactics"
  | "deckbuilding_strategy"
  | "grand_strategy"
  | "automation_logic"
  | "colony_management"
  | "logistics_planning"
  // === Experience: Action / Adrenaline / Reflex ===
  | "action_combat"
  | "precision_shooter"
  | "mobility_platforming"
  | "rhythm_action"
  | "high_intensity_challenge"
  // === Experience: Quick / Arcade / Short ===
  | "run_based_structure"
  | "arcade_actionstyle"
  | "arcade_shooter"
  | "quick_puzzle"
  | "micro_progression"
  // === Atmosphere ===
  | "atmospheric_world"
  | "cozy_tone"
  | "dark_tension"
  | "whimsical_vibe"
  | "sci_fi_atmosphere"
  | "fantasy_atmosphere"
  // === Customization / Expression / Social ===
  | "player_customization"
  | "environment_customization"
  | "sandbox_creation"
  | "light_social_presence"
  | "shared_activity_feel"
  | "routine_loop_play"
  // === Mechanic ===
  | "character_progression"
  | "skill_tree_systems"
  | "loot_and_rewards_loop"
  | "construction_building"
  | "resource_management"
  | "automation_processes"
  | "colony_simulation"
  | "exploration_core"
  | "open_world_structure"
  | "survival_mechanics"
  | "real_time_combat"
  | "tactical_turn_combat"
  | "precision_control_platforming"
  | "choice_and_consequence"
  | "branching_narrative_structure"
  | "roguelike_run_structure";

export const FEATURE_LABELS_V2: readonly FeatureLabelV2[] = [
  "cozy_experience",
  "gentle_exploration",
  "light_puzzleplay",
  "ambient_mood",
  "relaxing_flow",
  "story_driven",
  "emotional_journey",
  "character_drama",
  "mystery_investigation",
  "dialogue_heavy",
  "worldbuilding_depth",
  "turn_based_tactics",
  "deckbuilding_strategy",
  "grand_strategy",
  "automation_logic",
  "colony_management",
  "logistics_planning",
  "action_combat",
  "precision_shooter",
  "mobility_platforming",
  "rhythm_action",
  "high_intensity_challenge",
  "run_based_structure",
  "arcade_actionstyle",
  "arcade_shooter",
  "quick_puzzle",
  "micro_progression",
  "atmospheric_world",
  "cozy_tone",
  "dark_tension",
  "whimsical_vibe",
  "sci_fi_atmosphere",
  "fantasy_atmosphere",
  "player_customization",
  "environment_customization",
  "sandbox_creation",
  "light_social_presence",
  "shared_activity_feel",
  "routine_loop_play",
  "character_progression",
  "skill_tree_systems",
  "loot_and_rewards_loop",
  "construction_building",
  "resource_management",
  "automation_processes",
  "colony_simulation",
  "exploration_core",
  "open_world_structure",
  "survival_mechanics",
  "real_time_combat",
  "tactical_turn_combat",
  "precision_control_platforming",
  "choice_and_consequence",
  "branching_narrative_structure",
  "roguelike_run_structure",
];

const FEATURE_LABELS_V2_SET = new Set<string>(FEATURE_LABELS_V2);

export function isFeatureLabelV2(slug: string): slug is FeatureLabelV2 {
  return FEATURE_LABELS_V2_SET.has(slug);
}

/**
 * UI 用の表示名
 */
export const FEATURE_LABEL_DISPLAY_NAMES: Record<FeatureLabel, string> = {
  // === Mechanics ===
  crafting: "クラフト要素",
  base_building: "拠点・建築要素",
  survival_loop: "サバイバル要素",
  exploration_core: "探索中心構造",
  procedural_generation: "ランダム生成要素",
  roguelike_structure: "ローグライク構造",
  combat_focused: "戦闘中心ゲーム",
  high_skill_action: "高スキルアクション",
  platforming: "プラットフォーム要素",
  puzzle_solving: "パズル要素",
  deckbuilding: "デッキ構築",
  run_based_roguelike: "ランベースのローグライク",
  turn_based_tactics: "ターン制戦術",
  resource_management: "資源管理",
  automation_systems: "自動化システム",
  colony_management: "コロニー運営",
  farming_life_sim: "生活・農業シミュレーション",
  rpg_progression: "RPG成長要素",
  stealth_gameplay: "ステルスプレイ",
  vehicle_driving: "乗り物・輸送要素",
  coop_core: "協力プレイ中心",
  rhythm_action: "リズムアクション",
  visual_novel: "ビジュアルノベル",
  sports_gameplay: "スポーツゲーム要素",
  branching_choice: "分岐選択重視",
  micro_progression: "小刻みな進行",
  co_op_multiplayer: "協力プレイ要素",

  // === Mood ===
  cozy: "ほのぼの・コージー",
  relaxing: "リラックス感",
  calm_exploration: "静かな探索感",
  atmospheric: "雰囲気没入",
  tense: "緊張感",
  high_intensity: "高強度アクション",
  horror_tinged: "ホラー要素",
  isolation: "孤独感",
  emotional_narrative: "感情的・物語重視",
  emotional_journey: "感情の旅路",
  psychological_atmosphere: "心理的な雰囲気",
  sci_fi_mystery: "SFミステリ",
  meditative: "瞑想的・静謐",
  wholesome: "優しい・ほっこり",
  chaotic_fastpaced: "カオス・高速展開",
  story_driven: "物語主導体験",
  character_drama: "キャラクター・ドラマ",
};

/**
 * Mechanics 系だけのリスト
 * - 分類・相性マトリクス・VIBEロジック用
 */
export const MECHANIC_FEATURE_LABELS: FeatureLabel[] = [
  "crafting",
  "base_building",
  "survival_loop",
  "exploration_core",
  "procedural_generation",
  "roguelike_structure",
  "combat_focused",
  "high_skill_action",
  "platforming",
  "puzzle_solving",
  "deckbuilding",
  "run_based_roguelike",
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
  "branching_choice",
  "micro_progression",
  "co_op_multiplayer",
];

/**
 * Mood 系だけのリスト
 */
export const MOOD_FEATURE_LABELS: FeatureLabel[] = [
  "cozy",
  "relaxing",
  "calm_exploration",
  "atmospheric",
  "tense",
  "high_intensity",
  "horror_tinged",
  "isolation",
  "emotional_narrative",
  "emotional_journey",
  "psychological_atmosphere",
  "sci_fi_mystery",
  "meditative",
  "wholesome",
  "chaotic_fastpaced",
  "story_driven",
  "character_drama",
];

export function isMechanicFeatureLabel(label: FeatureLabel): boolean {
  return MECHANIC_FEATURE_LABELS.includes(label);
}

export function isMoodFeatureLabel(label: FeatureLabel): boolean {
  return MOOD_FEATURE_LABELS.includes(label);
}
