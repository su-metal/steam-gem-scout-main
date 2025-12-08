// 体験ラベルのマスタ（全25種）
export type FeatureLabel =
  // 🌿 Chill
  | "Cozy Life & Crafting"
  | "Gentle Exploration"
  | "Light Puzzle"
  | "Relaxed Building"
  | "Ambient Experience"
  // 📖 Story
  | "Story-Driven"
  | "Character Drama"
  | "Mystery & Investigation"
  | "Emotional Journey"
  | "Lore / Worldbuilding"
  // 🧠 Focus
  | "Turn-Based Tactics"
  | "Deckbuilding Strategy"
  | "Grand Strategy"
  | "Automation / Factory Strategy"
  | "Colony Management"
  // ⚡ Speed
  | "Action Combat"
  | "Precision Shooter"
  | "Rhythm / Music Action"
  | "Sports & Arena"
  | "High-Intensity Roguelike"
  // ⏱ Short
  | "Run-Based Roguelike"
  | "Arcade Action"
  | "Arcade Shooter"
  | "Short Puzzle"
  | "Micro Progression";

// ==== Chill 用マッピング ====
// ※ このブロックは削除・変更せず、そのまま残してください
const CHILL_AI_TAG_TO_FEATURE_LABEL: Record<string, FeatureLabel> = {
  // Cozy Life & Crafting
  cozy: "Cozy Life & Crafting",
  cozy_game: "Cozy Life & Crafting",
  cozy_life: "Cozy Life & Crafting",
  wholesome: "Cozy Life & Crafting",
  wholesome_game: "Cozy Life & Crafting",
  life_sim: "Cozy Life & Crafting",
  slice_of_life: "Cozy Life & Crafting",

  farming_sim: "Cozy Life & Crafting",
  farm_sim: "Cozy Life & Crafting",
  farming_game: "Cozy Life & Crafting",
  cozy_farming: "Cozy Life & Crafting",
  agriculture_sim: "Cozy Life & Crafting",

  animal_crossing_like: "Cozy Life & Crafting",
  stardew_like: "Cozy Life & Crafting",
  harvest_moon_like: "Cozy Life & Crafting",

  // 日本語寄りの表現も一応サポート
  "スローライフ": "Cozy Life & Crafting",
  "日常系": "Cozy Life & Crafting",
  "ほのぼの": "Cozy Life & Crafting",
  "まったり生活": "Cozy Life & Crafting",

  // Gentle Exploration
  walking_sim: "Gentle Exploration",
  walking_simulator: "Gentle Exploration",
  walking_game: "Gentle Exploration",

  cozy_exploration: "Gentle Exploration",
  light_exploration: "Gentle Exploration",
  exploration_chill: "Gentle Exploration",
  sightseeing: "Gentle Exploration",
  scenic_walks: "Gentle Exploration",
  hiking_game: "Gentle Exploration",
  travelogue: "Gentle Exploration",

  no_combat: "Gentle Exploration",
  exploration_no_combat: "Gentle Exploration",

  "散歩ゲー": "Gentle Exploration",
  "ウォーキングシム": "Gentle Exploration",
  "景色重視": "Gentle Exploration",
  "風景メイン": "Gentle Exploration",

  // Light Puzzle
  light_puzzle: "Light Puzzle",
  casual_puzzle: "Light Puzzle",
  cozy_puzzle: "Light Puzzle",
  relaxing_puzzle: "Light Puzzle",
  simple_puzzle: "Light Puzzle",

  brain_teaser_light: "Light Puzzle",
  light_brain_teaser: "Light Puzzle",

  match3: "Light Puzzle",
  match_3: "Light Puzzle",

  puzzle_short: "Light Puzzle",
  puzzle_snack: "Light Puzzle",

  "パズル_カジュアル": "Light Puzzle",
  "ライトパズル": "Light Puzzle",
  "脳トレ_ライト": "Light Puzzle",

  // Relaxed Building
  cozy_building: "Relaxed Building",
  relaxing_building: "Relaxed Building",
  building_chill: "Relaxed Building",

  sandbox_building: "Relaxed Building",
  creative_building: "Relaxed Building",
  decoration_focus: "Relaxed Building",

  town_building: "Relaxed Building",
  village_builder_cozy: "Relaxed Building",
  light_city_builder: "Relaxed Building",

  management_light: "Relaxed Building",
  sim_chill: "Relaxed Building",

  "街づくり_まったり": "Relaxed Building",
  "建築メイン": "Relaxed Building",
  "サンドボックス_建築": "Relaxed Building",

  // Ambient Experience
  ambient: "Ambient Experience",
  ambient_experience: "Ambient Experience",
  meditative: "Ambient Experience",
  zen: "Ambient Experience",
  zen_mode: "Ambient Experience",

  no_fail_state: "Ambient Experience",
  no_objective: "Ambient Experience",
  no_pressure: "Ambient Experience",

  music_visualizer: "Ambient Experience",
  audio_visual: "Ambient Experience",
  art_experience: "Ambient Experience",

  chill_background_game: "Ambient Experience",
  idle_ambient: "Ambient Experience",

  "雰囲気ゲー": "Ambient Experience",
  "作業用ゲーム": "Ambient Experience",
  "BGM目的": "Ambient Experience",
  "眺めるだけ": "Ambient Experience",
};

