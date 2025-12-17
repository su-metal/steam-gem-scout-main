# Story VIBE × Experience Focus — Source of Truth（確定版・統合）

本ドキュメントは、本プロジェクトにおける **Story VIBE × Experience Focus 判定の唯一の正（Single Source of Truth）** である。

以後、設計・実装・調整・検証は **必ず本ドキュメントを基準** とする。
過去のキャンバス（重複版・検討途中版）は本内容に **完全統合・置き換え** られる。

---

## 1. 上位概念：Story VIBE

Story VIBE は「物語的体験を主軸にゲームを発見する」ための大枠であり、
ジャンル分類ではなく **体験軸（Experience）への入口** として機能する。

Story VIBE 配下では、以下の Experience Focus を並列に評価し、
ON / NEAR / DISCOVERY / OFF の **帯（Band）** を算出する。

---

## 2. Band の意味（共通定義）

| Band | 意味 |
|---|---|
| ON | その体験が中核。強く推薦できる |
| NEAR | 中核ではないが明確に当てはまる |
| DISCOVERY | 条件次第・文脈次第で刺さる可能性 |
| OFF | 体験として不一致 |

※ **facts は緩く保存 / band 判定は厳密** が基本方針

---

## 3. 判定アーキテクチャ（SoT）

### Facts 生成（generate-facts）

- LLM（yes/no）により FACT_TAG を網羅的に取得
- evidence-required タグは evidence がない場合 guard で除外
- RPG Narrative Assist
  - narrativeDecisionHasRpgSignal === true の場合
  - narrative_driven_progression = true
  - 同時に yn evidence を 1 件 inject
  - **forced-false を一度だけ回避**
- battle_loop_core / power_scaling_over_time は
  - RPG signal **かつ** 戦闘語彙（battle/combat 等）が corpus に存在する場合のみ自動注入

### Band 計算（search-games）

- facts-v11 の FocusRule に基づき computeBand を実行
- RPG-assist による narrative は
  - narrativeDecision === "none"
  - narrativeRpgAssistApplied === true
  - corpus が thin（about_the_game 欠落 or < 800 chars）
  の場合のみ **ON → NEAR に軽くキャップ**
- selectedFocusBand は必ず allFocusBands[experienceFocusId] と一致する

---

## 4. Experience Focus 定義（確定）

### 4.1 story-journey-and-growth

**定義**
- 主人公の旅・成長・長期的変化を追体験する
- システムよりも「進行と変化」が体験の軸

**must**
- narrative_driven_progression
- battle_loop_core

**boost**
- power_scaling_over_time
- free_movement_exploration
- map_reveal_progression
- resource_management
- lore_optional_depth

**ban**
- automation_core
- optimization_required
- high_input_pressure
- precision_timing_required
- time_pressure

**補足（SoT）**
- JRPG を基準に締めすぎない
- RPG-assist 由来のみで narrative が立っている場合は ON 固定しない
- Witcher 系は NEAR 寄りを許容

---

### 4.2 story-reading-centered-story（凍結）

**定義**
- 読む・選ぶ・理解する行為が体験の中心
- テキスト量・会話・選択が主な入力

**mustAny（OR）**
- reading_heavy_interaction
- choice_has_consequence
- branching_narrative

**boost**
- narrative_driven_progression
- lore_optional_depth

**ban（確定）**
- automation_core
- optimization_required
- real_time_control（強）
- high_input_pressure
- enemy_density_high
- precision_timing_required
- time_pressure

**代表作（検証済み）**
- Disco Elysium（NEAR）
- The Stanley Parable: Ultra Deluxe（NEAR）
- Pentiment（ON）
- NORCO（ON）
- Citizen Sleeper（NEAR・境界例）

👉 **設計として成立・検証完了・凍結**

---

### 4.3 story-choice-and-consequence

**定義**
- 選択が世界・物語・結末に影響する体験

（※ 本フェーズは次段で検証・調整予定）

---

### 4.4 story-narrative-action（表示名：Story-Driven Play）

**定義**
- 物語進行とアクションが並行して駆動
- 読解より「体験しながら物語が進む」タイプ

（Journey / Reading との差別化は維持）

---

## 5. 検証ステータスまとめ

| Focus | 状態 |
|---|---|
| story-reading-centered-story | ✅ 検証完了・凍結 |
| story-journey-and-growth | 🔧 調整完了（副作用対応済） |
| story-choice-and-consequence | ⏳ 次フェーズ |
| story-narrative-action | ⏳ 横断確認のみ |

---

## 6. 今後の作業順（合意済み）

1. story-journey-and-growth 安定確認（回帰のみ）
2. story-choice-and-consequence 検証（Witcher / BG3 / Mass Effect）
3. Story VIBE 内の primaryFocus 優先順位整理

---

**このドキュメントが唯一の正である。**