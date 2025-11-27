# AGENTS.md（最新版 / 2025-11 更新）

本ファイルは、本プロジェクト内の LLM / 開発者（エージェント）が参照する  
**全体設計ガイドライン**です。  
最新仕様・気分スライダー・可変スコア軸・Hidden Gem ロジックのすべてを統合しています。

---

# 1. プロジェクト概要

## ■ プロジェクト名
**Steam Hidden Gems Finder → Steam Mood & Gems Explorer（仮）**

## ■ 現在のコンセプト（2025）
プロジェクトは当初「埋もれた良作発掘アプリ」だったが、現在は以下の形へ進化：

> **その日の気分 × 自分に刺さる体験 × 隠れた名作要素**  
> ――これらを掛け合わせて、“自分だけの名作”を発掘するアプリ。

目的は以下の4点：

1. **気分スライダーによる Mood Fit 検索**
2. **AI による「どんな人に刺さるか」解析**
3. **Hidden / Improved / Emerging などの隠れ度分類**
4. **ゲームごとに異なる「可変スコア軸」可視化**

---

# 2. ユーザー体験のゴール

- トップページの気分スライダーを動かすだけで「今日の気分に合うゲーム」が並ぶ
- ゲームカードには **“どんな人に刺さるか”バッジ** が表示される
- Hidden / Improved / Emerging のレーンで埋もれた良作も発掘可能
- GameDetail では
  - 今の状態
  - 過去の問題
  - 改善傾向  
  を AI が読み解いた内容がまとめて表示される

---

# 3. 技術構成（最新版）

## ■ フロントエンド（React / Vite）
主要ページ：

- **Index.tsx**  
  - 気分スライダー（常時 3軸 + Advanced 2軸）
  - Quick Filters（気分プリセット）
  - Hidden / Improved / Emerging レーン表示

- **Rankings.tsx**
  - Mood Match ソート対応
  - 隠れ度 / 期間 / 価格 / レビュー数フィルタ

- **GameDetail.tsx**
  - currentStateSummary（今の状態）
  - historicalIssuesSummary（過去の問題）
  - stabilityTrend（改善・安定・悪化）
  - audiencePositive / Negative（刺さるユーザー像）

- **SearchResultCard / GameCard**
  - 気分フィットスコア
  - 可変スコア軸（Hidden / Quality / Mood / Comeback など）
  - “どんな人に刺さるか” バッジ表示

---

## ■ バックエンド（Supabase Edge Functions）

- `import-steam-games`  
  - steam_games → game_rankings_cache へコピー  
  - Steam API は叩かない  
  - analysis を上書きするか選択可能

- `search-games`  
  - mood_scores を含む RankingGameData を返す
  - ソート & フィルタ処理

- `analyze-hidden-gem`
  - Review を OpenAI で解析し analysis フィールドを生成
  - current/historical の2軸モデルで解析

---

# 4. 気分スライダー設計（Mood Sliders）

アプリの主軸となる 5 軸。

```
1. operation（Passive ↔ Active）
2. session（Short ↔ Long）
3. tension（Cozy ↔ Intense）
4. story（Play-focused ↔ Narrative）
5. brain（Simple ↔ Deep）
```

## ■ ゲーム側の MoodVector 生成
- Steam タグ → 重みテーブル（TAG_TO_MOOD）→ 生スコア
- normalize（0〜1）
- AI解析のテキスト（summary / pros / cons / labels）から ±0.15〜0.25 補正

## ■ ユーザー側 MoodVector
- スライダー値 0〜4 → 0〜1 に正規化

## ■ マッチングスコア
`calcMoodMatchScore(game, user)` により 0〜1 の一致度を算出  
Rankings では moodMatch に応じて並び替え可能。

---

# 5. AI解析（“今と昔”モデル）

analysis の構造：

- summary  
- pros / cons  
- labels  
- audiencePositive / Negative（刺さる人像）
- currentStateSummary  
- historicalIssuesSummary  
- hasImprovedSinceLaunch  
- stabilityTrend（Improving / Stable / Deteriorating / Unknown）

### ■ 役割
- 詳細ページの説明（今の状態 vs 過去の問題）
- 隠れ度分類  
- 気分スコア補正  
- “どんな人に刺さるか” UI の生成

---

# 6. Hidden Gem 概念の現在位置づけ

Hidden Gem は “可変スコア軸の 1 つ” として扱う。

### gemLabel 候補
- Hidden Gem  
- Improved Hidden Gem  
- Emerging Gem  
- Highly Rated but Known  
- Not a Hidden Gem

Hidden だけでなく、  
**Mood Fit・Quality・Comeback・Niche** といった複数軸で総合判断する。

---

# 7. 可変スコア軸（Dynamic Scoring Axes）

各タイトルは以下の複数の軸を持ち、  
**そのタイトル固有に重要な軸だけを UI に出す**。

## ■ 軸一覧

- Hidden Score（埋もれ度）
- Quality Score（品質）
- Mood Fit Score（気分一致）
- Comeback Score（改善度）
- Niche / Polarizing Score（好みの分かれやすさ）
- Stability / Polish Score（完成度）
- Innovation Score（独自性）

## ■ 特徴
- タイトルごとに「強い軸」が異なる
- GameCard では **強い軸3つだけ表示**（例：Hidden + Quality + Mood）
- Steam では見えない独自指標として差別化

---

# 8. 「どんな人に刺さるか」バッジ（Audience Profile Badges）

AI解析の `audiencePositive` から作成。

### 重要ルール
- **ジャンル名の言い換えは禁止（例：デッキ構築好き）**
- **ゲーム固有の“体験”に基づく**ユーザー像を書く
  - 例：
    - 「テンポの速い反応戦が気持ちいい人」
    - 「位置取りを詰めて勝つのが好きな人」
    - 「景観や雰囲気を静かに味わいたい人」
    - 「ビルド最適化が楽しい人」

UI：
- GameCard に 1〜3 個のバッジで表示
- GameDetail で詳細説明

---

# 9. データフロー（最新）

```
Steam API → steam_games（倉庫）
     ↓
import-steam-games → game_rankings_cache（ランキング）
     ↓
search-games → mood_scores + 可変スコア軸で一覧返却
     ↓
GameDetail → 必要時のみ analyze-hidden-gem を実行
```

ポイント：

- **AIコスト最適化**：analysis が null のときのみ実行
- **隠れ度分類・可変スコア・気分一致度はすべてキャッシュから利用**

---

# 10. エージェントに守ってほしいこと

## ■ 壊してはならない部分
- RankingGameData の基本構造
- analysis のキー名（summary, pros, cons, …）
- mood_scores の 5 軸構造
- gemLabel の仕様
- Edge Function の I/O 形式

## ■ 改善して良い部分
- AIプロンプト
- タグ→気分軸重み
- 可変スコア軸の計算式
- 刺さる人像の記述精度
- Quick Filter のプリセット内容

## ■ 特に優先すべき
- AI解析の安定化（empty 回避）
- 気分×AI補正ロジックの精度向上
- GameCard の差別化（可変軸 3つ表示）
- audiencePositive の質改善

---

# 11. 今後の発展

- 「あなたの刺さり傾向」ページ（嗜好プロファイル）
- 気分スライダーの国際化（JP/EN）
- 体験ベクトルのレーダーチャート可視化
- Hidden / Mood / Quality の総合 “おすすめスコア” 追加

---

# ✔ 以上が最新版の AGENTS.md です
これをプロジェクトの **中央ドキュメント**として利用してください。
