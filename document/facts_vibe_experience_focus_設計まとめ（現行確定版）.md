# Facts × VIBE × Experience Focus 設計まとめ（現行確定版）

## 0. このドキュメントの目的

本ドキュメントは、Steam Hidden Gems アプリにおける **分類・探索ロジックの最終設計思想と仕様** を整理し、 次の開発フェーズ（Facts 自動生成パイプライン / Story・Chill 検証）に **前提共有用の一次資料** として使うことを目的とする。

---

## 1. 旧仕様からの変更点（転換の要旨）

### 1-1. 旧仕様（AI解析オーバーラップ判定）の限界

- FeatureLabel / aiTags など、レビュー要約起点の AI 解析結果を使って
  - VIBE
  - Experience Focus
  - ON / NEAR / DISCOVERY を **重なり（オーバーラップ）** で判定していた
- しかし AI 解析は揺れが避けられず、
  - 同系統作品でラベルが付いたり付かなかったりする
  - レビュー抽出の偶然でラベルが落ちる などにより **本来出るべきタイトルが脱落** する問題が発生

### 1-2. 新仕様（Facts Band 主導）への転換

- 判定の主役を「AI解析のラベル重なり」から **Facts（事実）** に移す
- 具体的には、
  - Facts（Yes/No で確定するタグ）
  - FocusRules（must/boost/ban）
  - MatchBand（on/near/discovery/off） で ON/NEAR/DISCOVERY を **Factsだけで導出**

### 1-3. AI解析の位置づけ（廃止ではなく再配置）

- AI 解析（レビュー要約・pros/cons・audience fit）は **Experience Layer** として維持
- ただし、
  - VIBE / Experience Focus 判定の根拠
  - ON/NEAR/DISCOVERY の主因 には使わない
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

- automation\_core
- optimization\_required
- job\_simulation\_loop
- systems\_interaction\_depth
- resource\_management
- real\_time\_control
- stealth\_core
- logical\_puzzle\_core

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

## 5. Facts 自動生成（generate-facts）仕様と実装ロジック（次フェーズ）

### 5-1. 目的とスコープ

- **目的**：appId ごとに Facts（Yes/No の事実タグ）を生成し、
  `game_rankings_cache.data.facts` 直下へ保存する。
- **スコープ**：Facts のみ（レビュー要約・pros/cons など Experience Layer は対象外）
- **設計原則**：
  - 旧仕様の FeatureLabel / aiTags オーバーラップ判定へ戻らない
  - Facts は **再生成可能・説明可能（evidence）** である
  - Facts Band（on/near/discovery/off）の根拠は Facts のみ

---

### 5-2. Edge Function API 仕様

**Endpoint**

- `POST /functions/v1/generate-facts`

**Request body**

```json
{
  "appId": 427520,
  "force": false,
  "sources": ["steam"],
  "debug": false
}
```

- `appId`：必須
- `force`：true の場合、既存 facts があっても上書き
- `sources`：現時点は `steam` のみを正式サポート（将来 `official`, `store_ps`, `store_ms`, `egs`, `wiki`, `igdb` を拡張）
- `debug`：true の場合、収集したコーパスの概要・却下理由などを返す（※保存は通常と同じ）

**Response（成功）**

```json
{
  "appId": 427520,
  "saved": true,
  "facts": {
    "version": "v1.1",
    "tags": ["automation_core", "optimization_required"],
    "evidence": {
      "automation_core": [
        {
          "source": "steam.about",
          "quote": "Build and automate...",
          "confidence": 0.78
        }
      ]
    },
    "sources": {
      "steam": {
        "fetchedAt": "2025-12-14T00:00:00.000Z",
        "appDetailsOk": true
      }
    },
    "generatedAt": "2025-12-14T00:00:00.000Z",
    "model": "gpt-4.1-mini",
    "notes": "facts-only"
  }
}
```

**Response（スキップ）**

- 既に facts があり `force=false` の場合

```json
{ "appId": 427520, "saved": false, "reason": "already-exists" }
```

**Response（失敗）**

- `400`：不正リクエスト（appId なし / 型不一致）
- `404`：Steam から appDetails が取れない等（※将来 multi-source で復旧可能）
- `500`：予期せぬエラー

---

### 5-3. DB 保存仕様（game_rankings_cache.data 直下）

- 保存先：`game_rankings_cache.data.facts`
- 既存 `data` を壊さず **facts だけをパッチ**（JSONB merge）

**保存フォーマット（推奨）**

