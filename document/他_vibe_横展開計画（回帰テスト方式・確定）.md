# 他 VIBE 横展開計画（回帰テスト方式・確定）

本ドキュメントは、**Story VIBE で確立した回帰テスト方式・設計判断を、
他 VIBE（Chill / Focus / Action / Short）へ横展開するための実行計画**をまとめたものである。

本計画は **設計健全性の検証を最優先**とし、
個別タイトル救済・場当たり的調整は行わない。

---

## 0. 横展開の前提（Story で確立した原則）

以下は **全 VIBE 共通ルール**として適用する。

- 完璧主義を捨てる（回帰テスト合格ラインで止める）
- 個別タイトル最適化は禁止
- Facts は緩く、Band 判定は厳密
- ON / NEAR / DISCOVERY の分布が直感から大きく外れなければ OK
- Primary / AlsoFits は UI 整理用（ロジック正否には使わない）

---

## 1. 横展開の進め方（共通フロー）

### 1.1 検証単位

- **1 VIBE ごとに実施**
- 各 VIBE 配下の Experience Focus すべてを対象

### 1.2 回帰テスト方式

- 各 Experience Focus につき **代表作 5 本**を選定
- 代表作セットで以下を確認

**合格ライン**
- 想定 Focus が ON または NEAR
- 他 Focus が ON でも直感的に納得できる
- ban 誤爆で全落ちしない

---

## 2. 各 VIBE の横展開優先度

### 優先度 A（Story と構造が近い）

1. **Chill**
   - Story で確立した low_pressure / pause_friendly / non_hostile の扱いを流用できる

2. **Focus**
   - planning / optimization / logical 系 ban・boost の検証が主目的

### 優先度 B

3. **Action**
   - high_input_pressure / precision_timing / enemy_density の境界確認

4. **Short**
   - session_based_play / low_commitment の整理

👉 推奨順：**Chill → Focus → Action → Short**

---

## 3. 各 VIBE で特に注意すべき論点

### 3.1 Chill

- low_pressure_play が ban によって誤爆しないか
- automation / optimization が混入して Chill が壊れないか

### 3.2 Focus

- planning_required / optimization_required の must / boost バランス
- story / chill 系が誤って ON にならないか

### 3.3 Action

- high_input_pressure の過剰 ban による Story Action 破壊
- precision_timing_required の強度

### 3.4 Short

- session_based_play が
  - discovery に落ちすぎないか
  - 他 VIBE に吸われすぎないか

---

## 4. 成果物（各 VIBE ごと）

各 VIBE で以下を生成する。

- Experience Focus 定義（must / mustAny / boost / ban）
- 代表作 5 本 × Focus の検証ログ
- 問題がなければ **VIBE 単位で凍結**

---

## 5. 進行ルール

- 問題が出ても即修正しない
- パターン再現を確認してから一般ルールとして調整
- 修正後は必ず Story への回帰影響を確認

---

## 6. 次のアクション

1. **Chill VIBE から開始**
2. Chill 配下 Experience Focus の洗い出し
3. 各 Focus の代表作 5 本を選定

---

（作成日: 2025-12-16）