# 気分プリセット / Sub Vibes 〜 search-games 〜 表示までの一連の流れ

このドキュメントは、トップページでユーザーが「気分プリセット」と「Sub Vibes」を選択してから、
実際に Search 結果や GameDetail に「マッチ度」が表示されるまでの一連のつながりをまとめたものです。

---

## 1. トップページ（Index.tsx）

### 1-1. ユーザーが操作する要素

- **Primary Vibes（プリセットの5種類）**
  - `Chill / Focus / Story / Speed / Short`
  - それぞれ内部的には 5軸（brain/story/session/tension/operation）のベースベクトルを持つ

- **Sub Vibes（7種類）**
  - `Cozy / Emotional / Difficult / Puzzle-lite / Atmospheric / Humor / Strategic`
  - 最大3つまで選択可能
  - 4つ目を押すと「一番古い選択」が押し出される（キュー方式）

### 1-2. 今後の設計方針

- トップでは「どのプリセットを選んだか」と「どの Sub Vibes を選んだか」を決める。
- それを `/search` に **router の state 経由で渡す**：
  - `primaryVibePreset`（例: "Chill"）
  - `subVibes`（例: ["cozy", "emotional"]）
- 5軸ベクトル `desired_mood` の計算自体は、SearchPage（またはその近辺）で行う。

---

## 2. SearchPage.tsx

### 2-1. これまでの実装

- `useLocation()` で何も受け取っていない。
- すべての検索条件を **自分の state + localStorage** から復元している。
  - `userMood`（5軸スライダー）
  - `selectedGenre`, `selectedPeriod`, `selectedSort`, `maxPrice`, `minReviews`, `minPlaytime` など
- `userMood` は `DEFAULT_MOOD` または `localStorage("rankings_userMood")` から初期化される。

### 2-2. Supabase 関数 search-games の呼び出し

- `fetchRankings` 関数内で、次のように `search-games` を実行しているイメージ：

```ts
const { data, error } = await supabase.functions.invoke("search-games", {
  body: {
    genre: selectedGenre || "",
    recentDays: selectedPeriod || "",
    sort: selectedSort,
    minReviews,
    minPlaytime,
    maxPrice,
    userMood, // ← ここが気分ベクトル
  },
});
```

- `useEffect` の依存配列に各種フィルター + `userMood` が入っており、
  それらが変化するたびに `fetchRankings()` が実行され、`search-games` が再実行される。

### 2-3. 今後の変更ポイント

- `useLocation()` でトップページから渡された state を受け取る：

```ts
type SearchLocationState = {
  userMood?: MoodVector;          // 将来的にここに desired_mood を直接入れてもよい
  primaryVibePreset?: string;     // "Chill" | "Focus" | ...
  subVibes?: string[];            // ["cozy", "emotional", ...]
};
```

- 受け取った `primaryVibePreset` と `subVibes` から、
  サブ Vibes 仕様書の関数（例：`computeDesiredMood`）で 5軸ベクトル `desired_mood` を生成する。

- 生成した `desired_mood` を `userMood` の初期値、もしくは上書き値として使い、
  それをそのまま `search-games` に渡す。

---

## 3. Supabase 関数 `search-games`（supabase/functions/search-games）

### 3-1. 役割の全体像

- フロントから渡された条件をもとに、
  - `game_rankings_cache`（＋ストア情報テーブル）から候補ゲームを取得
  - 各ゲームに対して「ベーススコア」「気分マッチ度」「最終スコア」を計算
  - それらを並び替えて SearchPage に返す

### 3-2. 受け取るパラメータ

- `genre`（ジャンルフィルタ）
- `recentDays`（期間フィルタ）
- `sort`（並び替え：マッチ順 / 価格順 / 新しい順など）
- `minReviews`（最低レビュー数）
- `minPlaytime`（最低プレイ時間）
- `maxPrice`（価格上限）
- `userMood`（0〜4のスライダー or 0〜1スケールの5軸ベクトル）

### 3-3. userMood の正規化

- フロントから来る `userMood` が 0〜4 スライダーの場合、
  `slidersToUserMood` のような関数で 0〜1 のベクトルに変換：

```ts
const VIBE_MAX = 4;

const slidersToUserMood = (sliders) => {
  const to01 = (v) => {
    const raw = Number.isFinite(v) ? v : 2;
    return Math.min(1, Math.max(0, raw / VIBE_MAX));
  };
  return {
    operation: to01(sliders.operation),
    session:   to01(sliders.session),
    tension:   to01(sliders.tension),
    story:     to01(sliders.story),
    brain:     to01(sliders.brain),
  };
};
```

