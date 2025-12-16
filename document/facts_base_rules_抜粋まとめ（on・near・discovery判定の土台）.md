# Facts / Base Rules 抜粋まとめ（ON・NEAR・DISCOVERY判定の土台）

このドキュメントは、提示されたコードから **Facts（タグ）** と **Experience Focus（base_rule / must・boost・ban）** のうち、
ON / NEAR / DISCOVERY 判定の土台として必要な情報だけを抜粋して整理したもの。

---

## 1. Persisted Facts Tags

永続化対象として扱う Facts タグ一覧（`PERSISTED_FACT_TAGS`）。

- real_time_control
- high_input_pressure
- high_stakes_failure
- time_pressure
- enemy_density_high
- precision_timing_required
- stealth_core
- line_of_sight_matters
- position_advantage_design
- route_selection_matters
- free_movement_exploration
- map_reveal_progression
- non_hostile_environment
- planning_required
- resource_management
- automation_core
- optimization_required
- narrative_driven_progression
- story-journey-and-growth
- reading_heavy_interaction
- branching_narrative
- choice_has_consequence
- lore_optional_depth
- low_pressure_play
- session_based_play
- pause_friendly
- creative_manipulation
- open_ended_goal
- logical_puzzle_core
- job_simulation_loop
- low_precision_input
- power_scaling_over_time
- battle_loop_core

---

## 2. Base Rules（Experience Focus の must / boost / ban）

`BASE_RULES: Record<ExperienceFocusId, FocusRule>` に定義されている base_rule。
各 Focus は **must / boost / ban** を持ち、ON / NEAR / DISCOVERY の判定材料となる。

### Chill

#### chill-cozy-living
- must: low_pressure_play, non_hostile_environment
- boost: session_based_play, pause_friendly, open_ended_goal
- ban: high_input_pressure, high_stakes_failure, real_time_control

#### chill-gentle-exploration
- must: free_movement_exploration
- boost: map_reveal_progression, non_hostile_environment, creative_manipulation
- ban: high_input_pressure, high_stakes_failure

#### chill-ambient-immersion
- must: non_hostile_environment
- boost: map_reveal_progression, narrative_driven_progression, lore_optional_depth
- ban: high_input_pressure, real_time_control

#### chill-relaxed-puzzle
- must: logical_puzzle_core
- boost: low_pressure_play, pause_friendly, session_based_play
- ban: real_time_control, high_input_pressure

#### chill-slow-creation
- must: creative_manipulation
- boost: resource_management, automation_core, open_ended_goal
- ban: high_input_pressure, real_time_control

### Story

#### story-narrative-action
- must: narrative_driven_progression
- boost: real_time_control, high_input_pressure, stealth_core, high_stakes_failure, battle_loop_core
- ban: reading_heavy_interaction

#### story-journey-and-growth
- must: narrative_driven_progression, battle_loop_core
- boost: power_scaling_over_time, free_movement_exploration, map_reveal_progression, resource_management, planning_required
- ban: automation_core, systems_interaction_depth, optimization_required, time_pressure

#### story-reading-centered-story
- must: narrative_driven_progression, reading_heavy_interaction
- boost: choice_has_consequence, branching_narrative, lore_optional_depth
- ban: high_input_pressure

#### story-mystery-investigation
- must: narrative_driven_progression, planning_required
- boost: logical_puzzle_core, map_reveal_progression, choice_has_consequence
- ban: high_input_pressure

#### story-choice-and-consequence
- must: narrative_driven_progression, choice_has_consequence
- boost: branching_narrative, lore_optional_depth, reading_heavy_interaction
- ban: high_input_pressure

#### story-lore-worldbuilding
- must: lore_optional_depth
- boost: narrative_driven_progression, map_reveal_progression, non_hostile_environment
- ban: high_input_pressure

### Focus

#### focus-battle-and-growth
- must: battle_loop_core, power_scaling_over_time
- boost: planning_required, resource_management
- ban: automation_core, systems_interaction_depth, optimization_required

