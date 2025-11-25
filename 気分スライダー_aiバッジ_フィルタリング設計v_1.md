# 気分スライダー & AIバッジ フィルタリング設計メモ

## 1. 目的
- ユーザーが **「今日の気分」ベースで隠れた良作を探せる** ようにする。
- 気分スライダー（数値）と、AI 生成の「どんな人に刺さるか」バッジ（ラベル）を **同じ設計思想の上に統合** する。

---

## 2. 気分スライダー（Vibe Sliders）

### 2.1 採用する軸（例：3軸案）
※現在の有力候補

1. **Active Level（静的 ↔ アクション）**
   - 左：ストーリー・探索・読ませる系（アドベンチャー寄り）
   - 右：操作量の多いアクション・戦闘中心

2. **Stress Level（癒し ↔ 緊張・挑戦）**
   - 左：気楽・まったり・コージー
   - 右：高難度・死にゲー・ローグライト的な緊張

3. **Play Length / Volume（サクッと ↔ がっつり）**
   - 左：短編、3〜5時間で終わる、ショートセッション向き
   - 右：1本で何十時間も遊ぶ、長編RPGやサンドボックス

> 必要であれば 4 本目以降（例：Story Weight など）を追加可能だが、コア設計は上記 3 軸を前提。

### 2.2 スライダー段階数
- 各スライダーは **5 段階（0〜4）**。
- UI 上は **ドット型表示（値は数値として見せない）**。
- 内部では 0〜4 → 0.0〜1.0 に正規化して扱う。

```ts
const VIBE_MAX = 4; // 0〜4

function normalize(v: number): number {
  return v / VIBE_MAX; // 0.0〜1.0
}
```

---

## 3. ゲーム側のデータ構造

### 3.1 Vibe ベクトル（数値）
各ゲームタイトルは AI 解析結果から、以下のような **vibeVector** を付与する。

```ts
type VibeVector = {
  active: number; // 0.0〜1.0 静的〜アクション
  stress: number; // 0.0〜1.0 癒し〜緊張・挑戦
  volume: number; // 0.0〜1.0 短時間〜長時間
};
```

- 生成元：analyze-hidden-gem の解析プロンプトを拡張し、
  - レビュー本文
  - タグ
  - プレイ時間の傾向
  などから LLM にスコアリングさせる。
- 保存先：`game_rankings_cache.data.vibes` として保存。

### 3.2 「どんな人に刺さるか」バッジ

```ts
type AudienceBadge = {
  id: string;   // 機械用ID（"short_sessions" など）
  label: string; // UI 表示用（日本語）
};

interface GameAnalysisData {
  // 既存 summary/pros/cons など
  vibes: VibeVector;
  audienceBadges: AudienceBadge[];
}
```

#### バッジの例
- プレイスタイル系
  - `"story_focus"` → 「ストーリーに浸りたい人向け」
  - `"action_lovers"` → 「ガッツリ操作して戦いたい人向け」
- 難易度 / ストレス系
  - `"high_challenge"` → 「高難度アクションに挑戦したい人向け」
  - `"cozy_evening"` → 「疲れた日にまったり遊びたい人におすすめ」
- ボリューム系
  - `"short_story"` → 「3〜5時間で遊べる短編が好きな人向け」
  - `"long_rpg"` → 「1本に何十時間も使いたい人向け」

> これらも analyze-hidden-gem の出力で同時に生成し、カードUIにバッジ表示。

---

## 4. フィルタリング / マッチングロジック

### 4.1 クライアント → サーバー への入力

クライアント側でスライダー値（0〜4）から 0〜1 に正規化し、
`userVibes` としてクエリパラメータか JSON で送信。

```ts
type UserVibes = {
  active: number; // 0.0〜1.0
  stress: number;
  volume: number;
};
```

### 4.2 ゲームとの距離計算

サーバー側（search-games / get-similar-gems）で、
`userVibes` と各ゲームの `vibes` の距離を計算し、
**「気分マッチ度」** としてスコア化する。

```ts
function vibeDistance(user: VibeVector, game: VibeVector): number {
  const wActive = 1.0;
  const wStress = 1.0;
  const wVolume = 0.8; // 少し弱めなど調整可

  const da = user.active - game.active;
  const ds = user.stress - game.stress;
  const dv = user.volume - game.volume;

  return Math.sqrt(
    wActive * da * da +
      wStress * ds * ds +
      wVolume * dv * dv,
  );
}

function vibeScore(user: VibeVector, game: VibeVector): number {
  const maxDistance = Math.sqrt(1 * 1 + 1 * 1 + 0.8 * 0.8);
  const d = vibeDistance(user, game);
  const s = 1 - d / maxDistance; // 0〜1（1がベストマッチ）
  return Math.max(0, Math.min(1, s));
}
```

### 4.3 既存スコアとの統合

既存の hidden gem スコア（レビュー評価・メタスコア等）とブレンドして最終順位を決定。

```ts
const finalScore =
  0.6 * game.baseScore +   // 既存ランキング
  0.4 * vibeScore(user, game); // 気分マッチ度
```

- 重みは調整可能（A/B テストの余地）。
- vibeScore が一定値（例: 0.3）未満のゲームは候補外にするなどの「足切り」も検討。

---

## 5. バッジを使ったフィルタリング

### 5.1 ハードフィルタ（絞り込み）

ユーザーがカード上のバッジをクリック → そのバッジIDをクエリに含める。

```ts
// クエリ例
{
  userVibes: { ... },
  badgeFilter: ["short_story", "story_focus"]
}
```

サーバー側では：

```ts
if (badgeFilter?.length) {
  games = games.filter((g) =>
    g.audienceBadges.some((b) => badgeFilter.includes(b.id)),
  );
}
```

→ 「まさにこの自分向けタグが付いているゲームだけ見たい」場合。

### 5.2 ソフトフィルタ（スコアブースト）

ハードフィルタではなく、**マッチしているゲームを少しだけ上に押し上げる** パターン。

```ts
const matchesBadge = game.audienceBadges.some((b) =>
  badgeFilter.includes(b.id),
);

const badgeBonus = matchesBadge ? 0.1 : 0; // 0〜0.1加点

const finalScore =
  0.6 * game.baseScore +
  0.3 * vibeScore(user, game) +
  0.1 * tagMatchScore +
  badgeBonus;
```

- クリックしたバッジと一致するゲームが、気分にも合っていれば **より上位** に来やすくなる。

---

## 6. UX 観点での役割分担

- **気分スライダー：**
  - 数値ベースのマッチングコア
  - 「なんとなくの気分」を 3〜4 本の軸でざっくり指定

- **AIバッジ：**
  - 解析結果を人間向けに要約した「このゲームは、こんな人に刺さります」説明
  - クリックするとフィルタ or スコアブースト
  - カードを眺めているだけで、そのゲームの“刺さる相手”が直感的に分かる

両者は **同じ VibeVector を起点とした表現違い** として一貫させる。

---

## 7. 今後の拡張余地

- Vibe 軸を 3→4本に増やす（例：Story Weight を追加）
- audienceBadges をカテゴリごとに整理し、Quick Filters とも連動
- 「今週の気分に合う隠れた名作」など、vibeScore に強く寄せた特集ブロック

まずは上記構成で **vibeVector + audienceBadges を analyze-hidden-gem の出力に追加** し、
search-games / get-similar-gems 側で `vibeScore` を組み込むのが最初の実装ステップ。