- ここで作られた 5軸ベクトルが、サーバー側で扱う「ユーザー気分ベクトル」になる。

### 3-4. game_rankings_cache からのデータ取得

- `game_rankings_cache` から、
  - レビュー数 / 所有者推定数 / 価格 / セール / 平均プレイ時間 / リリース年
  - `data.scores`（quality / niche / hidden / comeback / innovation）
  - `data.mood_scores`（各ゲームの 5軸ベクトル）
  - AI解析の JSON（current state / historical issues など）

 などを SELECT して、候補ゲームのリストを作る。

### 3-5. ベーススコアの計算

- レビュー関連や所有者数・価格・プレイ時間・リリース年などを 0〜1 に正規化
- 重み付き合計で 0〜100 の `baseScore` を出す
- これは「Hidden Gem 度」「人気」「適切なボリューム感」などを総合したスコア

### 3-6. 気分マッチ度（moodScore）の計算

- ここで `_shared/mood.ts` 内のロジックが使われる。
- `userMood`（ユーザーの 5軸ベクトル）と、各ゲームの `mood_scores` を比較する。
- 比較方法は「重み付きユークリッド距離」：

```ts
const MOOD_WEIGHTS = {
  operation: 1.1,
  session:   1.0,
  tension:   1.1,
  story:     1.2,
  brain:     1.2,
};

const computeMoodMatch = (user, game) => {
  let sum = 0;
  let weightSum = 0;
  (['operation','session','tension','story','brain'] as const).forEach(axis => {
    const w = MOOD_WEIGHTS[axis];
    const diff = (user[axis] ?? 0) - (game[axis] ?? 0);
    sum += w * diff * diff;
    weightSum += w;
  });
  const maxD = Math.sqrt(weightSum);
  const d = Math.sqrt(sum);
  return distanceToScore(d, maxD); // 0〜100 に変換
};
```

- これにより各ゲームに対して `moodScore`（0〜100）が付与される。

### 3-7. 最終スコアの合成

- `baseScore` と `moodScore` を合成して、最終スコアを出す：

```ts
const calcFinalRankingScore = (baseScore: number, moodScore: number): number => {
  const BASE_WEIGHT = 0.6;
  const MOOD_WEIGHT = 0.4;

  if (moodScore <= 0) return baseScore;

  return BASE_WEIGHT * baseScore + MOOD_WEIGHT * moodScore;
};
```

- これをもとに `sort: "match"` のときの並び順が決まる。

- 関数のレスポンスには、
  - ゲーム基本情報（title, appId, images）
  - 価格 / セール情報
  - baseScore / moodScore / finalScore
  - mood_scores（5軸生データ）
  - AI解析サマリ
  などが含まれる。

---

## 4. フロント側の表示：SearchResultCard / GameDetail

### 4-1. SearchResultCard

- SearchPage が `search-games` のレスポンスを受け取り、
  各ゲームについて `SearchResultCard` に props を渡す。

- `SearchResultCard` は、渡されたオブジェクトから：
  - `moodScore`（もしくは `gameData.moodScore` / `analysisData.moodScore`）
  - その他の表示用データ（タイトル、タグ、レビューなど）
  を取り出して表示するだけ。

- DB には直接アクセスせず、「もらったスコアを表示」する責務に限定されている。

### 4-2. GameDetail

- SearchResultCard から `navigate` するときに、
  `gameData` / `analysisData` を `location.state` に乗せて遷移する。

- `GameDetail` は `location.state` からそれらを受け取り、
  その中に含まれる `moodScore` や `mood_scores`、解析テキストなどを利用して詳細画面を構築する。

- ここでも DB には直接触れず、「SearchPage から渡された情報」を描画している。

---

## 5. プリセット / Sub Vibes を統合した場合の全体像

1. **トップ（Index.tsx）**
   - ユーザーがプリセット + Sub Vibes を選ぶ
   - → `primaryVibePreset` と `subVibes` を `/search` に `navigate` の state として渡す

2. **SearchPage.tsx**
   - `useLocation()` で state を受け取る
   - サブ Vibes 仕様書のロジック（`computeDesiredMood`, `computeAxisWeights` など）を使って
     5軸ベクトル `desired_mood` を計算する
   - `userMood` として `desired_mood` を採用し、`search-games` に渡す

3. **search-games（Supabase Functions）**
   - 受け取った `userMood`（= desired_mood）を
     `slidersToUserMood` などで正規化し、
     各ゲームの `mood_scores` と比較して `moodScore` を算出
   - `baseScore` と `moodScore` から `finalScore` を作る
   - ゲームリスト + 各種スコアを JSON として返す

