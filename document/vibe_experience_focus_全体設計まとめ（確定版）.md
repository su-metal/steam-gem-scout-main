## 設計前提（重要）

- **VIBE は必ず1つだけ選択する**
- VIBE は「今どんな気分・姿勢で遊びたいか」を表す
- Experience Focus は「その VIBE の中での体験の型」を表す
- VIBE 同士は役割が重複しない
- Experience Focus は **VIBE 内でのみ意味を持つ**（VIBE をまたいだ直接比較はしない）

---

## VIBE 一覧と役割

### 1. Chill
**軸：心理状態（リラックス・安心）**

- 落ち着きたい
- プレッシャーを感じずに遊びたい
- 雰囲気や居心地を重視

**主な Experience Focus**
- Cozy Life & Crafting（穏やかな生活・クラフト体験）
- Gentle Exploration（ゆったりとした探索）
- Light Puzzle（軽めのパズル体験）
- Relaxed Building（プレッシャーのない建築）
- Ambient Experience（雰囲気に浸る体験）

---

### 2. Story
**軸：文脈の連続性（物語・感情）**

- 物語そのものを体験したい
- 行動・選択・読解を通じて世界に没入したい
- 感情や意味の流れを追いたい

**Experience Focus（確定）**
- Narrative Action（操作しながら物語を体験する）
- Reading-Centered Story（読むこと自体が体験の中心）
- Mystery / Investigation（解きながら物語を進める）
- Choice & Consequence（選択で物語を形作る）
- Lore / Worldbuilding（世界や設定を読み解く）

---

### 3. Focus
**軸：集中の質（思考・管理・戦略）**

- 考えること自体を楽しみたい
- 状況を把握し、判断し、組み立てたい
- システムや数値と向き合いたい

**Experience Focus（確定）**
- Battle & Growth
- Tactics & Planning
- Base & Systems
- Simulation
- Optimization / Builder

---

### 4. Action
**軸：身体性・緊張感（操作を通じた能動的体験）**

**Experience Focus（確定）**
- Exploration
- Combat
- Competitive
- Tactical / Stealth
- Crowd Smash

---

### 5. Short
**軸：始めやすさ・区切りの良さ**

- サクっと始めたい
- 長い文脈や準備を必要としない
- 短時間で体験が成立する

---

## Short VIBE：Experience Focus（最終確定）

※ すべて **体験語** で統一
※ ジャンル名は使用しない
※ 語感・粒度を揃えている

### 1. Arcade Action
**操作と反射で即プレイ**

- 手触り重視
- 即スタート・即リトライ
- 短時間でも満足感が高い

**代表例**
- Dead Cells
- Hades
- Downwell
- Cuphead

---

### 2. Tactical Decisions
**短時間で考えて選ぶ**

- 判断・取捨選択が主役
- 1プレイごとの決断が重い
- 思考は深いが導入は軽い

**代表例**
- Slay the Spire
- Monster Train
- FTL
- Into the Breach

---

### 3. Puzzle Moments
**1問・1配置で完結**

- 問題単位で区切れる
- 文脈を覚えている必要がない
- 中断・再開が自然

**代表例**
- Baba Is You
- Dorfromantik
- Monument Valley
- Mini Metro

---

### 4. Flow Mastery
**流れに乗ることが快感**

- スピード感と操作の連続性
- ライン取り・ミスしない感覚
- 没入的な短時間体験

**代表例**
- Lonely Mountains: Downhill
- Trackmania
- Descenders
- OlliOlli World

---

### 5. Competitive Rounds
**1ラウンドの勝負を楽しむ**

- 勝敗・スコアが明確
- 1試合・1マッチで完結
- 対戦・競争の緊張感

**代表例**
- Rocket League
- EA Sports FC（クイックマッチ）
- Windjammers
- Fall Guys

---

## 設計レビュー結論

- VIBE 同士は見ている軸が完全に異なるため、**無駄な重複はない**
- VIBE は単一選択のため、UX 上も混乱しない
- Experience Focus は VIBE 内でのみ比較されるため、役割衝突が起きない
- 同一タイトルが複数 VIBE に属するのは **意図された再発見導線**

---

## 状態

✅ 分類設計：確定
✅ Short VIBE：確定
✅ 用語粒度・語感：統一済み

次フェーズ：UI 実装・スコアリング・検索体験への反映

