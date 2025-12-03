# VIBE UI 仕様まとめ（プリセット & Vibeスライダー）

---

## 1. Vibe（気分）という概念

アプリの最重要UX:

> **ゲームジャンルではなく “気分（Vibe）” から探す**

Steam には存在しない「その日の気分・遊びたい感性」起点の検索を実現するため、
次の **2階層の Vibe 構造** を採用する。

- 上位：Primary Vibes（5つの大きな気分カテゴリ）
- 下位：Sub Vibes（世界観・ムード・ジャンルの補助ラベル）

これにより、

1. トップページでは **直感的な“気分の選択”だけ** させる
2. 検索ページでは **詳細スライダーやタグで深掘り** させる

という二段階UXを構成する。

---

## 2. Primary Vibes（上位の5大気分カテゴリ）

### 定義

| ID | ラベル（英語案） | コア意味 | 主な特徴 |
|----|------------------|-----------|-----------|
| **CHILL** | Chill / Relax | 頭を使わずゆっくり楽しみたい | Cozy / Sandbox / Nature / No stress |
| **FOCUS** | Deep Focus | ロジック・最適化・思考の快感 | Deckbuilder / Tactics / Puzzle / Roguelike |
| **STORY** | Story / Narrative | 物語やキャラクターに浸りたい | RPG / Adventure / Emotional choices |
| **SPEED** | Fast & Reflex | 反射神経・アクション性重視 | Shooter / Action / Boss rush / Arcade |
| **SHORT** | Quick Play | 短時間でサクッと遊びたい | Indie / Experimental / Compact play |

### 役割

- ユーザーに「今の自分の気分」を一言で選ばせる軸
- ゲームジャンルではなく「遊ぶ理由」に紐づく分類
- トップページの 3D Vibe Globe / プリセットの土台になる

---

## 3. Sub Vibes（補助的な気分・世界観プリセット）

Primary Vibes だけでは幅が広すぎるため、
**Sub Vibes** を「補助ラベル」として用意する。

### 種類

- **Mood タイプ**: 感情・テンション
  - 例: `Difficult`, `Relaxed`, `Funny`, `Melancholic`
- **Aesthetic タイプ**: 見た目・世界観
  - 例: `Cyberpunk`, `Retro`, `Dark`, `Cute`
- **Genre タイプ**: ゲームシステム寄り
  - 例: `Management`, `Open World`, `Cooperative`

### 現行例（SUB_VIBES）

- Cyberpunk (aesthetic)
- Retro (aesthetic)
- Cooperative (genre)
- Difficult (mood)
- Funny (mood)
- Dark (aesthetic)
- Management (genre)
- Open World (genre)

### UI上の役割

- トップページ下部の **横スクロールバッジ** として表示
- 1タップで Search ページに補助条件として渡す
- Primary Vibe よりも軽いニュアンスの調整レイヤー

---

## 4. Vibe プリセット（ワンタップで選べる複合気分）

### 目的

- 新規ユーザーが **何も考えずにスタート** できる
- 「気分で探す」というコンセプトを瞬時に体感させる
- Primary Vibe + Sub Vibes + 内部スライダー初期値 をまとめて選ぶショートカット

### 例（暫定案）

- **Chill Time**
  - ベース: CHILL
  - 補助: Cozy / Low Tension / Solo
- **Brain Workout**
  - ベース: FOCUS
  - 補助: Puzzle / Tactics / Deckbuilder
- **Emotional Journey**
  - ベース: STORY
  - 補助: Cinematic / Character-Driven
- **Fast & Furious**
  - ベース: SPEED
  - 補助: Arcade / Reflex-heavy
- **Coffee Break**
  - ベース: SHORT
  - 補助: Indie / Short Session

### UXフロー

1. プリセットボタンをタップ
2. 内部的に Primary Vibe + Sub Vibes + Moodスライダー初期値を設定
3. そのまま `/search` へ遷移、もしくは「細かく調整」導線を表示

---