- `version`：facts catalog のバージョン（例：`v1.1`）
- `tags`：FactsTag の配列（カタログ外は不可）
- `evidence`：タグごとの根拠（最低 1件）
- `sources`：どのソースをいつ取得したか
- `generatedAt`：生成時刻
- `model`：使用モデル

※ evidence はユーザー表示しないが、**デバッグと説明責任のため必須**。

---

### 5-4. 実装ファイル構成（想定）

- `supabase/functions/generate-facts/index.ts`（新規）
- `supabase/functions/_shared/facts-v11.ts`（既存：FactsTag カタログ / FocusRules / MatchBand）
- `supabase/functions/_shared/openai.ts`（既存があれば流用：OpenAI 呼び出しラッパ）

---

### 5-5. 実装ロジック（ステップ詳細）

#### Step 0: 入力検証

- `appId` が number / parseable か
- `force` / `debug` は boolean か
- `sources` は許可リスト内か（現時点 `steam` のみ）

#### Step 1: 既存 facts の有無チェック

- `game_rankings_cache` を `appId` で検索（または `steam_games`→appId→cache の関係に合わせる）
- `data.facts` が存在し、`force=false` なら **skip**

#### Step 2: Facts 用コーパス収集（最小の一次情報）

現時点は Steam を一次ソースとし、以下を集める。

- Steam Store API（appdetails）
  - `short_description`
  - `about_the_game`
  - `supported_languages`（言語情報は補助）
  - `categories`, `genres`（補助）
- 可能なら追加取得（HTML を直接 fetch して抽出する場合）
  - ストアページの「Features」相当テキスト（※将来）

**コーパスの正規化**

- HTML 除去・空白圧縮
- 文字数上限（例：合計 12k〜20k chars）
- 重複除去

#### Step 3: LLM 入力（Facts 専用・厳格 JSON）

**ポイント**

- LLM は「検索」ではなく **分類器 + 根拠抽出器**
- Temperature は 0（再現性優先）
- 出力はカタログ内タグのみ（isFactTag ガード）

**LLM に渡すもの**

- FactsTag カタログ（タグ名のみ＋短い定義）
- 収集したコーパス（steam short/about + genres/categories）
- 出力 JSON スキーマ

**出力要件**

- `tags`：採用タグのみ
- `evidence`：採用タグごとに最低1つ
  - `source`：`steam.short` / `steam.about` / `steam.genres` など
  - `quote`：根拠となる短い抜粋（25語以内目安）
  - `confidence`：0〜1（任意。あっても判定には使わない）

#### Step 4: サーバー側ガード（揺れ・幻覚の遮断）

- タグ正規化：lowercase / trim
- カタログ外タグは drop
- evidence が無いタグは drop（= **根拠なき Facts を禁止**）
- tags 数の上限（例：最大 18〜24）
- 同義重複の抑制（必要なら後で追加：priority/cap）

#### Step 5: 保存（JSONB patch）

- `data` を丸ごと差し替えず `facts` キーだけ更新
- upsert 方式（appId をキーにするか、既存行 update）

保存後、search-games は `factsMatch` を計算しレスポンスに乗せる。

---

### 5-6. デバッグと運用

- `debug=true` のとき
  - 収集コーパスの文字数
  - 採用/却下タグ一覧（却下理由：unknown_tag / missing_evidence など）
  - 主要 evidence の一覧
  を返す（※DB保存は通常通り）

- 失敗の典型
  - Steam 取得失敗（年齢制限 / 地域制限 / 一時エラー）
  - コーパスが薄すぎる（説明が短い）

この場合は **Facts を増やす** ではなく、
まず **ソースを増やす（official/store）** が優先。

---

### 5-7. 重要な注意（品質）

- Facts はユーザー非表示でも、
  - 誤って付く
  - 付くべきが落ちる
  は ON/NEAR 判定に直撃するため、**ここが品質の根幹**。
- そのため generate-facts は
  - 根拠必須
  - カタログガード
  - 温度0
  の三点を絶対に崩さない。

---

### 5-8. 次の作業（B採用：Focus検証→他VIBEへ展開）

1) generate-facts を 3タイトルで回す（Factorio / RimWorld / Supermarket Simulator）
2) FactsTag の不足を「タグ追加」ではなく「情報源追加」優先で評価
3) Focus が安定したら Story → Chill の順で同じ枠組みに展開

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
3. FACT\_TAGS v1.2 の最小拡張検討

---

この設計は、 **気分で探す UI** と **事実ベースの内部ロジック** が乖離しないことを最優先に構築されている。

