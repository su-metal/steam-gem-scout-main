# 気分検索アプリのコア設計まとめ（VIBE / Experience Focus / Feature Labels / Mood軸）

---

## 1. レイヤー構造の全体像

このアプリの検索ロジックは、**3階層 + 補助軸**で構成される：

1. **VIBE（5種類）**
   - ユーザーが最初に選ぶ「気分」の入口
   - Chill / Story / Focus / Speed / Short

2. **Experience Focus（各VIBEごとに5種類 + Any）**
   - 「その気分の中で、どんな方向性で遊びたいか」という第二階層
   - VIBEを“用途別”に分割する中間カテゴリ

3. **Feature Labels（25種類）**
   - AI解析結果を基にゲームに付与される、体験ベースのラベル
   - 検索ロジックの心臓部。ここでゲームを仕分ける

4. **Mood Scores（5軸）**
   - brain / story / tension / session / operation
   - FeatureLabelsで表現しきれない「強度・負荷・時間感覚」を数値で補正

**重要な前提：**
- ゲームの“分類本体”はあくまで **Feature Labels** で行う
- **VIBEはユーザーの入口**であり、「Feature Labelsの集合として決まる結果」
- Experience Focus は **Feature Labels ↔ VIBE をつなぐ中間階層**

---

## 2. 各レイヤーの役割

### 2-1. VIBE（5種類）

- Chill（Zen Mode）
- Story（Narrative）
- Focus（Tactical）
- Speed（Adrenaline）
- Short（Quick Run）

**役割：**
- ユーザーの「気分・モード」を決める最上位の入口
- 検索ロジック的には **"結果として付与されるスコア"**
- AIが直接 VIBE を決めるのではなく、
  **Feature Labels + Mood Scores から逆算して決まる**

---

### 2-2. Experience Focus

各 VIBE には、次の Experience Focus が紐づく：

#### Chill（Zen Mode）
- Cozy Life & Crafting
- Gentle Exploration
- Light Puzzle
- Relaxed Building
- Ambient Experience
- Any

#### Story（Narrative）
- Story-Driven
- Character Drama
- Mystery & Investigation
- Emotional Journey
- Lore / Worldbuilding
- Any

#### Focus（Tactical）
- Turn-Based Tactics
- Deckbuilding Strategy
- Grand Strategy
- Automation / Factory Strategy
- Colony Management
- Any

#### Speed（Adrenaline）
- Action Combat
- Precision Shooter
- Rhythm / Music Action
- Sports & Arena
- High-Intensity Roguelike
- Any

#### Short（Quick Run）
- Run-Based Roguelike
- Arcade Action
- Arcade Shooter
- Short Puzzle
- Micro Progression
- Any

**役割：**
- UI上の第二階層。
  - VIBE だけでは広すぎるので、
  - 「この気分の中で何をやりたいか？」をユーザーに選ばせる
- 検索ロジックでは：
  - **選ばれた Experience Focus に対応する FeatureLabel を“強く優遇”する**
  - 例：Chill + Gentle Exploration を選んだら、
    `FeatureLabels` に `"Gentle Exploration"` を含むゲームのスコアを大きく加点

---

### 2-3. Feature Labels（25種類）

ゲーム体験の“本体”を表す25ラベル。

**Chill 系**
- Cozy Life & Crafting
- Gentle Exploration
- Light Puzzle
- Relaxed Building
- Ambient Experience

**Story 系**
- Story-Driven
- Character Drama
- Mystery & Investigation
- Emotional Journey
- Lore / Worldbuilding

**Focus 系**
- Turn-Based Tactics
- Deckbuilding Strategy
- Grand Strategy
- Automation / Factory Strategy
- Colony Management

**Speed 系**
- Action Combat
- Precision Shooter
- Rhythm / Music Action
- Sports & Arena
- High-Intensity Roguelike

**Short 系**
- Run-Based Roguelike
- Arcade Action
- Arcade Shooter
- Short Puzzle
- Micro Progression

**役割：**
- ゲームを実際に“分類”する主軸
- AI解析で得られた `aiTags` から `feature-labels.ts` の辞書経由でマッピング
- search-games では `feature_labels` 配列として扱う

---

### 2-4. Mood Scores（5軸）

- brain   : 思考負荷・認知負荷
- story   : 物語没入度
- tension : 緊張感・テンション
- session : プレイ時間の長さ（短い〜長い）
- operation: 操作密度（忙しさ）

**役割：**
- Feature Labels で表現しきれない「強度」「負荷」「時間感覚」を補う
- ゲームの VIBE スコアを微調整する
- 例：
  - Chill：tension が低いほど +、operation が低いほど +
  - Speed：tension が高いほど +、operation が高いほど +
  - Focus：brain が高いほど +
  - Story：story が高いほど +
  - Short：session が短いほど +

---

## 3. ゲーム解析から検索までのフロー

