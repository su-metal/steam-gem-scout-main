# Facts × VIBE × Experience Focus 設計まとめ（現行確定版）

## 0. このドキュメントの目的

本ドキュメントは、Steam Hidden Gems アプリにおける **分類・探索ロジックの最終設計思想と仕様** を整理し、
次の開発フェーズ（Facts 自動生成パイプライン / Story・Chill 検証）に **前提共有用の一次資料** として使うことを目的とする。

---

## 1. 旧仕様からの変更点（転換の要旨）

### 1-1. 旧仕様（AI解析オーバーラップ判定）の限界

- FeatureLabel / aiTags など、レビュー要約起点の AI 解析結果を使って
  - VIBE
  - Experience Focus
  - ON / NEAR / DISCOVERY
  を **重なり（オーバーラップ）** で判定していた
- しかし AI 解析は揺れが避けられず、
  - 同系統作品でラベルが付いたり付かなかったりする
  - レビュー抽出の偶然でラベルが落ちる
  などにより **本来出るべきタイトルが脱落** する問題が発生

### 1-2. 新仕様（Facts Band 主導）への転換

- 判定の主役を「AI解析のラベル重なり」から **Facts（事実）** に移す
- 具体的には、
  - Facts（Yes/No で確定するタグ）
  - FocusRules（must/boost/ban）
  - MatchBand（on/near/discovery/off）
 で ON/NEAR/DISCOVERY を **Factsだけで導出**

### 1-3. AI解析の位置づけ（廃止ではなく再配置）

- AI 解析（レビュー要約・pros/cons・audience fit）は **Experience Layer** として維持
- ただし、
  - VIBE / Experience Focus 判定の根拠
  - ON/NEAR/DISCOVERY の主因
 には使わない
- 目的は「揺れても価値になる領域」だけに AI を閉じ込めること

---

## 2. 基本思想（最重要）

### 1-1. このアプリは「検索」ではなく「発見」

- 厳密ジャンル検索は Steam 本体が最適解
- 本アプリは **気分・体験ベースでの偶然的発見** を提供する
- 多少の雑多さ・揺れは体験価値として許容
- ただし **明確に間違った混入は許容しない**

---

## 2. レイヤー構造（役割分離）

### 2-1. Facts Layer（事実・揺れない）

**役割**
- ゲームが「何をしているか」を事実ベースで表す
- 再現性・説明責任を最優先

**特徴**
- AI に自由記述させない
- Yes / No 判定のみ
- 将来的に何度でも再生成可能
- ユーザーには非表示

**例**
- automation_core
- optimization_required
- job_simulation_loop
- systems_interaction_depth
- resource_management
- real_time_control
- stealth_core
- logical_puzzle_core

Facts は **Experience Focus 判定の唯一の根拠** となる。

---

### 2-2. VIBE（入口・気分）

**役割**
- ユーザーが最初に選ぶ「今の気分」
- UI上の探索入口

**仕様**
- 1タイトルにつき Primary VIBE は1つ
- ただし検索入口としては複数 VIBE から到達可能

**VIBE一覧（確定）**
- Chill：緊張しない／安心
- Story：文脈・物語体験
- Focus：思考・管理・最適化
- Action：身体性・緊張感
- Short：短時間・区切り

VIBE は **Facts から導出** される（感覚的分類ではない）。

---

### 2-3. Experience Focus（体験の軸）

**役割**
- VIBE 内での体験の違いを言語化
- ユーザーが「どんな感じの体験か」を直感的に想起できる名前

**仕様（重要）**
- 1 VIBE に 5 Focus
- 1タイトルにつき **選択対象 Focus は1つ**
- 複数 ON は不可
- 判定は Facts のみを使用

---

## 3. Experience Focus 判定ロジック

### 3-1. Facts Band 判定（主役）

Experience Focus ごとに以下を定義：

- must: 必須 Facts
- boost: 加点 Facts
- ban: 除外 Facts

**判定結果は4段階**
- ON
- NEAR
- DISCOVERY
- OFF

この結果を **factsMatch.selectedFocusBand** として保持する。

---

### 3-2. FeatureLabelV2 ベースの score について

- 既存の experienceFocusScore は **保持**
- ただし **判定の主役ではない**
- コメント用途・履歴比較用として残す

※ 将来不要になれば即削除可能なよう、明確に役割を分離

---

## 4. Focus VIBE 設計（確定）

### Focus Experience Focus 一覧

- Battle & Growth
- Tactics & Planning
- Base & Systems
- Optimization / Builder
- **Operational Sim**（旧 Simulation）

### Operational Sim の定義

**意味**
- 「手を動かして運用する」シミュレーション
- 仕事・作業・オペレーションのループ

**含まれる例**
- Euro Truck Simulator
- Farming Simulator
- Supermarket Simulator

**含まれない例**
- Europa Universalis
- 信長の野望（→ Strategy / Tactics 側）

---

## 5. Facts 自動生成（次フェーズ）

### 方針

- analyze-game とは完全分離
- 指定 appId に対して Facts のみを生成
- LLM は分類器としてのみ使用

### API 想定

```
POST /functions/generate-facts
{
  "appId": 427520,
  "force": true
}
```

結果：
- game_rankings_cache.data.facts に upsert
- search-games 側は自動反映

---

## 6. 設計上の重要な制約

- 例外（タイトル個別補正）は作らない
- 境界が曖昧な場合は DISCOVERY に逃がす
- Facts が足りない場合は設計ではなく Facts を増やす
- ラベル名はジャンル名より **体験想起を優先**

---

## 7. 次チャットでやること

1. generate-facts API の仕様確定
2. Facts 判定用 LLM プロンプト設計（Yes/No）
3. FACT_TAGS v1.2 の最小拡張検討

---

この設計は、
**気分で探す UI** と **事実ベースの内部ロジック** が乖離しないことを最優先に構築されている。