// ==== Story 用マッピング ====

const STORY_AI_TAG_TO_FEATURE_LABEL: Record<string, FeatureLabel> = {
  // Story-Driven
  story_driven: "Story-Driven",
  narrative_driven: "Story-Driven",
  narrative_focus: "Story-Driven",
  story_rich: "Story-Driven",
  heavy_story: "Story-Driven",
  strong_story: "Story-Driven",
  main_story_focus: "Story-Driven",
  plot_driven: "Story-Driven",
  plot_focus: "Story-Driven",
  cinematic_story: "Story-Driven",
  visual_novel_like: "Story-Driven",

  "ストーリー重視": "Story-Driven",
  "ストーリー主導": "Story-Driven",
  "物語メイン": "Story-Driven",

  // Character Drama
  character_driven: "Character Drama",
  character_focus: "Character Drama",
  character_drama: "Character Drama",
  relationship_drama: "Character Drama",
  romance_focus: "Character Drama",
  romance_game: "Character Drama",
  party_banter: "Character Drama",
  interpersonal_drama: "Character Drama",
  character_arc_focus: "Character Drama",
  companion_focus: "Character Drama",
  ensemble_cast: "Character Drama",

  "キャラ重視": "Character Drama",
  "キャラクター重視": "Character Drama",
  "人物ドラマ": "Character Drama",

  // Mystery & Investigation
  mystery: "Mystery & Investigation",
  detective: "Mystery & Investigation",
  investigation: "Mystery & Investigation",
  crime_mystery: "Mystery & Investigation",
  whodunit: "Mystery & Investigation",
  detective_game: "Mystery & Investigation",
  detective_adventure: "Mystery & Investigation",
  case_solving: "Mystery & Investigation",
  evidence_hunting: "Mystery & Investigation",
  investigation_game: "Mystery & Investigation",
  courtroom_drama: "Mystery & Investigation",

  "推理もの": "Mystery & Investigation",
  "推理モノ": "Mystery & Investigation",
  "ミステリー": "Mystery & Investigation",
  "調査モノ": "Mystery & Investigation",

  // Emotional Journey
  emotional: "Emotional Journey",
  emotional_story: "Emotional Journey",
  emotional_journey: "Emotional Journey",
  feels_trip: "Emotional Journey",
  heartwarming: "Emotional Journey",
  heartbreaking: "Emotional Journey",
  tearjerker: "Emotional Journey",
  bittersweet: "Emotional Journey",
  touching_story: "Emotional Journey",
  drama_focus: "Emotional Journey",

  "感動系": "Emotional Journey",
  "泣ける": "Emotional Journey",
  "エモーショナル": "Emotional Journey",
  "心温まる": "Emotional Journey",

  // Lore / Worldbuilding
  worldbuilding: "Lore / Worldbuilding",
  rich_lore: "Lore / Worldbuilding",
  deep_lore: "Lore / Worldbuilding",
  extensive_lore: "Lore / Worldbuilding",
  codex_lore: "Lore / Worldbuilding",
  lore_heavy: "Lore / Worldbuilding",
  setting_focus: "Lore / Worldbuilding",
  universe_building: "Lore / Worldbuilding",
  detailed_world: "Lore / Worldbuilding",
  background_lore: "Lore / Worldbuilding",

  "世界観重視": "Lore / Worldbuilding",
  "世界設定重視": "Lore / Worldbuilding",
  "設定厨向け": "Lore / Worldbuilding",
};