#### focus-tactics-and-planning
- must: planning_required
- boost: systems_interaction_depth, logical_puzzle_core, precision_timing_required
- ban: low_pressure_play

#### focus-base-and-systems
- must: systems_interaction_depth
- boost: resource_management, planning_required, automation_core
- ban: high_input_pressure

#### focus-operational-sim
- must: job_simulation_loop
- boost: systems_interaction_depth, planning_required, automation_core, resource_management
- ban: high_input_pressure

#### focus-optimization-builder
- must: automation_core
- boost: optimization_required, systems_interaction_depth, resource_management, planning_required
- ban: narrative_driven_progression

### Action

#### action-exploration
- must: free_movement_exploration
- boost: map_reveal_progression, non_hostile_environment, route_selection_matters
- ban: high_input_pressure, time_pressure

#### action-combat
- must: real_time_control
- boost: high_input_pressure, enemy_density_high, precision_timing_required
- ban: stealth_core, time_pressure

#### action-pressure
- must: high_stakes_failure
- boost: high_input_pressure, time_pressure, precision_timing_required
- ban: low_pressure_play, pause_friendly

#### action-positioning
- must: position_advantage_design
- boost: stealth_core, line_of_sight_matters, planning_required, route_selection_matters
- ban: enemy_density_high, time_pressure

#### action-crowd-smash
- must: enemy_density_high
- boost: low_precision_input, real_time_control, power_scaling_over_time
- ban: stealth_core, planning_required

### Short

#### short-arcade-action
- must: real_time_control
- boost: precision_timing_required, time_pressure
- ban: low_pressure_play

#### short-tactical-decisions
- must: planning_required
- boost: precision_timing_required, real_time_control
- ban: non_hostile_environment

#### short-puzzle-moments
- must: logical_puzzle_core
- boost: precision_timing_required, creative_manipulation
- ban: high_input_pressure

#### short-flow-mastery
- must: time_pressure
- boost: precision_timing_required, real_time_control
- ban: low_pressure_play

#### short-competitive-rounds
- must: high_stakes_failure
- boost: real_time_control, precision_timing_required, enemy_density_high
- ban: low_pressure_play

---

## 3. Facts Extractor（システム指示・選定ポリシーの要点）

### システム基本方針（system）
- Steamゲームの facts extractor として動作
- 出力はスキーマに一致する JSON のみ
- タグは許可リストからのみ選ぶ
- evidence キーは返したタグ（lowercase）と一致
- quote が無いが明らかに適用できるタグは evidence 空配列で許容
- evidence required tags は引用が無ければ **タグ自体を出さない**
- derived-only tags（例: systems_interaction_depth）は **出力禁止**（別計算）
- 最大 10 タグまで（意味の強いもの優先）

### 重要な誤検知防止（抜粋）
- automation_core は工場・物流・生産ライン等の自動化のみ（比喩的自動化は不可）
- job_simulation_loop は実際の「仕事ループ」限定（RPGのジョブシステムは該当しない）

### Selection policy（抜粋）
- 最大 10 タグ
- 強い反復的証拠を優先
- 重複するタグは避ける
- narrative RPG でも branching_narrative / choice_has_consequence は自動付与しない

---

## 4. Tag Glossary（定義の要点）

提示コード内 `glossaryBody` の定義は、Facts タグの意味を固定する辞書。
ON / NEAR / DISCOVERY 判定の前提として重要なため、以下の特徴だけ要点として保持。

- narrative_driven_progression: ストーリー主導で進む（明示的根拠が必要）
- battle_loop_core: 戦闘が反復の中核ループ
- power_scaling_over_time: レベル/スキル/装備等で強くなる明示が必要（RPGだからでは不可）
- low_pressure_play: high_input_pressure や time_pressure と衝突する場合は false 扱い

---

## 5. 補足

- `systems_interaction_depth` は "Derived-only tags" として出力禁止だが、BASE_RULES の must/ban/boost には登場している。
- yes/no mode instructions / sourcePolicyLines など、判定品質に関わる追加の規約が多数あるが、ここでは **base_rule と facts 出力の整合**に必要な部分だけを抜粋した。

