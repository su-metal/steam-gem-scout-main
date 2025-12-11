# FeatureLabel v2（最終統合版）
## 目的
本ラベル体系は、アプリの核である「気分 × 体験」でのゲーム発見体験を最大化するために設計された、普遍的で中粒度の FeatureLabel セットである。

- 狭すぎず、広すぎず
- どのゲームジャンルにも適用可能
- Experience Focus と自然に連動
- AI が誤射しにくく推定しやすい
- 将来の focusScore などの実装の基盤になる

全ラベルは **体験（Experience）／雰囲気（Atmosphere）／カスタム（Customization）／メカニクス（Mechanic）** の4カテゴリに整理される。

総数：約 **38 ラベル**（黄金粒度）

---
# A. Experience（体験カテゴリ）
プレイヤーが得る体験の質を表す、最重要ラベル群。
VIBE・Experience Focus と最も強く関係する。

## 1. Calm / Chill / Zen（癒し・落ち着き系）
- cozy_experience
- gentle_exploration
- light_puzzleplay
- ambient_mood
- relaxing_flow

## 2. Narrative / Story / Emotion（物語・感情系）
- story_driven
- emotional_journey
- character_drama
- mystery_investigation
- dialogue_heavy
- worldbuilding_depth

## 3. Strategy / Thinking / Planning（戦略・思考系）
- turn_based_tactics
- deckbuilding_strategy
- grand_strategy
- automation_logic
- colony_management
- logistics_planning

## 4. Action / Adrenaline / Reflex（反射・緊張系）
- action_combat
- precision_shooter
- mobility_platforming
- rhythm_action
- high_intensity_challenge

## 5. Quick / Arcade / Short（短時間・軽量セッション系）
- run_based_structure
- arcade_actionstyle
- arcade_shooter
- quick_puzzle
- micro_progression

---
# B. Atmosphere（ムード・世界観カテゴリ）
ゲームの空気感・雰囲気を示す。
気分検索との親和性が非常に高い。

- atmospheric_world
- cozy_tone
- dark_tension
- whimsical_vibe
- sci_fi_atmosphere
- fantasy_atmosphere

---
# C. Customization / Expression / Social（表現・創造・交流カテゴリ）
現代ゲームに多い「自己表現」「創造」「ゆるい他者との繋がり」を表す。

- player_customization
- environment_customization
- sandbox_creation
- light_social_presence
- shared_activity_feel
- routine_loop_play

---
# D. Mechanic（ゲーム構造カテゴリ）
体験を支える“骨格”となる普遍メカニクス。  
過剰に細分化せず、情報量を適切に保つ。

## 1. Progression / RPG 系
- character_progression
- skill_tree_systems
- loot_and_rewards_loop

## 2. Construction / Management 系
- construction_building
- resource_management
- automation_processes
- colony_simulation

## 3. Exploration / Survival 系
- exploration_core
- open_world_structure
- survival_mechanics

## 4. Combat / Action Structure 系
- real_time_combat
- tactical_turn_combat
- precision_control_platforming

## 5. Systemic / Structural Mechanics 系
- choice_and_consequence
- branching_narrative_structure
- roguelike_run_structure

---
# 総括
この FeatureLabel v2 は、
- 気分（VIBE）
- 求める体験（Experience Focus）
- ゲームの本質（FeatureLabel）

の三位一体モデルを成立させるために最適化された、普遍的で強力な設計となっている。

今後、このラベル体系を用いて：
- Experience Focus × FeatureLabel のマッピング表
- analyze-game の systemPrompt 最適化
- TS 側のスコアリング実装（focusScore）

などを進めることで、アプリ全体のレコメンド品質が飛躍的に向上する。

