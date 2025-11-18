# Steam Hidden Gems Finder — アプリ仕様まとめ

## 🎯 アプリの目的
Steam 上に存在する **埋もれた良作（Hidden Gems）** を、ユーザーが簡単に発見できるようにする。

- ユーザーが頑張って検索しなくても、アプリを開くだけで“良作候補”が自然に並ぶようにする。
- レビュー解析 + メタデータ + AI の総合判断で、人の目だけでは気づきにくいゲームを拾い上げる。
- “高評価だけど有名すぎるゲーム” ではなく、**本当に埋もれた作品**にフォーカスする。

---

## 🧩 全体構成

### フロントエンド（React / Vite）
- **Index.tsx**：ホーム。Hidden Gems や Emerging Gems のレーンを表示。
- **Rankings.tsx**：フィルタ・ソートによるリスト表示。
- **GameDetail.tsx**：AI 解析情報を詳細に提示。
- **SearchResultCard.tsx / GameCard.tsx**：一覧カード。
- 外部 Supabase（steam-hidden-gems-prod）を使用。

### バックエンド（Supabase Edge Functions）
- **search-hidden-gems**：Steam からタイトルを取得 → AI解析 → DBにキャッシュ。
- **search-games**：cached データを期間・ソート・フィルタで返す。
- **analyze-hidden-gem**：AI解析単体（アップデ前後を考慮したモデル）。

---

## 🗄 保存データ構造（RankingGameData）
- appId
- title
- positiveRatio
- totalReviews
- estimatedOwners
- price
- tags
- analysis（AI解析）
- gemLabel（後述）
- releaseDate / lastUpdated
- isStatisticallyHidden

---

## 🧠 Hidden Gem 判定の考え方

### 1. **統計的に“隠れている”か？（Hidden）**
- totalReviews が少ない
- estimatedOwners が少ない（例：50,000 以下）
- “認知度が高すぎるタイトル”は Hidden Gem とは扱わない

### 2. **プレイヤー満足度が高いか？（Good）**
- positiveRatio が高い（例：85%以上）
- recentReviews での雰囲気も良い
- メタスコア等あれば補助的に利用

### 3. **AI 解析で推せるゲームか？（Gem）**
AI によるレビュー内容解析と品質指標：
- summary：1〜2文の要約
- labels：3〜6個の短い属性ラベル
- pros：ポジティブ点
- cons：注意点
- reviewQualityScore（レビューの情報量）
- bugRisk（技術的リスク）
- refundMentions（返金言及数）
- riskScore（全体的な後悔リスク）

### 4. **アップデ前後の状態も考慮（新仕様）**
AI による進化モデル：
- currentStateSummary（今の状態）
- historicalIssuesSummary（過去の問題）
- hasImprovedSinceLaunch（改善したか）
- stabilityTrend：Improving / Stable / Deteriorating

---

## 🏷 gemLabel（表示用ラベル）
AI解析 + 統計 + 最新状態を組み合わせて生成。

- **Hidden Gem**：統計的に隠れていて、評価も高く、AIが強く推している
- **Improved Hidden Gem**：昔は微妙だったがアップデで復活した
- **Emerging Gem**：評価は高いがデータが少なく“有望株”的存在
- **Highly rated but not hidden**：高評価だが埋もれてはいない
- **Not a hidden gem**：基準に該当しない

---

## 🔍 検索・フィルタリング機能

### 期間フィルタ（recentDays）
- Past 7 days / 30 days / 60 days / 90 days（デフォルト）/ 180 days / All time
- "All time" の場合はフィルタ解除

### ソート
- positive-ratio
- most-reviews
- newest
- recommended（AI推奨強め）
- custom（ユーザーの重み付けによる Gem Score）

### クライアントフィルタ（予定）
- AI が「Yes」判定のみに絞る
- 高リスク作品（riskScore高）を除外

---

## 🏠 ホーム画面の方向性
ユーザーがアクセスした瞬間に「良作候補」が自然と目に入る設計。

- Hidden Gems
- Improved Hidden Gems
- Emerging Gems
- トレンドに近いタイトルを軽くレコメンド

検索主体ではなく “発見主体” の UI / UX を目指す。

---

## 📌 今後の改善予定
- GameDetail の AI 情報表示強化（今の状態 vs 過去の問題）
- gemLabel をカードでリッチに表示
- ホームのレコメンド枠を追加
- タグによる探索をより自然に

---

必要に応じて、この仕様書は随時アップデートできます。

