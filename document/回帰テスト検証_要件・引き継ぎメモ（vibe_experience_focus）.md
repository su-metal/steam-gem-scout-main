# 回帰テスト検証 要件・引き継ぎメモ（VIBE × Experience Focus）

本ドキュメントは、新規チャットで **VIBE × Experience Focus × Facts 判定ロジック** の健全性を検証するための
**回帰テスト（代表作セット検証）** を行う際の要件定義・引き継ぎメモである。

---

## 1. この検証の目的（Why）

- 「全タイトルで完璧」を目指さない
- 個別タイトル潰しではなく、**設計全体が壊れていないか**を確認する
- Facts / Base Rules / Guard / Band 判定の **設計的な健全性チェック** が目的

このアプリは検索エンジンではなく **発見体験ツール** であり、
判定の多少の揺らぎは許容される前提である。

---

## 2. 検証方針（全体）

### 採用方針

- 各 VIBE × 各 Experience Focus ごとに
  **代表作を 5 本ずつ選定**
- その代表作群で、以下が成立していれば合格とする

### 最小合格ライン

- ON / NEAR / DISCOVERY の帯が
  - 直感と大きく乖離していない
  - 特定 Focus に極端に吸い寄せられていない
- ON が複数出る場合でも、
  - Primary / Also fits の整理で UI が破綻しない

👉 **30 本（Storyのみ）ではなく、最終的には全 VIBE で同様に行うが、
　新規チャットではまずこの方式を前提として検証を進める**

---

## 3. 対象構成（前提知識）

### VIBE 一覧

- Chill
- Story
- Focus
- Action
- Short

### Story 配下 Experience Focus（6）

- story-narrative-action
- story-journey-and-growth
- story-reading-centered-story
- story-mystery-investigation
- story-choice-and-consequence
- story-lore-worldbuilding

※ 他 VIBE も同数構成だが、本検証方法を横展開する前提

---

## 4. 検証対象（How）

### 各 Focus ごとに行うこと

1. 代表作 5 本を選定
2. 各タイトルについて以下を確認

#### 確認項目

- facts_meta.acceptedTags
- narrative / power_scaling / battle_loop 系の出方
- factsMatch
  - selectedFocusBand
  - matchedFacts.must / mustMissing / boost / ban
  - allFocusBands
- UI 表示
  - Primary
  - Also fits

---

## 5. 合否判断の考え方（重要）

### OK とする例

- 想定 Focus が ON、他が NEAR / DISCOVERY
- 想定 Focus が NEAR だが、別 Focus が ON（跨りとして納得できる）
- ON が複数出るが、Primary が直感通り

### NG とする例

- 想定 Focus がすべて OFF
- 明らかに別系統の Focus だけが ON
- 特定 ban（例: optimization_required, time_pressure）が
  大量誤爆して Story 系を落としまくる

※ NG が出た場合でも **即修正しない**
→ パターンとして再現性があるかを見る

---

## 6. 重要な設計前提（必ず守る）

- Facts をねじ曲げてタイトルを救済しない
- 「FF専用」「DQ専用」ルールは作らない
- RPG だから narrative / power_scaling がある、という推測は禁止
- 修正は必ず **一般ルール** として効くもののみ

---

## 7. 既に入っている重要チューニング（引き継ぎ）

### Narrative 系

- 強 / 弱トリガー分離
- RPG シグナル補助（narrativeDecisionHasRpgSignal）
- lore 単体ヒットでは narrative_driven_progression に昇格しない

### Power Scaling

- 明示語必須（level up / XP / stats / skills / equipment upgrade 等）
- "RPGだから" 推測は禁止

### Conflict 正規化

- high_input_pressure / time_pressure がある場合
  - low_pressure_play を自動除外
- ATB 由来の time_pressure 誤爆対策を導入済み

### Story Journey & Growth

- battle_loop_core + narrative_driven_progression を must
- automation / optimization / systems 系は ban

---

## 8. UI 側の前提（検証時に混同しない）

- 左上の「VIBE × Focus」は **ユーザー選択の表示**
- Band（ON / NEAR / DISCOVERY）は Facts ベース
- Primary / Also fits は
  - 複数 ON を UI で整理するための後段処理
  - ロジックの正否判断には使わない

---

## 9. 新規チャットでの最初の指示テンプレ

```
これから VIBE × Experience Focus の回帰テストを行います。

前提：
- Facts / Base Rules / Guard は現行仕様を正とする
- 個別タイトル最適化は禁止
- 各 Focus につき代表作 5 本で検証

まずは Story 配下 6 Focus それぞれについて
代表作候補を 5 本ずつ提案してください。
```

---

## 10. ゴール

- 「この設計でいける」という腹落ち
- 完璧ではないが、
  **発見体験ツールとして破綻していない** 状態

ここまで来たら、次は
- UI 微調整
- チューニングを止めて運用フェーズへ

---

（このドキュメントは Source of Truth として保持する）