## 5. Vibe スライダー（Mood / Vibe Slider）の位置づけ

元々の設計として存在している 5軸の気分スコア：

- `brain`   : 思考負荷 / 論理性
- `story`   : 物語性 / キャラクター性
- `session` : 1プレイの短さ / 区切りの良さ
- `tension` : 緊張感 / 難易度
- `operation`: 操作の忙しさ / アクション性

### トップページと検索ページでの役割分担

- **トップページ**
  - スライダーは露出しない
  - Primary Vibes / Sub Vibes / プリセットのみ
- **検索ページ**
  - 5軸のスライダーを表示して詳細調整
  - トップで選ばれた Vibe/プリセットを初期値に反映

---

## 6. Primary Vibe → スライダー値のマッピング

Primary Vibe を選択した際に、内部のスライダー値を初期化する。数値は 0〜1 の正規化値とする想定。

> ※ 以下はイメージ。実装時に微調整可能。

| Vibe  | brain | story | session | tension | operation |
|-------|-------|-------|---------|---------|-----------|
| CHILL | 0.1   | 0.2   | 0.9     | 0.1     | 0.2       |
| FOCUS | 0.9   | 0.3   | 0.4     | 0.5     | 0.8       |
| STORY | 0.2   | 0.95  | 0.3     | 0.2     | 0.3       |
| SPEED | 0.4   | 0.1   | 0.2     | 0.9     | 0.7       |
| SHORT | 0.3   | 0.4   | 0.95    | 0.3     | 0.5       |

### Sub Vibes の補正（例）

Sub Vibe はこの初期値に対して *加算的に補正* するイメージ。

- `Difficult`  : tension +0.3（上限 1.0）
- `Funny`      : tension -0.2, story +0.2
- `Management` : brain +0.25
- `Open World` : session -0.1, operation +0.1

実装上は:

```ts
base = primaryVibePreset[vibeId]; // 5軸のベース値
adjusted = applySubVibeModifiers(base, selectedSubVibes);
```

のような形で扱う。

---

## 7. トップページ ↔ Search ページの UX フロー

### トップページ（Vibe ファースト）

1. ユーザーが 3D Globe / プリセット / Sub Vibe のいずれかで "気分" を選ぶ
2. アプリは `selectedVibe` と `selectedSubVibes` を内部状態として保持
3. 「この Vibe でゲームを探す」 ボタンで `/search` へ遷移

遷移時のパラメータ例：

```ts
navigate("/search", {
  state: {
    selectedVibe: "FOCUS",        // Primary Vibe
    selectedSubVibes: ["Difficult", "Management"],
  },
});
```

### Search ページ（調整・深掘りフェーズ）

1. `location.state` から `selectedVibe` / `selectedSubVibes` を読み取る
2. Primary Vibe → スライダー初期値に変換
3. Sub Vibe → 初期値に補正をかける
4. ユーザーに 5軸スライダーを見せて微調整させる
5. 検索結果のソート・絞り込みをスライダーの最終値で実行

---

## 8. 3D Vibe Globe の役割（体験価値）

3D Vibe Globe（地球儀UI）は、単なるビジュアルではなく：

- 「気分を選ぶ」という抽象行為を **空間的な探索** に変換する装置
- 地球儀を回す → Vibe ピンが浮かんでいる → 近いものがハイライト
- 右下の Vibe カードでテキスト情報を補完
- 下部の Sub Vibes で「さらに細かく、自分の好みに寄せる」導線を作る

結果として：

> *"今日はどんな気分でゲームしたい？"*

という問いに、UI 全体で答えさせる体験になる。

---

## 9. まとめ（コンセプト一句）

- トップページ：**気分だけ決める場所**
- Searchページ：**決めた気分を細かくチューニングする場所**

この二段階構造の中心に、

- Primary Vibes（5軸）
- Sub Vibes（補助タグ）
- Vibe プリセット（ワンタップ体験）
- 5軸 Mood スライダー

が配置されている。

