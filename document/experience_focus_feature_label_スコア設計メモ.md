# Experience Focus × FeatureLabel スコア設計メモ（受け皿フェーズ）

このドキュメントは、将来「Experience Focus × FeatureLabel」を使ったマッチング精度向上を行うために、
先に整備した **型／API／パイプラインの受け皿仕様** をまとめたもの。

現時点ではロジックは未実装で、**挙動は以前と完全に同じ**。  
後から見返してすぐ実装に入れるように、流れと責務を整理している。

---
## 1. 全体像

### 1-1. 現在のマッチングの軸

- ユーザーはトップで **VIBE** を選択
- （将来）続けて **Experience Focus** を選択
- 検索結果の分類：
  - `ON VIBE`
  - `NEAR VIBE`
  - `DISCOVERY`

現在の分類ロジック：

- バックエンドで計算される **`moodScore`**（userMood とゲームの mood_scores の距離）が唯一の軸
- フロントの `SearchResultCard` が `moodScore` を見て：
  - `>= 0.7` → ON VIBE
  - `>= 0.4` → NEAR VIBE
  - それ以外 → DISCOVERY

### 1-2. 将来やりたいこと（方向性）

- 「気分（mood）だけ」ではなく、
  - **Experience Focus（どんな遊び方をしたいか）**
  - **FeatureLabel（ゲームの中身の軸タグ）**
 も組み合わせてマッチ度を出したい。

- 例：
  - VIBE: Tactical
  - Experience Focus: Automation / Factory
  - → `automation_systems` / `resource_management` などの FeatureLabel を見て、
    「どれだけ Tactical×Automation っぽいか」をスコア化する。

- そのための **受け皿（パイプライン）だけ先に通した状態**。

---
## 2. データフロー概要

### 2-1. フロント → バックエンドの流れ

1. **Index ページ（トップ）**
   - ユーザーが VIBE / Experience Focus プリセットを選択
   - `navigate("/search", { state: { ... } })` で SearchPage へ遷移
   - state には以下のような情報が乗る：
     - `primaryVibePreset`（VIBE ID）
     - `primaryVibeTitle`
     - `experienceClass` / `experienceClassLabel` など

2. **SearchPage**
   - ナビゲーション state から VIBE / Experience Focus の ID を取得
   - `supabase.functions.invoke("search-games", { body })` で検索 API を呼ぶ
   - body には、既存のフィルタに加えて以下を含める：
     - `primaryVibeId?: string | null`  
       例: "tactical", "narrative", "chill" など
     - `experienceFocusId?: string | null`  
       例: "tactical_automation" など

3. **search-games（Edge Function）**
   - `SearchBody` に上記 2 フィールドを追加して受け取る
   - 今は **読み取るだけ** で、スコアロジックには使っていない

---
## 3. SearchBody の仕様（search-games）

### 3-1. SearchBody 拡張

`supabase/functions/search-games/index.ts` 内の `SearchBody` 型（イメージ）：

```ts
type SearchBody = {
  genre?: string;
  recentDays?: number | null;
  sort?: string;
  minReviews?: number;
  userMood?: UserMoodPrefs | null;
  aiTags?: string[];
  // ...既存フィルタ

  // ★ 追加された将来用フィールド
  primaryVibeId?: string | null;      // 選択済み VIBE の ID
  experienceFocusId?: string | null;  // 選択済み Experience Focus の ID
};
```

ポイント：

- どちらもオプショナル ＋ null 許容
- 既存クライアントが何も送らなくてもコンパイル・実行できるようになっている
- 現時点では **ロジック内で使わない（参照しても noop）**

---
## 4. RankingGame 型の拡張

### 4-1. experienceFocusScore フィールドの追加

検索結果 1 件を表す型（例：`RankingGame`）に、将来用のフィールドを追加：

```ts
type RankingGame = {
  // 既存フィールド
  moodScore?: number | null;
  vibeFocusMatchScore?: number | null;
  // ...その他のスコア

  // ★ 新規：Experience Focus スコアの受け皿
  experienceFocusScore?: number | null;
};
```

### 4-2. 現時点での値

- 各ゲームを組み立てる際に、必ず `experienceFocusScore: null` をセットしている。
- **finalScore やソートロジックには一切混ぜていない**。

→ これにより、レスポンスにはフィールドだけ存在し、挙動は変化しない。

