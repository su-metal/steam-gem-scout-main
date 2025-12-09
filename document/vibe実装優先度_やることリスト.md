# VIBE / FeatureLabel / Experience Focus 実装優先度つきやることリスト

---

## STEP1: タクソノミー（分類体系）を確定する

**目的：** 後から構造を変えなくて済むように、ゲーム分類の“土台”をロックする。

1. **FeatureLabel 25個の最終決定**
   - `feature-labels.ts` の `export type FeatureLabel = ...` を最終形にする。
   - 「増やす / 減らす / 名前変える」はここでやり切る。

2. **Experience Focus ↔ FeatureLabel 対応表を定義する**
   - 例：`experienceFocusConfig.ts` のようなファイルに、以下を定義する：
     - `vibe: "Chill", focus: "Gentle Exploration" → ["Gentle Exploration"]`
     - `vibe: "Short", focus: "Run-Based Roguelike" → ["Run-Based Roguelike"]`
   - Any の場合は「その VIBE に属する FeatureLabels すべて」を指すようにする。

3. **VIBE 5種類を固定**
   - Chill / Story / Focus / Speed / Short を最終決定。
   - 今後名前や数は変えない前提で進める。

---

## STEP2: aiTags → FeatureLabels 変換を完成させる

**目的：** すべてのゲームに対して安定して FeatureLabels が付く状態を作る。

1. `feature-labels.ts` の `mapAiTagsToFeatureLabels` を整理
   - aiTags の入力前提を「**25個の正式スラッグ ＋ 互換用ゆらぎキー**」にする。
   - ゆらぎキー（例：`"story rich"`, `"turn-based"`, `"atmospheric"`）は過去データ吸収用。

2. **aiTags の“正式スラッグ25個”を決める**
   - 例：
     - `story_driven`
     - `character_drama`
     - `mystery_investigation`
     - `emotional_journey`
     - `lore_worldbuilding`
     - `cozy_life_crafting`
     - `gentle_exploration`
     - `light_puzzle`
     - `relaxed_building`
     - `ambient_experience`
     - `turn_based_tactics`
     - `deckbuilding_strategy`
     - `grand_strategy`
     - `automation_factory_strategy`
     - `colony_management`
     - `action_combat`
     - `precision_shooter`
     - `rhythm_music_action`
     - `sports_arena`
     - `high_intensity_roguelike`
     - `run_based_roguelike`
     - `arcade_action`
     - `arcade_shooter`
     - `short_puzzle`
     - `micro_progression`
   - FeatureLabel と 1:1 で対応させる。

3. **analyze-game のプロンプト / JSON schema を修正**
   - 「aiTags は上記スラッグからのみ選べ」の節を追加する。
   - 可能なら JSON schema で `enum: [ ...25スラッグ... ]` としてガチガチに縛る。

> ここまでできると：
> - 新規解析されたゲームは必ず 25スラッグのどれかを aiTags に持つ。
> - `mapAiTagsToFeatureLabels` がほぼ100% FeatureLabels を返す。

---

## STEP3: FeatureLabels の保存パイプラインを安定させる

**目的：** 解析結果の FeatureLabels が必ず DB に保存される状態にする。

1. `supabase/functions/analyze-game/index.ts`
   - OpenAIレスポンスから `aiTags` を取得。
   - `mapAiTagsToFeatureLabels(aiTags)` で `featureLabels` を得る。
   - `analysis.featureLabels = featureLabels` を必ずセットする。

2. `game_rankings_cache.feature_labels` に保存
   - `upsert` 時の payload に `feature_labels: analysis.featureLabels ?? []` を追加。
   - NULL ではなく空配列を基本とする。

3. `publish-steam-games` の同期ロジック確認
   - `analysis.featureLabels` → `game_rankings_cache.feature_labels` へ
   - 重複削除・ソートなどが必要ならこの段階で実施。

