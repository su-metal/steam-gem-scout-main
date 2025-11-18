# AGENTS.md

このリポジトリを触るエージェント（Codexなど）向けのメモです。  
「何を目指しているプロジェクトか」「どこを壊さずに改善すべきか」のガイドラインとして使ってください。

---

## 1. プロジェクト概要

- プロジェクト名：**Steam Hidden Gems Finder**
- 目的：
  - Steam 上で「埋もれているけど本当に良いゲーム（Hidden Gems）」を見つけやすくする。
  - ユーザーは検索フォームに頑張って入力するのではなく、
    - ホームに並んだコンテンツ
    - タグのチップ
    - ランキング画面のフィルタ
    を軽く触るだけで「良さそうなタイトル」に自然にたどり着ける体験がゴール。

- 大事なポイント：
  - 「単に高評価な有名作」ではなく、
    - **露出が少ない**
    - **品質が高い**
    - できれば **最近のアップデで化けた**
    作品をきちんと拾うこと。

---

## 2. 技術スタックと構成

### フロントエンド

- React（Vite）
- 主なページ/コンポーネント：
  - `src/pages/Index.tsx`  
    - ホーム。Hidden Gems / Emerging などのレーンを表示。
  - `src/pages/Rankings.tsx`  
    - 本命のランキング画面。  
      フィルタ（期間、価格、レビュー数、プレイ時間、カスタムGemスコアなど）が集中。
  - `src/pages/GameDetail.tsx`  
    - 詳細ページ。AI解析結果（サマリ、Pros/Cons、リスク、Hidden Gem判定）を見せる。
  - `src/components/SearchResultCard.tsx` / `GameCard.tsx`  
    - 一覧カード。Gemスコア、タグ、AIサマリ、バッジなどを表示。

- Supabase クライアント：
  - `@/lib/supabaseClient`
  - 外部 Supabase プロジェクト（`steam-hidden-gems-prod`）に接続。
  - Edge Function （`search-games`, `search-hidden-gems`, `analyze-hidden-gem` など）を叩く。

### バックエンド（Supabase Edge Functions）

- 主要な Edge Functions：
  - `supabase/functions/search-hidden-gems/index.ts`
    - Steam API からゲーム詳細＋レビューを取得。
    - OpenAI でレビュー解析。
    - Hidden Gem 判定 & `game_rankings_cache` に保存。
  - `supabase/functions/search-games/index.ts`
    - `game_rankings_cache` を検索・ソートして、
      ランキング用データを返す（期間フィルタ、ソート、簡易フィルタなど）。
  - `supabase/functions/analyze-hidden-gem/index.ts`
    - （新仕様）レビュー解析専用のAI関数。  
      アップデ前後・最近の状態を意識したフィールドを返すように改良中。

- DB：
  - 外部 Supabase プロジェクト：`steam-hidden-gems-prod`
  - テーブル：`game_rankings_cache`
    - カラム `data` に `RankingGameData` を JSON で保存。
    - 例：
      - `data.appId`
      - `data.title`
      - `data.positiveRatio`
      - `data.totalReviews`
      - `data.estimatedOwners`
      - `data.analysis`（AI解析）
      - `data.gemLabel`（Hidden Gem / Highly rated but not hidden / など）

---

## 3. Hidden Gem の概念と判定

### 3.1 基本コンセプト

Hidden Gem ＝

1. **露出が低い（Hidden）**
2. **ユーザー満足度が高い（Good）**
3. **レビュー内容的にもAIが推せる（Gem）**

### 3.2 数値側の指標（例）

- `positiveRatio >= 85`（高評価率）
- `totalReviews` が少なめ（例：40〜400）
- `estimatedOwners` が少ない（例：〜30,000）
- 最近のレビューの雰囲気が良い（できれば）

### 3.3 AI 側の指標

`analysis` 内に格納するフィールド例：

