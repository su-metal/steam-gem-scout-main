# Facts ガード＆判定ロジックまとめ（現時点の実装ベース / Source of Truth）

本ドキュメントは、現時点で実装されている **Facts 生成 → ガード → Band 判定（ON/NEAR/DISCOVERY/OFF）→ UI表示** に関わる仕組みを、**コード改変や設計追加をせず**に整理したもの。

---

## 0. 用語

- FactTag: ゲームの体験特性を表すタグ（例: automation_core, narrative_driven_progression 等）
- facts（persisted facts）: DBに保存され、判定の根拠として使う FactTag 配列（または boolean map の true 群）
- facts_meta: 生成・正規化・ガードの監査情報（ログとデバッグ用メタデータ）
- Experience Focus（EF）: VIBE 配下の具体的な体験タイプ（例: story-journey-and-growth）
- Band: EFごとの判定帯（on / near / discovery / off）

---

## 1. 主要ファイル（今回の対象）

- Facts カタログ: `facts-v11.ts`
- Facts 生成（Edge Function）: `supabase/functions/generate-facts/index.ts`
- 検索結果の判定（Band算出・debug出力）: `supabase/functions/search-games/index.ts`（※実装箇所は環境により異なるが、debug=1 の `factsMatch/allFocusBands` 生成はここ側）
- UI表示（カード）: `SearchResultCard`（今後UI側はここで表示を確定）

---

## 2. Facts 生成パイプライン（generate-facts）

### 2.1 入力ソース

- 現状の主要ソースは Steam Store API corpus
- corpus 生成は `short_description`, `about_the_game`, `genres`, `categories` を束ねて作成

#### 追加の監査ログ

- `[generate-facts] steam corpus`
  - fieldsUsed
  - charCounts
  - totalChars
  - preview と previewFields（切り詰めた内容）

---

### 2.2 yesno モードの正規化

- `mode=yesno` では「FactTag -> boolean」の **完全な boolean map** を構築して保存・ガードへ渡す
- LLM がキーを省略しても、最終的に **全 FactTag が boolean で埋まる**

#### 入力形状の吸収

- LLM が
  - object（{ tag: true/false }）を返しても
  - string list（["tagA","tagB"] だけ）を返しても
  
最終的には **yesnoFacts map** を構築する

#### 監査用メタデータ（facts_meta）

- ynInputShape: object / list 等（実際に受け取った形）
- ynMissingKeys: LLM が返さなかったキー（undefined は type error ではなく missing 扱い）
- ynTypeErrors: boolean 以外など、型が不正な値のみ
- ynRawPreview: true と判定された tags のプレビュー（または抽出結果のプレビュー）

#### 重要な狙い

- LLM の「省略」や「list返し」によって、facts が **欠落・揺らぎで消える**のを防止
- 保存される facts の安定性を担保

---

### 2.3 コンフリクト正規化（normalizeConflicts）

目的: 同時に立ちにくい FactTag の **衝突**を、判定前に決定的に解消する

現時点で導入済みの例:

- `low_pressure_play` は、`high_input_pressure` または `time_pressure` が true のとき除去

#### 出力

- conflictRejected: 衝突解消で落としたタグ

#### 監査ログ

- `[generate-facts] conflict filtered { ... }`
  - before/after などの情報をログ

---

### 2.4 guardFacts（保存のガード）

目的: LLM が出した rawTags を、そのまま保存しない

ガードは以下の観点でフィルタリングを行う:

- rejectedNotInCatalog: facts-v11 カタログに存在しないタグは落とす
- rejectedNeverPersist: 「保存しない」と決めた FactTag は落とす
- rejectedNoEvidenceRequired: Evidence を要求するタグで、根拠が不十分な場合に落とす（運用ポリシーに依存）
- keptWithoutEvidence: 証拠なしでも保存OKとして通したタグ（運用ルール）

#### ガード差分ログ

- `[generate-facts] guard diff`
  - rawTags
  - guardedTags
  - rejectedNotInCatalog
  - rejectedNeverPersist
  - rejectedNoEvidenceRequired
  - keptWithoutEvidence