4. Supabase で実データ確認
   - `SELECT app_id, feature_labels FROM game_rankings_cache LIMIT 20;` を実行。
   - 2〜5個程度のラベルが実際に入っていることを確認。

---

## STEP4: search-games に VIBE / Focus / FeatureLabels を組み込む

**目的：** バックエンドの検索精度ロジックを完成させる。

1. `supabase/functions/search-games/index.ts` にて：
   - `feature_labels` を SELECT 対象に含める。
   - 型定義（例：`CachedGameRow`）に `feature_labels: string[] | null` を追加。
   - クライアントに返すゲームオブジェクトに `featureLabels: string[]` を含める。

2. **VIBE × FeatureLabel 相性マトリクスを実装**
   - 例：
     ```ts
     type Vibe = "Chill" | "Story" | "Focus" | "Speed" | "Short";

     const VIBE_MATRIX: Record<Vibe, Partial<Record<FeatureLabel, number>>> = {
       Chill: {
         "Cozy Life & Crafting": 1.0,
         "Gentle Exploration": 1.0,
         "Light Puzzle": 0.8,
         "Relaxed Building": 1.0,
         "Ambient Experience": 1.0,
       },
       // ... Story / Focus / Speed / Short も同様に定義
     };
     ```

3. **Mood Scores（5軸）によるVIBE補正ロジックを追加**
   - 例：
     - Chill: tensionが低いほど +, operationが低いほど +
     - Story: storyが高いほど +
     - Focus: brainが高いほど +
     - Speed: tension + operation が高いほど +
     - Short: sessionが短いほど +

4. **総合スコア計算に組み込む**
   - 既存の baseScore / matchScore / qualityScore などに加えて：
     ```ts
     const vibeScore = calcVibeScore({
       featureLabels: game.featureLabels,
       moodScores: game.mood_scores,
       selectedVibe,
       selectedFocus,
     });

     totalScore += vibeScore * VIBE_WEIGHT; // ウェイトはあとで調整
     ```

5. **Experience Focus の反映**
   - ユーザーが Focus を選んでいる場合：
     ```ts
     const focusLabels = getFeatureLabelsForFocus(selectedVibe, selectedFocus);

     const matchesFocus = game.featureLabels.some((label) =>
       focusLabels.includes(label as FeatureLabel)
     );

     if (matchesFocus) {
       totalScore += FOCUS_MATCH_BONUS; // 大きめのボーナス
     }
     ```

---

## STEP5: フロントエンドでの可視化＆UX調整

**目的：** ユーザーに「なぜこのゲームが出てきたか」を伝え、体験を気持ちよくする。

1. **SearchPage / GameDetail で FeatureLabels を可視化**
   - 開発中は `console.log(appId, title, featureLabels);` で中身をチェック。
   - 本番では：
     - Search結果カードに 1〜3個の FeatureLabel をチップ表示（例：`Story-Driven / Turn-Based Tactics`）。
     - GameDetail のムードパネルに VIBE / Focus / FeatureLabels / MoodScores をセットで表示。

2. **VIBE → Experience Focus UI の最適化**
   - VIBEボタン → Focusボタンの導線を見直し。
   - Any選択時は「そのVIBEの世界観でゆるく探す」動きになるようにする。

3. **検索結果の体感調整**
   - 実際にいくつかのシナリオで検索：
     - Chill × Gentle Exploration
     - Focus × Turn-Based Tactics
     - Short × Run-Based Roguelike
   - 「出てほしいタイトル」が上に来るように VIBE_WEIGHT / FOCUS_MATCH_BONUS を調整。

---

## まとめ

- **先に変えると致命傷になる層（タクソノミー）をロックする**
- 次に **aiTags → FeatureLabels → DB保存** を安定させる
- そのあとで **search-games のスコアロジックに VIBE / Focus / FeatureLabels / Mood を統合**
- 最後に **UI（SearchPage / GameDetail）で体験として仕上げる**

この順番で進めると、手戻りを最小限にしつつ、段階的に「ちゃんと賢い気分検索」を完成させられる。