### 3-1. 解析フェーズ（analyze-game）

1. レビュー・ストア情報を AI で解析
2. AI が以下を出力：
   - `aiTags`（内部用スラッグ）
   - `summary` / `pros` / `cons` / `audience...` など
   - `mood_scores`（brain/story/tension/session/operation）
3. `aiTags` → `FeatureLabels` に変換：

```ts
const aiTags: string[] = ...; // AIの生タグ
const featureLabels: FeatureLabel[] = mapAiTagsToFeatureLabels(aiTags);
```

4. 結果を DB `game_rankings_cache.feature_labels` に保存。

---

### 3-2. 検索フェーズ（search-games）

1. クライアントからの入力：
   - VIBE（必須）
   - Experience Focus（任意、デフォルト Any）
   - 詳細フィルタ（ジャンル、価格、期間、レビュー数など）

2. DB からゲームを取得：
   - `feature_labels`（text[]）
   - `mood_scores`（JSON）

3. スコアリングの流れ：

   1. **FeatureLabels ↔ VIBE 相性マトリクス** で、各 VIBE のスコアを計算
   2. Mood Scores（5軸）で各 VIBE を補正
   3. ユーザーが選んだ VIBE と最も近いゲームを優先
   4. Experience Focus が指定されていれば：
      - 対応する FeatureLabel を持つゲームに大きく加点

4. スコア順に並べて SearchPage に返す。

---

## 4. VIBEスコアの考え方（概要）

### 4-1. FeatureLabels → VIBE の相性マトリクス

各 FeatureLabel が、各 VIBE とどの程度“相性が良いか”を 0〜1 で定義する。

例：

- Chill
  - Cozy Life & Crafting: 1.0
  - Gentle Exploration:   1.0
  - Light Puzzle:         0.8
  - Relaxed Building:     1.0
  - Ambient Experience:   1.0

- Speed
  - Action Combat:        1.0
  - Precision Shooter:    1.0
  - Rhythm / Music Action:1.0
  - Sports & Arena:       0.8
  - High-Intensity Roguelike: 1.0

…というマトリクスを 25×5 で持つ。

### 4-2. VIBEスコアの式（イメージ）

```ts
// featureLabels: ゲームが持つFeatureLabelの配列
// VIBE_MATRIX[vibe][label]: 相性0〜1

for each vibe in [Chill, Story, Focus, Speed, Short]:
  base = Σ( VIBE_MATRIX[vibe][label] ) for label in featureLabels
  moodAdj = calcMoodAdjustment(vibe, mood_scores)
  vibeScore[vibe] = base + moodAdj
```

そのうえで：

- ユーザーが選んだ VIBE = `selectedVibe`
- `vibeScore[selectedVibe]` の高いゲームほど上位に表示

---

## 5. Experience Focus の検索スコア反映

### 5-1. Focus指定がある場合

例：
- VIBE: Chill
- Experience Focus: Gentle Exploration

search-games 内では：

```ts
const focusLabel = "Gentle Exploration";

if (game.featureLabels に focusLabel が含まれる) {
  score += FOCUS_MATCH_BONUS; // かなり大きめの加点
} else {
  score -= FOCUS_MISS_PENALTY; // or 0
}
```

### 5-2. Any の場合

- 特定の FeatureLabel を優遇しない
- その VIBE に属する FeatureLabels 全体を均等に見てスコアリング

---

## 6. 役割の切り分け（最重要ポイント）

- **Feature Labels（25）**
  - ゲームの体験を分類する “本体ロジック”
  - AI解析結果から辞書マッピングで決める

- **Experience Focus**
  - FeatureLabels を UI/検索用にまとめた「用途別カテゴリ」
  - 検索時に「どのFeatureLabelを優先するか」を決める

- **VIBE（5）**
  - ユーザーの入口となる「気分」
  - FeatureLabels & MoodScores からスコアとして算出する

- **Mood Scores（5軸）**
  - 体験の“強度”や“負荷”を調整する補助パラメータ
  - VIBEスコアの微調整に使う

---

## 7. 今後の実装ポイント（メモ）

1. `feature-labels.ts`：
   - aiTags → FeatureLabels マッピング辞書の整備
   - aiTagsは今後「許可された25スラッグのみ」を出すようプロンプトで制御

2. analyze-game：
   - aiTagsを必ず出力させるようプロンプト/JSON schemaを調整
   - mapAiTagsToFeatureLabelsを適用し、feature_labelsをDBに保存

3. search-games：
   - FeatureLabels ↔ VIBE相性マトリクスの実装
   - MoodScoresとの統合ロジック
   - VIBE + Experience Focus を考慮したスコアリング

4. フロント（SearchPage / GameDetail）：
   - VIBE → Experience Focus → 結果のUX
   - GameDetailでのVIBE/Focus/FeatureLabelsの表示方法

