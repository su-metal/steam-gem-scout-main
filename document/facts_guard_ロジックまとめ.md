# Facts / Guard / Tuning Summary（現行実装・漏れなし）

このドキュメントは、現時点で実装されている **Facts生成（generate-facts）/ ガード / 競合解決 / narrative保護 / search-gamesでのBand判定** と、これまで入れた **細かいチューニング（DQ系・FF系の詰め）** を「実装準拠」で漏れなく整理したものです。

---

## 0. 全体像（どこで何が起きるか）

### Facts生成（保存まで）
- Supabase Edge Function: `supabase/functions/generate-facts/index.ts`
- 入力: `appId`, `mode=yesno`, `debug`, `force` など
- 出力: DBに保存される `facts[]` と `facts_meta`（監査メタ）

### 判定（検索結果のBand/根拠を作る）
- Supabase Edge Function: `supabase/functions/search-games/index.ts`
- 入力: 選択した `VIBE` / `experienceFocusId` / `debug=1` など
- 出力: `factsMatch`（`selectedFocusBand`, `matchedFacts`, `allFocusBands` など）

---

## 1. FactTagカタログ

- カタログ定義: `facts-v11.ts`
- ここに存在しないタグは保存対象外
  - `catalogMisses` / `rejectedNotInCatalog` に記録

---

## 2. generate-facts（yesno）パイプライン

### 2.1 Steamコーパス構築（監査メタ付き）
- Steam APIから取得した情報を元に LLM コーパス文字列を構築
- 「何をLLMに渡したか」を復元できるように、使用フィールドと文字数を保存

保存される主なメタ
- `steamCorpusFieldsUsed`: `['short_description','about_the_game','genres','categories']`
- `steamCorpusCharCounts`: `{ short_description:..., about_the_game:..., ... }`
- `steamCorpusTotalChars`
- `steamCorpusPreview`（結合プレビュー）
- `previewFields`（フィールド別プレビュー）

狙い
- DQ/FFで narrative が出ない等の原因を「コーパス由来」で切り分け可能にする

---

### 2.2 narrativeトリガー診断（強制ガードの根拠可視化）

- ガードで使うのと同じ matcher で、コーパス中の **narrative trigger** を事前計測

保存されるメタ
- `narrativeTriggerHitCount`
- `narrativeTriggerHits`（例: `narrative_driven_progression:(?:^|\\W)story\\s*:`）

目的
- `narrative_driven_progression` が **forced false** になった理由をログだけで把握できる

---

### 2.3 yes/no 応答の正規化（入力形状ブレ対策）

#### 目的
LLMが **Object** を返しても **配列（string list）** を返しても、タグが欠落しないように
最終的に **FactTag → boolean の完全Map** に必ず正規化する。

#### 取り扱う入力形状
- `ynInputShape: 'object'`（理想）
- `ynInputShape: 'string_list'`（危険：列挙式）
- `ynInputShape: 'unknown'`

#### 監査項目（必須）
- `ynMissingKeys`：LLMが key を省略したタグ（最終的には false 埋めするが「省略」を記録）
- `ynTypeErrors`：true/false 以外の型が出たタグ
- `ynRawPreview`：true扱いになったタグのプレビュー
- `ynOmittedKeyCountApprox`：列挙式などでの省略推定（ある場合）

重要な扱い
- `undefined` は「型エラー」ではなく **missing** として記録する（監査の意味が違う）

---

## 3. 競合解決（normalizeConflicts）

### 3.1 low_pressure_play 競合（Cities: Skylines II）

目的
- `high_input_pressure` / `time_pressure` と `low_pressure_play` の同時成立を排除

ルール
- `high_input_pressure` または `time_pressure` が true のとき
  - `low_pressure_play` を必ず落とす

監査
- `conflictRejected: ['low_pressure_play']`
- `[generate-facts] conflict filtered` ログ（before/after）

適用タイミング
- **guardFactsの前**（guardは正規化後タグを評価）

---

### 3.2 ATB誤爆（FF4の time_pressure）

背景
- FF4等で `time_pressure` が立つ（ATB由来の誤爆の可能性）

方針（これまでの合意）
- 個別タイトル潰しはしない
- normalizeConflicts に入れる場合も **汎用ルールとして成立する範囲のみ**

入れるなら（推測禁止思想に沿う制約）
- コーパス内に `ATB` / `Active Time Battle` 等の **明示語がある場合に限定** して `time_pressure` を落とす

---

## 4. guardFacts（保存前の最終防波堤）

### 4.1 カタログ外排除
- `rejectedNotInCatalog` / `catalogMisses`

### 4.2 Never Persist（派生タグは保存しない）

設計
- 派生Factは **保存しない**（検索側で必要なら都度派生させる）

代表例
- `systems_interaction_depth`

監査
- `rejectedNeverPersist` に記録

---

### 4.3 narrative強制ガード（誤爆最優先で潰す）

対象（例）
- `narrative_driven_progression`
- `branching_narrative`
- `choice_has_consequence`
- `reading_heavy_interaction`
- `lore_optional_depth`