- `summary`：AIによる短い要約
- `labels`：3〜6個の短いタグ
- `pros` / `cons`：良い点・注意点
- `riskScore`：買って後悔するリスク
- `bugRisk`：クラッシュ・技術的問題の多さ
- `refundMentions`：返金・後悔の言及頻度
- `reviewQualityScore`：レビューの情報量・信頼性

＋ アップデ前後を意識したフィールド（新仕様）：

- `currentStateSummary`：**今のバージョンの体験**の要約
- `historicalIssuesSummary`：過去に多かった問題の要約
- `hasImprovedSinceLaunch`：リリース当初と比べて改善したか
- `stabilityTrend`: `"Improving" | "Stable" | "Deteriorating"`

### 3.4 gemLabel の例

`search-hidden-gems` / `search-games` から返す `gemLabel` は、  
将来的に以下を含む：

- `"Hidden Gem"`  
- `"Improved Hidden Gem"`（昔は微妙だが今は良くなった）
- `"Emerging Gem"`（埋もれ候補）
- `"Highly rated but not hidden"`
- `"Not a hidden gem"`

---

## 4. データフロー

1. **インポート / 更新**
   - `search-hidden-gems` に `appId` or `appIds` を渡す
   - → Steam API（details & appreviews）からデータ取得
   - → OpenAI で解析（`analyzeGameWithAI` または `analyze-hidden-gem` 相当）
   - → `RankingGameData` を組み立てて `game_rankings_cache.data` に upsert

2. **検索 / 表示**
   - フロント（`Index.tsx`, `Rankings.tsx`）から
     - `supabase.functions.invoke("search-games")`
   - → 期間・ソート・フィルタを適用した `RankingGameData[]` を取得
   - → カードや詳細ページで表示

---

## 5. エージェントにお願いしたいこと（方針）

### 5.1 壊してはいけないもの

- `search-games` のレスポンス構造（RankingGameData の形）
- `game_rankings_cache.data` の JSON 型構造（特に主要フィールド名）
- フロントから呼び出している Edge Function 名：
  - `"search-games"`
  - `"search-hidden-gems"`
  - `"analyze-hidden-gem"`（必要に応じて）

**新しいフィールド追加は OK、既存フィールドの削除・大幅な構造変更は NG**。

### 5.2 自由に改善してよいもの

- Steamレビューの取得方法（`filter`, `num_per_page` など）
- AIへのプロンプト設計
- OpenAIレスポンスのパースロジック
- Hidden Gem 判定ロジック内部（ただし返す値の形は維持すること）
- キャッシュの更新戦略（頻度やフォールバックなど）

### 5.3 特に改善したい現状の課題（優先度高）

1. **analysis が空のまま保存されるケースの解消**
   - 原因：レビュー0件 or AIレスポンスパース失敗 → `defaultAnalysis`。
   - ゴール：ほとんどのゲームで `summary` / `labels` / `pros` / `cons` が埋まること。

2. **レビュー取得ロジックの安定化**
   - `filter=recent` に依存しすぎてレビュー0件になりがちだった。
   - 古いタイトル・新作でもちゃんとレビューを取れるようにする。

3. **アップデ前後を考慮した Hidden Gem 判定**
   - `stabilityTrend` / `hasImprovedSinceLaunch` を活かした gemLabel 判定。
   - 「昔ボロボロ、今は神ゲー」パターンをしっかり拾う。

---

## 6. ゴールイメージ

最終的にこのアプリが目指しているのは：

- ユーザーがページを開くだけで、
  - 「最近の Hidden Gems」
  - 「復活した名作」
  - 「埋もれている有望株」
  が、いい感じに並んでいる状態。
- ランキング画面のフィルタは「掘りたい人向けのツール」であり、
  **必須入力ではない**。
- AIの出す `summary` / `pros` / `cons` / `currentStateSummary` が、
  Steamストアを巡回する代わりになるレベルで機能していること。

このゴールに近づくために、  
レビュー取得・AI解析・Hidden Gem ロジックの中身を、壊さず・賢く改善してもらえると嬉しいです。  
コードの具体的な書き方やアルゴリズム詳細は、自由に提案・調整してください。