---

### 2.5 narrative 系の診断（narrative triggers）

目的: `narrative_driven_progression` が出ない / forced false になった時に、原因を即見える化

- NARRATIVE_TRIGGER_PATTERNS に基づき corpus を正規表現で走査

ログ:

- `[generate-facts] narrative triggers`
  - narrativeTriggerHitCount
  - narrativeTriggerHits（tag:regex の形式で preview）

加えて、弱いシグナルも別で数える実装が入っている（narrativeWeakHits 等）

facts_meta には以下が入りうる:

- narrativeDecision（例: none / weak_combo など）
- narrativeForcedFalse（強制で false にした場合のタグ）
- narrativeWeakHitCount / narrativeStrongHitCount
- narrativeWeakHitsPreview / narrativeStrongHitsPreview
- narrativeDecisionHasRpgSignal（genres/categories 等から RPG シグナルが立ったか）

---

## 3. facts_meta に残るもの（監査の目的）

facts_meta は「判定の根拠」を人間が追えるようにするためのメタ。

主要キー（現状）:

- rawTags: LLM が最終的に true としたタグ（または抽出タグ）
- acceptedTags: 正規化・コンフリクト後に受理されたタグ（ガード前後の位置づけは実装に依存）
- ynInputShape / ynMissingKeys / ynTypeErrors / ynRawPreview
- conflictRejected
- keptWithoutEvidence / rejected* 系
- steamCorpusFieldsUsed / steamCorpusCharCounts / steamCorpusTotalChars / steamCorpusPreview
- narrativeTriggerHitCount / narrativeTriggerHits / narrativeDecision / narrativeForcedFalse など

---

## 4. Band 判定（search-games 側）

### 4.1 BASE_RULES

Experience Focus ごとに

- must: 満たさないと ON/NEAR に行けない背骨
- boost: あると ON に近づく推進力
- ban: 断定（ON）を止めるブレーキ

を定義している

### 4.2 判定出力（debug=1）

`factsMatch` で返す内容（現状）:

- experienceFocusId
- selectedFocusBand
- matchedFacts:
  - must（満たした must）
  - mustMissing（不足 must）
  - boost（当たった boost）
  - ban（当たった ban）
- factsCount
- allFocusBands（同一VIBE内の各EFの band を一覧で返す）

※ debug=1 のときに `allFocusBands` が出る運用になっている

---

## 5. UI表示（SearchResultCard）

### 5.1 現状の前提

- 表示はまだ混在の可能性があったが、現在は **facts ベースのパイプが接続済み**（ユーザー確認済み）
- ただしデバッグの文言や一部表示が旧ロジックの名残を持つ可能性があるため、段階的に置換中

### 5.2 debug 表示

- debug===1 のとき
  - must/boost/ban/mustMissing
  - allFocusBands
  を出す

### 5.3 Primary / Also fits

- Story配下で ON が複数出ることを仕様として許容
- UI側で
  - Primary 1つ
  - Also fits 1〜2
  のように圧縮して提示する方針

※ ロジック側の判定純度は維持し、UIで吸収する

---

## 6. 既知の「設計上のルール」

- ban は「除外」ではなく「断定を止めるブレーキ」
- ban 発火時:
  - ON には行かせない
  - NEAR または DISCOVERY に落とす
- DISCOVERY は失敗ではなく「意図して作る帯」

---

## 7. 最低限の回帰テスト（運用推奨）

- 個別潰しはやらない
- 各EFに代表作を数本ずつ決めて、帯が崩れていないかを見る
- 代表セットが合格したら前に進む

---

## 8. 未確定・要注意ポイント（メモ）

- time_pressure の誤爆（ATB 等）を normalizeConflicts で扱うかは設計判断が必要
- optimization_required の誤爆も同様（ピクセルリマスター系など）
- genres/categories などの "tags" を Facts の補助として使うのは可能だが、検索エンジン化の副作用に注意