---
## 5. computeExperienceFocusScore スタブ関数

### 5-1. 定義

将来ここにロジックを入れる前提で、スタブだけ定義済み：

```ts
interface ExperienceFocusScoreResult {
  focusScore: number | null;
}

function computeExperienceFocusScore(
  game: RankingGame,
  primaryVibeId: string | null | undefined,
  experienceFocusId: string | null | undefined
): ExperienceFocusScoreResult {
  // TODO: 後で Experience Focus × FeatureLabel を使ったスコアリングを実装する
  // 現在は挙動を変えないため、常に null を返す
  return { focusScore: null };
}
```

### 5-2. 呼び出しタイミング

- 各ゲームのランキングデータを組み立てるタイミングで：

```ts
const { focusScore } = computeExperienceFocusScore(
  rankingGame,
  body.primaryVibeId ?? null,
  body.experienceFocusId ?? null
);

rankingGame.experienceFocusScore = focusScore; // 現在は常に null
```

- こうして **配管だけ通した状態** を作っている。
- 将来は、この関数内のロジックだけ差し替えれば、
  Experience Focus × FeatureLabel スコアが即パイプラインに乗る想定。

---
## 6. フロントエンド側の扱い

### 6-1. SearchPage → invoke body

`SearchPage.tsx` 側の変更ポイント：

- ナビゲーション state から VIBE / Experience Focus の ID を取り出し、
  `invoke("search-games", { body })` の body に `primaryVibeId` / `experienceFocusId` を追加。
- これにより、ユーザーが選んだ VIBE / Experience Focus がバックエンドに届くようになっている。
- ただし、**バックエンドではまだスコアリングに使っていない**。

### 6-2. SearchResultCard の props

`SearchResultCard`（検索結果カードコンポーネント）側：

- props 型に `experienceFocusScore?: number | null` を追加（受け取れるようにした）。
- ただし：
  - UI上の表示には利用しない
  - ON VIBE / NEAR / DISCOVERY 判定にも使わない
  - sort / filter にも使わない

→ 「後で使えるように型だけ通してある」状態。

---
## 7. 挙動が変わらないことの確認ポイント

この受け皿フェーズでは、**ユーザー体験は一切変わらない**ようにしてある：

1. **検索結果の順序**
   - `finalScore` の計算は従来どおり（moodScore と baseScore の組み合わせ）。
   - `experienceFocusScore` は計算されても常に null で、ソートに影響しない。

2. **ON VIBE / NEAR VIBE / DISCOVERY の判定**
   - 依然として `moodScore` のみを参照。
   - 判定用の閾値・ロジックも変更なし。

3. **UI 表示**
   - 新しいフィールドは UI に表示されない。
   - バッジ・スコア・ラベル表示はすべて従来どおり。

---
## 8. 将来の実装フック

将来、Experience Focus × FeatureLabel スコアリングを実装するときは：

1. `computeExperienceFocusScore` の中身に、
   - Experience Focus 定義（coreLabels / niceToHave / antiLabels など）
   - ゲームの `featureLabels`

   を使ったスコアロジックを追加する。

2. `experienceFocusScore` を：
   - `finalScore` への混ぜ方（例：0.7 mood + 0.2 base + 0.1 focus）
   - バッジ（例：FOCUS MATCH）などに活用するかどうか

   を別途設計する。

3. 必要であれば ON VIBE / NEAR / DISCOVERY の判定ロジックに
   - `experienceFocusScore` も加味するよう変更する（その際は別プロンプトで指示）。

---
## 9. まとめ

- 現時点では：
  - **動作は完全に従来どおり**  
  - 追加されたのは：
    - SearchBody の `primaryVibeId` / `experienceFocusId` フィールド
    - `RankingGame.experienceFocusScore` フィールド
    - `computeExperienceFocusScore` スタブ関数
    - SearchResultCard が `experienceFocusScore` を受け取るための型

- これにより、後から：
  - Experience Focus × FeatureLabel ベースのスコアリングを入れるときに
  - API 仕様や型を再度いじらずに、ロジック部分の実装に集中できる。

「配管だけ先に通して、ロジックは後で入れる」フェーズはこれで完了。  
次のフェーズでは、Experience Focus 定義と FeatureLabel の対応関係を整理し、
`computeExperienceFocusScore` の中身を詰めていく。

