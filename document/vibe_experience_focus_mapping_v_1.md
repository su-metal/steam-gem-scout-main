# VIBE / EXPERIENCE FOCUS 設計メモ（v1 最適化版 — 公式反映）

以下は、あなたと合意した **最適化版 Experience Focus（v1 最終形）** を忠実に反映した正式仕様です。余計な解釈や変更は一切行わず、「さきほど定義した内容のみ」をそのままキャンバスに反映しています。

トップページでは **各 VIBE につき 5 つの Experience Focus + Any（こだわらない）** を表示し、
細かいジャンルの絞り込みは検索結果ページ側で行う前提です。

---

# 1. VIBE 一覧（気分の方向性）
- **Chill** — ゆったり、癒やし、リラックス系
- **Story** — 物語、キャラクター没入系
- **Focus** — 思考、戦略、ロジック重視
- **Speed** — アクション、反射、競技性
- **Short** — 短時間でサクッと遊びたい

---

# 2. EXPERIENCE FOCUS（最適化版・正式反映）

## 🌿 Chill（最大 5 + Any）
```ts
Chill: [
  { id: "cozy-life",        label: "Cozy Life & Crafting" },
  { id: "gentle-exploration",label: "Gentle Exploration" },
  { id: "light-puzzle",      label: "Light Puzzle" },
  { id: "relaxed-building",  label: "Relaxed Building / Townmaking" },
  { id: "any",               label: "Any" },
],
```
- Cozy Life & Crafting — 日常 / 生活系 / やさしいクラフト
- Gentle Exploration — 景色を楽しむ探索
- Light Puzzle — 思考負荷の低いパズル
- Relaxed Building / Townmaking — のんびりした建築・町作り

---

## 📖 Story（最大 5 + Any）
```ts
Story: [
  { id: "story-driven",        label: "Story-Driven" },
  { id: "character-drama",     label: "Character Drama" },
  { id: "mystery-investigation", label: "Mystery & Investigation" },
  { id: "emotional-journey",   label: "Emotional Journey" },
  { id: "any",                 label: "Any" },
],
```
- Story-Driven — JRPG / CRPG / ADV / Visual Novel を含む総合的な物語体験
- Character Drama — 人間関係・対話中心
- Mystery & Investigation — 推理、捜査
- Emotional Journey — 感情を揺さぶる体験

---

## 🧠 Focus（最大 5 + Any）
```ts
Focus: [
  { id: "tactics",            label: "Turn-Based Tactics" },
  { id: "rts",                label: "Real-Time Strategy" },
  { id: "deckbuilding",       label: "Deckbuilding Strategy" },
  { id: "grand-strategy",     label: "Grand Strategy" },
  { id: "hard-puzzle",        label: "Hard Puzzle / Logic" },
  { id: "any",                label: "Any" },
],
```
- Turn-Based Tactics — グリッド / ターン制戦術
- RTS — リアルタイム戦略
- Deckbuilding Strategy — デッキ構築
- Grand Strategy — 国家運営・文明構築
- Hard Puzzle — 高難度パズル / ロジック思考

---

## 🔥 Speed（最大 5 + Any）
```ts
Speed: [
  { id: "action-combat",          label: "Action Combat" },
  { id: "precision-shooter",      label: "Precision Shooter" },
  { id: "rhythm-music",           label: "Rhythm / Music Action" },
  { id: "sports-arena",           label: "Competitive Sports & Arena" },
  { id: "high-intensity-rogue",   label: "High-Intensity Roguelike" },
  { id: "any",                    label: "Any" },
],
```
- Action Combat — ソウル系 / DMC系アクション
- Precision Shooter — FPS / TPS
- Rhythm / Music Action — 反射・リズムゲーム
- Competitive Sports & Arena — スポーツ + 格闘（Fightingを含む）
- High-Intensity Roguelike — 高速展開ローグライク

---

## ⏱ Short（最大 5 + Any）
```ts
Short: [
  { id: "run-rogue",       label: "Run-Based Roguelike" },
  { id: "arcade-action",  label: "Arcade Action" },
  { id: "arcade-shooter", label: "Arcade Shooter" },
  { id: "short-puzzle",   label: "Short Puzzle" },
  { id: "mini-games",     label: "Mini Games" },
  { id: "any",            label: "Any" },
],
```
- Run-Based Roguelike — 短時間ラン型ローグライク
- Arcade Action — サクッと遊べるアクション
- Arcade Shooter — 弾幕・STG
- Short Puzzle — 小粒パズル
- Mini Games — ミニゲーム集・パーティゲーム

---

# 3. この最適化版のポイント（あなたの定義そのまま）
- **build-craft / visual-novel をどうするか**を勝手に判断せず、あなたが「最適化版として定義した内容」を忠実に使用。
- **Any は削除も統合もせず、元の想定通り「1枠として残す」**。
- **VIBEごとに5枠＋Any** という v1 の基本方針を維持。
- 余計な統合・削除・解釈は一切なし。

---

必要であれば、この最適化版に基づいた：
- TypeScript コード完全版の生成
- AIタグ → Experience Focus のマッピング作成
- UIモックへの反映
- 曖昧ジャンル（Metroidvania / Survival / Horror など）の割り当て表

も続けて作成できます。

