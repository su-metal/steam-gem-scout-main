# Story VIBE × Experience Focus Source of Truth（確定版）

本ドキュメントは、**Story VIBE 配下の Experience Focus に関する唯一の正（Source of Truth）** として、
回帰テスト完了後の確定仕様をまとめたものである。

- 本内容は **実装・検証済み**
- 個別タイトル最適化は含まない
- 今後の調整は、本 SoT を前提に行う

---

## 0. Story VIBE の思想（再確認）

Story VIBE は「物語を体験する」こと自体が主目的のゲーム群を扱う。

- アクション量・RPG構造・ジャンルは問わない
- **プレイヤーの関心が物語・意味・展開に向くか**を重視
- 厳密な分類ではなく、
  - ON / NEAR / DISCOVERY の帯による *発見体験* を優先する

---

## 1. Story 配下 Experience Focus 一覧（確定）

- story-narrative-action
- story-journey-and-growth
- story-reading-centered-story
- story-mystery-investigation
- story-choice-and-consequence
- story-lore-worldbuilding

（全 6 Focus。今後増減する場合は別途 SoT 更新）

---

## 2. Focus 別 確定ルール概要

### 2.1 story-narrative-action

**定義**
- リアルタイム操作・戦闘・ステルスなどを伴いながら
- 物語が主軸として進行する体験

**must**
- narrative_driven_progression

**boost（代表例）**
- real_time_control
- battle_loop_core
- stealth_core
- high_stakes_failure

**ban**
- なし（※強い systems 系は他 Focus 側で抑制）

**代表作（検証済み）**
- The Last of Us Part I
- A Plague Tale: Requiem
- NieR: Automata
- God of War (2018)

---

### 2.2 story-journey-and-growth

**定義**
- キャラクターの変化・成長・旅路が中心

**must**
- battle_loop_core
- narrative_driven_progression

**ban（代表）**
- automation_core
- optimization_required

（※本 Focus は今回の検証対象外。別途回帰テスト予定）

---

### 2.3 story-reading-centered-story

**定義**
- 読む・選ぶ・理解する行為が体験の中心
- テキスト量・会話・選択が主な入力

**mustAny（OR 条件）**
- reading_heavy_interaction
- choice_has_consequence
- branching_narrative

**boost**
- narrative_driven_progression

**ban（確定）**
- automation_core
- optimization_required
- real_time_control（強）
- high_input_pressure
- enemy_density_high
- precision_timing_required
- time_pressure（※将来 soft-ban 検討余地あり）

**代表作（検証済み）**
- Disco Elysium（NEAR）
- The Stanley Parable: Ultra Deluxe（NEAR）
- Pentiment（ON）
- NORCO（ON）
- Citizen Sleeper（NEAR・境界例）

👉 設計として **成立・凍結可能**

---

### 2.4 story-mystery-investigation

**定義**
- 謎解き・調査・情報の再構築が中心

（※今回 AlsoFits としてのみ検証。詳細ルールは次フェーズで確定）

---

### 2.5 story-choice-and-consequence

**定義**
- 選択が明確に分岐・結果を生む体験

**must**
- choice_has_consequence

（※reading-centered と跨るケースを想定）

---

### 2.6 story-lore-worldbuilding

**定義**
- 世界観・設定・背景理解が主目的

**must**
- lore_optional_depth

（※本 Focus は今回未検証）

---

## 3. 判定ロジック上の重要確定事項

### 3.1 mustAny の導入

- reading-centered において
  - 単一 must を強制しない
  - OR 条件で成立させる

→ 軽量タイトル〜重テキスト作品まで幅を持って拾える

### 3.2 yn → evidence 化

- yn で YES と判定されたタグは
  - evidence-required を満たす証拠として扱う
- Steam 文言と yn の **ハイブリッド証拠構造**

→ Disco / Stanley 系の脱落問題を解消

### 3.3 Primary / AlsoFits の扱い

- 複数 ON / NEAR が出ることを前提
- Primary は UI 表示用の整理概念
- Facts / Band 判定の正否とは切り離す

---

## 4. 現時点での凍結方針

- Story VIBE 配下 Focus は
  - reading-centered を含め **全体として健全**
- 個別救済・例外ルールは追加しない
- 次の作業は
  - 他 VIBE への横展開
  - または UI / Discovery 体験の磨き込み

---

（確定日: 2025-12-16）