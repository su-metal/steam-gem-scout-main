# Facts × VIBE × Experience Focus

本ドキュメントは、本プロジェクトにおける **Facts / VIBE / Experience Focus** に関する **唯一の正とする設計ドキュメント（Source of Truth）** である。

コード・実装・議論が分岐した場合は、**必ず本ドキュメントに立ち返る**。

---

## 1. 本アプリの思想（最重要）

このアプリは **検索エンジンではなく「発見体験ツール」** である。

- 正解のジャンル分類を当てに行かない
- ユーザーの「今の気分・体験したいこと」を起点にする
- AIの表現力は殺さないが、**判定は壊さない**

そのために、以下の二層構造を採用する。

```
保存は保守的（Facts）
判定は柔軟（Experience Focus）
```

---

## 2. 用語定義

### 2.1 VIBE（最上位概念）

UIの入口として使われる「気分の方向性」。

```ts
chill | story | focus | action | short
```

- VIBE自体はスコアリングの主役ではない
- Experience Focus を選ぶための **ナビゲーション軸**
- 「合う／合わない」を断定しない

---

### 2.2 Fact（Facts / Feature Tags）

ゲームに **存在するか否か** を判定する事実タグ。

#### 例

- automation\_core
- resource\_management
- planning\_required
- narrative\_driven\_progression
- high\_input\_pressure

#### 性質

- true / false のみ
- 強い意味論は持たせない
- **保存対象の最小単位**

Facts は以下の関数で生成される。

```
Supabase Edge Function: generate-facts
```

---

### 2.3 Experience Focus

VIBE 配下にある **具体的な体験タイプ**。

例：

- focus-base-and-systems
- focus-optimization-builder
- focus-battle-and-growth

Experience Focus は **Facts の組み合わせ** によって判定される。

---

## 3. Facts 生成パイプライン

### 3.1 generate-facts（Edge Function）

Facts を生成・保存する唯一の入口。

#### モード

- `mode: "tags"`（旧方式）
- `mode: "yesno"`（現在の主力）

---

### 3.2 yes/no モード（現在の正）

#### 仕様

- 各 FactTag を **true / false** で明示的に判定
- 型が壊れていた場合は正規化して false に倒す
- 正規化時の型エラーは debug/metadata に記録

#### narrative 系 Fact の扱い

以下は **強制ガード対象**：

- narrative\_driven\_progression
- branching\_narrative
- choice\_has\_consequence
- reading\_heavy\_interaction
- lore\_optional\_depth

Steam の本文・説明文に **明示的な物語トリガー語** が存在しない限り、 **必ず false に強制** される。

---

### 3.3 guardFacts

Facts を保存する前の最終フィルタ。

- カタログ外タグの除外
- evidence 要求のあるタグの検証
- narrative 誤爆の最終防止

⚠️ **派生タグはここでは扱わない**

---

## 4. Experience Focus 判定パイプライン

### 4.1 search-games

Experience Focus 判定を行う API。

```
Supabase Edge Function: search-games
```

---

### 4.2 派生 Fact（Derived Facts）

#### systems\_interaction\_depth

- **保存されない Fact**
- 判定時のみ一時的に注入される
- DB / API レスポンスには含めない

#### 派生条件（保守的）

以下の組み合わせが成立した場合のみ付与される。

- automation\_core
- resource\_management
- planning\_required
- optimization\_required
- high\_stakes\_failure / time\_pressure

---

### 4.3 判定フロー

```
1. 保存済み Facts → baseFactSet
2. 条件を満たせば derivedFactSet に派生タグ追加
3. computeBand(derivedFactSet) で評価
4. レスポンスには baseFacts を表示
```

#### Debug 時のみ

- derivedAdded
- derivedSatisfiedMust

を可視化する。

---

## 5. Experience Focus ルール（BASE\_RULES）

### focus-base-and-systems

```ts
{
  id: "focus-base-and-systems",
  vibe: "focus",
  must: ["systems_interaction_depth"], // 派生で満たされる前提
  boost: [
    "resource_management",
    "planning_required",
    "automation_core",
  ],
  ban: ["high_input_pressure"],
}
```

---

### focus-optimization-builder

```ts
{
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
}
```

---

## 6. Band 判定（ON / NEAR / DISCOVERY / OFF）

Experience Focus は以下の4段階で返される。

- **ON**：今の気分にかなり合う
- **NEAR**：条件次第で合う
- **DISCOVERY**：発見枠（意外性）
- **OFF**：表示しない／抑制

⚠️ いずれも **断定ではなく提案**

---

## 7. スコアと依存関係（概要）

- Facts → Experience Focus
- VIBE はフィルタ・ナビゲーション用途
- moodScore / qualityScore / nicheScore は Experience Focus 判定とは独立

Experience Focus は **UI体験を壊さないための補助軸** であり、 スコアの上書きは行わない。

---

## 8. 最後に

この設計は「正解を当てる」ためのものではない。

**ユーザーが納得して次のゲームに出会うための構造** である。

ロジックが迷子になったら、必ずここに戻ること。