// ==== Focus 用マッピング ====

const FOCUS_AI_TAG_TO_FEATURE_LABEL: Record<string, FeatureLabel> = {
  // Turn-Based Tactics
  turn_based_tactics: "Turn-Based Tactics",
  tactics_game: "Turn-Based Tactics",
  tactical_game: "Turn-Based Tactics",
  squad_tactics: "Turn-Based Tactics",
  grid_tactics: "Turn-Based Tactics",
  tactical_rpg: "Turn-Based Tactics",
  tactics_rpg: "Turn-Based Tactics",
  xcom_like: "Turn-Based Tactics",
  fire_emblem_like: "Turn-Based Tactics",
  hex_tactics: "Turn-Based Tactics",
  turn_based_combat: "Turn-Based Tactics",
  tactical_battles: "Turn-Based Tactics",

  "タクティクス": "Turn-Based Tactics",
  "タクティカルRPG": "Turn-Based Tactics",
  "SRPG": "Turn-Based Tactics",

  // Deckbuilding Strategy
  deckbuilder: "Deckbuilding Strategy",
  deck_building: "Deckbuilding Strategy",
  deck_building_game: "Deckbuilding Strategy",
  card_battler: "Deckbuilding Strategy",
  card_game_roguelike: "Deckbuilding Strategy",
  card_strategy: "Deckbuilding Strategy",
  tcg_like: "Deckbuilding Strategy",
  slay_the_spire_like: "Deckbuilding Strategy",
  roguelite_deckbuilder: "Deckbuilding Strategy",
  card_synergy_focus: "Deckbuilding Strategy",

  "デッキ構築": "Deckbuilding Strategy",
  "カードゲーム_戦略": "Deckbuilding Strategy",

  // Grand Strategy
  grand_strategy: "Grand Strategy",
  "4x_strategy": "Grand Strategy",
  empire_builder: "Grand Strategy",
  nation_management: "Grand Strategy",
  country_management: "Grand Strategy",
  paradox_like: "Grand Strategy",
  map_painting: "Grand Strategy",
  global_strategy: "Grand Strategy",
  large_scale_strategy: "Grand Strategy",
  geopolitics_strategy: "Grand Strategy",

  "グランドストラテジー": "Grand Strategy",
  "4Xストラテジー": "Grand Strategy",
  "国家運営": "Grand Strategy",

  // Automation / Factory Strategy
  factory_automation: "Automation / Factory Strategy",
  automation_game: "Automation / Factory Strategy",
  automation: "Automation / Factory Strategy",
  factorio_like: "Automation / Factory Strategy",
  production_chain: "Automation / Factory Strategy",
  logistics_sim: "Automation / Factory Strategy",
  conveyor_builder: "Automation / Factory Strategy",
  factory_builder: "Automation / Factory Strategy",
  resource_automation: "Automation / Factory Strategy",
  automation_planning: "Automation / Factory Strategy",

  "オートメーション": "Automation / Factory Strategy",
  "工場自動化": "Automation / Factory Strategy",
  "ライン構築": "Automation / Factory Strategy",

  // Colony Management
  colony_sim: "Colony Management",
  colony_management: "Colony Management",
  base_builder_colony: "Colony Management",
  survival_colony: "Colony Management",
  rimworld_like: "Colony Management",
  dwarf_fortress_like: "Colony Management",
  settlement_sim: "Colony Management",
  settlement_management: "Colony Management",
  colonist_management: "Colony Management",
  village_management: "Colony Management",

  "コロニーシム": "Colony Management",
  "コロニー運営": "Colony Management",
  "入植地運営": "Colony Management",
};