4. **SearchResultCard / GameDetail**
   - `search-games` のレスポンスから `moodScore` と各種情報を受け取り、
     UI として表示する

---

## 6. 要点のまとめ

- **気分プリセットと Sub Vibes は「ユーザーが望む気分ベクトル（desired_mood）」を決めるための UI。**
- **SearchPage は desired_mood を `userMood` として Supabase 関数に渡すハブ。**
- **search-games + _shared/mood.ts が、desired_mood と game_rankings_cache.mood_scores の距離からマッチ度を計算。**
- **SearchResultCard / GameDetail は、その結果としての `moodScore` / `finalScore` をただ表示するレイヤー。**

この構造を守ることで、
- UI（気分プリセット / Sub Vibes）
- 検索・ランキングロジック
- 表示コンポーネント

がそれぞれきれいに分離され、後からロジックの調整や A/B テストを行いやすい設計になります。


---

## 7. Base Score / Final Score の最新仕様（2025-12-03 更新）

### 7-1. computeBaseScore の役割（更新後）

`computeBaseScore` は、もともと「隠れた良作寄り」の指標（安さ・所有者の少なさ・長時間プレイされているか等）を強く見ていましたが、
現在のコンセプト「今日の気分に合う / 自分に刺さるゲーム」に合わせて、
**「気分マッチの土台としての品質フィルター」に役割をシフト** しました。

新しい考え方では：

- **baseScore**
  - レビューの質と信頼性
  - 価格の極端さ（罠価格の抑制）
  - プレイ時間の極端さ（あまりにも薄い体験の抑制）
  - リリース年（古すぎる作品を少しだけ減点）
 などを見て、
  > 「候補としてユーザーに出してよいゲームか？」
  を評価するスコアになります。

- **moodScore**
  - これまで通り `userMood`（desired_mood）と `mood_scores` の距離から求める
  - 「今日の気分とのフィット度」を表す主役スコア

### 7-2. computeBaseScore の中身（概要）

新しい `computeBaseScore` の主な要素：

1. **レビューの質（positiveRatio）と信頼性（totalReviews）**
   - 好評率を 0〜1 に正規化
   - レビュー件数を log スケール 0〜1 に正規化
   - それらを組み合わせて `reviewScore` を算出

2. **価格スコア（priceScore）**
   - 5〜40ドル帯はほぼフラットで高評価（0.8〜1.0）
   - 1ドル未満、60ドル超など極端な価格帯だけ軽く減点
   - 「安いほど偉い」ではなく「怪しくない価格か」を見る役割

3. **プレイ時間スコア（playtimeScore）**
   - 0〜2時間 → かなり低め（コンテンツが薄い可能性）
   - 2〜20時間 → 0.3〜1.0 の範囲で徐々に上昇
   - 20時間以上 → 1.0 で頭打ち（長さを盛りすぎない）

4. **リリース年スコア（yearScore）**
   - 0〜5年以内 → 高め
   - 10年以上前 → 少し減点
   - それ以上古い作品は、UI/操作の古さリスクとして軽めの減点

5. **所有者数（estimatedOwners）**
   - 旧仕様では「隠れ度」評価に使っていたが、
   - 新仕様では **baseScore からは一旦除外**（人気かどうかは気分検索の目的とズレるため）

重み付けのイメージ：

- reviewScore : 60
- playtimeScore : 15
- priceScore : 15
- yearScore : 10

合計 100 として 0〜100 の baseScore を算出します。

### 7-3. calcFinalRankingScore の重み（更新後）

最終的なランキング用スコアは：

- **baseScore** … 品質フィルターとして 40%
- **moodScore** … 今日の気分とのマッチ度として 60%

という比率で合成します。

つまり、関数は次のようなイメージです：

```ts
const calcFinalRankingScore = (baseScore: number, moodScore: number): number => {
  const BASE_WEIGHT = 0.3;  // 品質
  const MOOD_WEIGHT = 0.7;  // 気分マッチ

  if (moodScore <= 0) return baseScore;

  return BASE_WEIGHT * baseScore + MOOD_WEIGHT * moodScore;
};
```

これにより：

- baseScore は「最低限の品質保証と地雷回避」の役割
- moodScore は「どれだけ今日の気分に刺さるか」の主役

という分担が明確になり、
**「気分で探す / 自分に刺さる」コンセプトとスコア設計が揃った状態** になっています。