ルール
- Steamコーパスに **明示的トリガー語** が存在しない限り、上記は **falseに強制**

監査
- `narrativeForcedFalse: ['narrative_driven_progression']` など
- `narrativeTriggerHitCount` / `narrativeTriggerHits`

---

## 5. DQ系のチューニング（漏れなく）

### 5.1 DQ3はOK、DQ1&2が落ちがちだった

典型症状
- DQ3（HD-2D）は `narrative_driven_progression` が立ちやすく `story-journey-and-growth` でON
- DQ1&2（HD-2D）は narrative が立たず `battle_loop_core` 等のみで discovery/off

原因の型
- コーパス側に narrative trigger が出ない／パターンに刺さらない
- yes/no 応答の入力形状ブレで key が省略されて落ちる

対処（実装）
- steam corpus の metadata / preview を永続化
- narrative trigger diagnostics を追加
- yes/no を Map 正規化し、`ynMissingKeys` で監査できるようにした

---

### 5.2 story-journey-and-growth の BASE_RULES（現行）

```ts
"story-journey-and-growth": {
  id: "story-journey-and-growth",
  vibe: "story",
  must: ["battle_loop_core", "power_scaling_over_time"],
  boost: [
    "narrative_driven_progression",
    "free_movement_exploration",
    "map_reveal_progression",
    "resource_management",
    "planning_required",
  ],
  ban: [
    "automation_core",
    "systems_interaction_depth",
    "optimization_required",
    "time_pressure",
  ],
},
```

意図
- 王道RPG（DQ/FFなど）を「旅 × 成長」の軸で拾う
- builder/automation/最適化の別軸はbanで誤認定を抑える

---

### 5.3 glossaryBody拡充（battle_loop_core / power_scaling_over_time）

背景
- `battle_loop_core` を追加
- `power_scaling_over_time` を glossaryBody に追記（推測禁止思想で「明示語がある時だけtrue」へ寄せる）

---

## 6. FF系のチューニング（漏れなく）

### 6.1 FF7Rで narrative trigger hit 0 だった

症状
- コーパスに narrative強語（story-driven / narrative / plot 等）が出ず
  `narrativeTriggerHitCount: 0` → story系FocusがOFFになり得た

対処（実装）
- narrativeを「強語トリガー」だけで見ず、弱語もカウントして `narrativeDecision` に反映

監査メタ（例）
- `narrativeStrongHitCount` / `narrativeWeakHitCount`
- `narrativeWeakHitsPreview` / `narrativeStrongHitsPreview`
- `narrativeDecision`（例: `weak_combo`）
- `narrativeDecisionHasRpgSignal`（RPG信号と組み合わせた意思決定）

---

### 6.2 FF4: time_pressure（ATB誤爆）

症状
- `time_pressure` が story-journey-and-growth の ban に入り OFF へ
- narrative も forced false になりやすい

方針
- normalizeConflicts で落とすなら「ATB等の明示語」条件で限定（推測禁止）

---

### 6.3 FF5: optimization_required がbanで落ちる

症状
- must を満たしても `optimization_required` ban で `story-journey-and-growth` がOFF
- `story-narrative-action` がON/nearになるケースもあり得る

姿勢（これまでの合意）
- 個別タイトル潰しはしない
- banの意味（断定ブレーキ）を維持
- 必要なら UI 側で跨りを吸収（Primary/Also fits）

---

## 7. search-games（Band判定）

### 7.1 Derived Facts（保存せず、判定時に派生）
- 例: `systems_interaction_depth`
- 保存済み `facts`（base）から、条件成立時に derived を付与

### 7.2 factsMatchの内容
- `selectedFocusBand`: `on | near | discovery | off`
- `matchedFacts`: `{ must, mustMissing, boost, ban }`
- `allFocusBands`: 同VIBE配下の全Focusの帯（debug用途 / 透明性）

思想
- must は背骨
- ban は除外というより「断定ブレーキ」
- discovery は失敗ではなく「理由がある帯」

---

## 8. UI（SearchResultCard）

現状
- Factsベースの判定パイプ接続済み

残タスク
- debugパネルの表示が旧ロジック由来で残っている可能性があるため、
  **factsMatch由来に統一**して混在を排除する

---

## 9. 回帰テスト（個別潰しを避ける）

推奨
- VIBE配下の各Focusに代表作セット（例: 6 focus × 5 titles）を固定
- そのセットで期待帯が崩れないことを合格ラインにする

---

## 付録: NARRATIVE_TRIGGER_PATTERNS（強語側・抜粋）

```ts
const NARRATIVE_TRIGGER_PATTERNS: Partial<Record<FactTag, RegExp[]>> = {
  narrative_driven_progression: [
    /story[-\\s]?driven/,
    /plot/,
    /narrative/,
    /story[-\\s]?rich/,
    /campaign story/,
    /character[-\\s]?driven/,
    /dialogue[-\\s]?heavy/,
    /visual novel/,
  ],
}
```

※ 弱語（classic / reborn / reimagining 等）は別カウントで `narrativeDecision` に反映。