// ==== Speed 用マッピング ====

const SPEED_AI_TAG_TO_FEATURE_LABEL: Record<string, FeatureLabel> = {
  // Action Combat
  action_combat: "Action Combat",
  fast_action: "Action Combat",
  high_speed_action: "Action Combat",
  hack_and_slash: "Action Combat",
  character_action: "Action Combat",
  combo_action: "Action Combat",
  stylish_action: "Action Combat",
  melee_action: "Action Combat",
  brawler: "Action Combat",
  spectacle_fighter: "Action Combat",
  soulslike: "Action Combat",
  souls_like: "Action Combat",
  metroidvania_action: "Action Combat",
  combo_focused: "Action Combat",

  "アクション寄り": "Action Combat",
  "高難度アクション": "Action Combat",
  "高難易度アクション": "Action Combat",

  // Precision Shooter
  precision_shooter: "Precision Shooter",
  twitch_shooter: "Precision Shooter",
  arena_shooter: "Precision Shooter",
  fast_fps: "Precision Shooter",
  high_skill_shooter: "Precision Shooter",
  competitive_fps: "Precision Shooter",
  aim_focused: "Precision Shooter",
  headshot_focus: "Precision Shooter",
  quake_like: "Precision Shooter",
  counter_strike_like: "Precision Shooter",
  arena_fps: "Precision Shooter",

  "シビアなエイム": "Precision Shooter",
  "ハイスピードFPS": "Precision Shooter",

  // Rhythm / Music Action
  rhythm_game: "Rhythm / Music Action",
  rhythm_action: "Rhythm / Music Action",
  music_game: "Rhythm / Music Action",
  music_rhythm: "Rhythm / Music Action",
  beat_match: "Rhythm / Music Action",
  rhythm_shooter: "Rhythm / Music Action",
  rhythm_platformer: "Rhythm / Music Action",
  beat_saber_like: "Rhythm / Music Action",
  music_runner: "Rhythm / Music Action",

  "音ゲー": "Rhythm / Music Action",
  "リズムゲーム": "Rhythm / Music Action",
  "音楽アクション": "Rhythm / Music Action",

  // Sports & Arena
  sports_game: "Sports & Arena",
  sports: "Sports & Arena",
  arcade_sports: "Sports & Arena",
  arena_sports: "Sports & Arena",
  football_game: "Sports & Arena",
  soccer_game: "Sports & Arena",
  basketball_game: "Sports & Arena",
  hockey_game: "Sports & Arena",
  racing_sports: "Sports & Arena",
  car_soccer: "Sports & Arena",
  rocket_league_like: "Sports & Arena",
  competitive_sports: "Sports & Arena",

  "スポーツゲーム": "Sports & Arena",
  "アリーナ系スポーツ": "Sports & Arena",

  // High-Intensity Roguelike
  action_roguelike: "High-Intensity Roguelike",
  roguelite_action: "High-Intensity Roguelike",
  high_intensity_roguelike: "High-Intensity Roguelike",
  frantic_roguelike: "High-Intensity Roguelike",
  fast_roguelite: "High-Intensity Roguelike",
  twin_stick_roguelike: "High-Intensity Roguelike",
  bullet_hell_roguelike: "High-Intensity Roguelike",
  roguelike_shooter: "High-Intensity Roguelike",
  roguelite_shooter: "High-Intensity Roguelike",

  "高テンションローグライク": "High-Intensity Roguelike",
  "ローグライト_アクション": "High-Intensity Roguelike",
};


// ==== Short 用マッピング ====

