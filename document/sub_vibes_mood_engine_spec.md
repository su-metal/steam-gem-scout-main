# Sub Vibes Mood Engine 仕様書（日本語版）

## 概要
Mood Engine（気分エンジン）は、**プライマリ Vibes（プリセット）**と**Sub Vibes（追加意図）**を組み合わせて、最終的な **desired_mood（5軸ベクトル）** を生成します。

重み付けの基本比率は次のとおりです：

- **プライマリ Vibe：70%**（ベースの気分）
- **Sub Vibes：30%**（今日追加したい意図）

この desired_mood とゲーム側の mood_scores を比較し、マッチ度を算出します。

---

## 5つの Mood 軸（内部ロジックの基盤）
すべての計算は以下の 5軸で行われます：

- **brain** – 頭の使い方 / 思考負荷
- **story** – 物語の深さ / 感情
- **session** – プレイ時間・腰の据え方 / テンポ
- **tension** – 緊張感 / 刺激
- **operation** – 操作密度 / アクション量

最終的なマッチ度は、ゲームのベクトルとの距離（重み付き）で評価します。

---

## プライマリ Vibes（ベース Mood）
各プリセットが 0〜1 の 5軸ベクトルを持ちます。

### Chill
```
brain: 0.10
story: 0.20
session: 0.90
tension: 0.15
operation: 0.25
```
### Focus
```
brain: 0.90
story: 0.30
session: 0.40
tension: 0.55
operation: 0.85
```
### Story
```
brain: 0.25
story: 0.95
session: 0.60
tension: 0.30
operation: 0.35
```
### Speed
```
brain: 0.45
story: 0.15
session: 0.35
tension: 0.95
operation: 0.80
```
### Short
```
brain: 0.35
story: 0.40
session: 0.85
tension: 0.40
operation: 0.55
```

---

## Sub Vibes（7種類）
Sub Vibe は 2つの効果を持ちます：
1. **5軸ベクトルへの補正（Δ）**
2. **軸ウェイトの増減（この軸をどれだけ重要視するか）**

プリセットの性格は残しつつも、Sub Vibes による意図を明確に反映させるための設計です。

---

## 各 Sub Vibe の Δ（補正値）と 軸ウェイト

### 1. Cozy（ほっこり・落ち着いた）
**Δ**
```
brain:     -0.10
story:     +0.10
session:   +0.25
tension:   -0.40
operation: -0.20
```
**軸ウェイト**
```
tension: 0.5
```

### 2. Emotional（泣ける・感情的）
**Δ**
```
brain:      0.00
story:     +0.60
session:   +0.20
tension:   +0.10
operation: -0.10
```
**軸ウェイト**
```
story: 2.5
```

### 3. Difficult（歯ごたえ・挑戦）
**Δ**
```
brain:     +0.50
story:      0.00
session:   -0.10
tension:   +0.40
operation: +0.40
```
**軸ウェイト**
```
brain: 2.0
tension: 2.0
```

### 4. Puzzle-lite（軽いパズル感）
**Δ**
```
brain:     +0.25
story:     +0.05
session:    0.00
tension:   -0.05
operation: -0.05
```
**軸ウェイト**
```
brain: 1.6
```

### 5. Atmospheric（雰囲気・世界観）
**Δ**
```
brain:     -0.05
story:     +0.40
session:   +0.20
tension:   -0.10
operation: -0.10
```
**軸ウェイト**
```
story: 1.8
session: 1.8
```

### 6. Humor（笑い・軽さ）
**Δ**
```
brain:     -0.10
story:     +0.10
session:   +0.10
tension:   -0.30
operation:  0.00
```
**軸ウェイト**
```
tension: 0.6
```

### 7. Strategic（戦略性・計画性）
**Δ**
```
brain:     +0.50
story:     +0.10
session:   +0.10
tension:   +0.10
operation: +0.20
```
**軸ウェイト**
```
brain: 2.2
operation: 2.2
```

---

## desired_mood の最終計算式（70:30 ルール）
```
desired_mood = clamp01(
  preset_base * 0.7 +
  combined_sub_vibes_delta * 0.3
)
```

- preset_base：プリセットの5軸ベクトル
- combined_sub_vibes_delta：選択された Sub Vibes の Δ を合算したもの
- clamp01：0〜1 に丸める

---

## 軸ウェイトを使った距離計算（マッチ度）
ゲームとの距離を測る際、Sub Vibes のウェイトを反映します：

```
distance = sqrt( Σ axisWeight[axis] * (game[axis] - desired[axis])^2 )
```

Sub Vibes を複数選ぶ場合、ウェイトは掛け算で累積します。

---

## タグブースト（概要）
Sub Vibes は Steam タグにも影響を与えます。
例：
- Emotional → Story Rich / Drama / Emotional タグをブースト
- Cozy → Cozy / Relaxing / Atmospheric
- Difficult → Hardcore / Roguelike / Souls-like

（タグブースト表は別途定義）

---

## まとめ
この仕様書では以下を定義しました：
- プリセット 5種の Mood ベクトル
- Sub Vibes の Δ 値
- Sub Vibes の軸ウェイト
- desired_mood の計算方法（70:30）
- 重み付き距離によるマッチ度算出

この設計により、
**プリセットの“気分ベース”を保ちつつ、Sub Vibes による“今日の意図”を明確に検索へ反映できる**ようになります。