const SHORT_AI_TAG_TO_FEATURE_LABEL: Record<string, FeatureLabel> = {
  // Run-Based Roguelike
  run_based_roguelike: "Run-Based Roguelike",
  run_based: "Run-Based Roguelike",
  quick_run_roguelike: "Run-Based Roguelike",
  coffee_break_roguelike: "Run-Based Roguelike",
  short_run_roguelite: "Run-Based Roguelike",
  pick_up_and_play_roguelike: "Run-Based Roguelike",
  bite_sized_roguelike: "Run-Based Roguelike",

  "ローグライト_周回": "Run-Based Roguelike",
  "短時間ローグライク": "Run-Based Roguelike",

  // Arcade Action
  arcade_action: "Arcade Action",
  arcade_game: "Arcade Action",
  score_attack: "Arcade Action",
  highscore_chasing: "Arcade Action",
  time_attack_action: "Arcade Action",
  pick_up_and_play_action: "Arcade Action",
  simple_arcade_action: "Arcade Action",
  endless_runner_action: "Arcade Action",

  "アーケードアクション": "Arcade Action",
  "スコアアタック": "Arcade Action",

  // Arcade Shooter
  arcade_shooter: "Arcade Shooter",
  twin_stick_shooter: "Arcade Shooter",
  bullet_hell: "Arcade Shooter",
  shmup: "Arcade Shooter",
  shoot_em_up: "Arcade Shooter",
  topdown_shooter: "Arcade Shooter",
  scrolling_shooter: "Arcade Shooter",
  "2d_shooter": "Arcade Shooter",

  "アーケードシューター": "Arcade Shooter",
  "弾幕シューティング": "Arcade Shooter",
  "シューティング_アーケード": "Arcade Shooter",

  // Short Puzzle
  short_puzzle: "Short Puzzle",
  puzzle_snack: "Short Puzzle",
  bite_sized_puzzle: "Short Puzzle",
  micro_puzzle: "Short Puzzle",
  daily_puzzle: "Short Puzzle",
  episodic_puzzle: "Short Puzzle",
  quick_puzzle: "Short Puzzle",

  "短時間パズル": "Short Puzzle",
  "スキマ時間パズル": "Short Puzzle",

  // Micro Progression
  micro_progression: "Micro Progression",
  incremental: "Micro Progression",
  idle_game: "Micro Progression",
  clicker: "Micro Progression",
  light_roguelite: "Micro Progression",
  meta_progression: "Micro Progression",
  run_unlocks: "Micro Progression",
  upgrade_loop: "Micro Progression",
  progression_snack: "Micro Progression",

  "インクリメンタル": "Micro Progression",
  "クリッカー": "Micro Progression",
  "メタ進行": "Micro Progression",
};


// ==== 統合マップと公開関数 ====

const AI_TAG_TO_FEATURE_LABEL: Record<string, FeatureLabel> = {
  ...CHILL_AI_TAG_TO_FEATURE_LABEL,
  ...STORY_AI_TAG_TO_FEATURE_LABEL,
  ...FOCUS_AI_TAG_TO_FEATURE_LABEL,
  ...SPEED_AI_TAG_TO_FEATURE_LABEL,
  ...SHORT_AI_TAG_TO_FEATURE_LABEL,
};

/**
 * AI が吐いた aiTags から Feature Labels を導出する。
 * - 大文字小文字のゆらぎを吸収
 * - 重複ラベルは Set で除去
 */
export function mapAiTagsToFeatureLabels(
  aiTags: string[],
): FeatureLabel[] {
  const labels = new Set<FeatureLabel>();

  for (const raw of aiTags) {
    if (!raw) continue;

    // 前後空白を削って小文字化
    const tag = raw.trim().toLowerCase();

    const label = AI_TAG_TO_FEATURE_LABEL[tag];
    if (label) {
      labels.add(label);
      continue;
    }

    // 必要であれば簡単なフォールバック（部分一致など）をここに追加してもよい
    // ただし、過度に複雑なロジックにはしないこと
  }

  return Array.from(labels);
}
