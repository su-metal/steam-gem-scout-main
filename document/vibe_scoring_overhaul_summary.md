# 🎯 VIBEスコアリング再設計：取り決め & 今後の実装計画（サマリー）

本ドキュメントは、これまでの議論で合意した内容を整理し、
**次のチャットで具体実装に着手できる状態**にまとめたものです。

---

# ✅ 1. 根本方針：5軸ベースから AI特徴ラベルベースの分類へ移行

従来：
- session / operation / story / tension / brain の **5軸距離ベース**でスコア算出
- → VIBE UI（Chill / Focus / Story…）との整合性が弱い

今後：
- AI解析で抽出した **Feature Labels（ゲーム体験特徴）** を中心に
- 各 VIBE が「どんな特徴ラベルを強く求めるか」でスコアリングする方式に変更

結論：
> **VIBE分類のコアロジックは Feature Labels × VIBE相性マップ で行う。**
> 5軸は“補助的な性格可視化”として扱う（コア判定には使わない）。

---

# ✅ 2. AI解析で抽出する Feature Labels のカテゴリ

### ■ ゲーム体験（Feel）
- cozy / relaxing / meditative / atmospheric / emotional
- tense / fast-paced / chaotic / high-intensity
- casual-friendly / hardcore

### ■ ゲーム構造（Mechanics）
- puzzle-heavy / logic-heavy / tactical / strategic
- exploration-heavy / crafting / building / farming
- shooter / action-combat / platformer / rhythm
- roguelike / run-based / short-session
- progression-heavy / grindy

### ■ 物語（Narrative）
- story-driven / character-driven / emotional-narrative
- mystery-focused / lore-rich / cinematic / minimal-story

> これらは AI（HiddenGemAnalysis）に抽出させる“特徴ベクトル”になる。

---

# ✅ 3. 各 VIBE が強く求める特徴ラベル（公式マッピング v1）

### 🟩 CHILL
**cozy / relaxing / meditative / atmospheric / casual-friendly / low-tension**
- 加点：light puzzle, gentle-exploration, slow pace
- 減点：high-intensity, horror, competitive

### 🟦 STORY
**story-driven / emotional-narrative / character-driven / atmospheric**
- 加点：mystery, exploration-narrative, cinematic
- 減点：minimal-story, hardcore-action

### 🟧 FOCUS
**tactical / strategic / puzzle-heavy / logic-heavy / deckbuilding**
- 加点：planning, resource-management
- 減点：chaotic-action, overly-relaxed

### 🟥 SPEED
**fast-paced / high-intensity / shooter / action-combat / rhythm / high-apm**
- 加点：competitive, roguelite（テンポ速いもの）
- 減点：meditative, slow-story-driven

### 🟨 SHORT
**short-session / run-based / arcade / simple-control / fast gratification**
- 加点：roguelike, bite-sized progression
- 減点：long-form story, heavy strategy

> これが **VIBE × Feature Labels 相性表のベース**になる。

---

# ✅ 4. Experience Focus の扱い

- Experience Focus（Light Puzzle, Tactical, Narrative など）は
  **VIBEの補正レイヤー**として扱う。
- 例：Chill × Light Puzzle → puzzle-heavy に +0.3 / brain に +0.2 など
- “VIBEが大枠、Focusが微調整”という構造に統一する。

---

# ✅ 5. スコアの最終出力は 3段階の「VIBEフィット」だけに統一

UIに数値スコア（％）は出さない。

### 出力は次の 3 種類：
- **ON VIBE**（今回の VIBE に強くフィット）
- **NEAR VIBE**（方向性が近い）
- **DISCOVERY**（少しズレるが“寄り道として魅力的”）

内部のスコア計算式例：
```
vibeMatchScore = 0.6 * featureLabelMatch + 0.4 * focusAdjustment
```

### ゲーム側が最低限持つデータ
- featureLabels（AI解析結果）
- vibeMatchScore（内部数値）
- vibeMatchCategory（ON / NEAR / DISCOVERY）

---

# ✅ 6. GameDetail での可視化方針

旧：5軸スコア＋％マッチ → 破棄

新：
- 右上に **ON VIBE / NEAR / DISCOVERY** バッジ
- 中央に“GAME FEEL”オーブ
- 下部に「どの特徴が今回のVIBEから見て強いか」を説明
- 5軸は補助的に利用（必要なら簡易的なプロフィール表示に）

※ 5軸は「比較のための中間表現」であり、判定の主役ではない。

---

# ✅ 7. SearchResultCard の方針
- マッチ％バッジは完全廃止
- **VIBEフィットの3段階バッジ**を右上に表示
- バッジ色は high / mid / low に対応（emerald / sky / amber）

---

# 🔥 今後の実装タスク（段階的）

## **STEP 1：Feature Labels の抽出仕様を決める**
- HiddenGemAnalysis の出力項目に Feature Labels を追加
- タグ化する語彙リスト（60～80項目）を作成

## **STEP 2：VIBE相性マップの数値化（0〜1）**
- 本ドキュメントの qualitative マップ → quantitative マップへ変換
- JSONで扱えるようにする

## **STEP 3：vibeMatchScore の算出ロジックを実装**
- featureLabels × vibeMap → スコア
- Experience Focus 補正
- ON / NEAR / DISCOVERY の分類

## **STEP 4：SearchResultCard / GameDetail UI 改修**
- ％バッジ廃止 → フィットバッジ導入
- GameDetail の VIBE PROFILE エリアを再構築

## **STEP 5：バックエンド側のスコア計算更新**
- search-games / analyze-game のロジック差し替え

---

# ✨ これで「VIBEで選ぶ」体験と内部ロジックが完全に一致する

- 5軸ベースの“抽象指標”から脱却
- AI解析の強みを最大限活かした現代的スコアリングへ移行
- UI に表示される情報はシンプルで直感的（ON / NEAR / DISCOVERY）
- 裏側は説明可能性が高く運用もしやすい

---

必要であれば、次チャットで：
- Feature Labels の語彙リスト案（最新版）
- VIBE×Feature の数値マッピング表
- 実際のスコア計算アルゴリズム（TypeScript案）
- GameDetail / SearchPage への取り込み方

まで一気に作成できます。


# 🔗 VIBE 対応表（UI名 ↔ 内部ID ↔ 特徴ラベルコア）

| **UI表示名** | **内部カテゴリID** | **特徴ラベルの核（Feature Labels Core）** |
|--------------|----------------------|-----------------------------------------------|
| **ZenMode** | **Chill** | cozy / relaxing / meditative / atmospheric / low‑tension / gentle‑exploration / light‑puzzle |
| **Narrative** | **Story** | story‑driven / emotional / character‑focused / atmospheric / cinematic / immersive |
| **Tactical** | **Focus** | strategic / logic‑heavy / puzzle‑heavy / planning / resource‑management / systems‑driven |
| **Adrenaline** | **Speed** | fast‑paced / reaction‑based / high‑intensity / shooter‑focused / combo‑action / high‑apm |
| **Quick Run** | **Short** | short‑session / run‑based / arcade / simple‑control / fast‑gratification |

この表が、**UIが見せる世界観（気分）**と、**内部ロジックが扱う分類軸**を一つに結びつける“公式のマッピング”になります。

---

# 📌 この表が保証すること

### ■ 1. 表示名と内部判定ロジックに一切の矛盾がなくなる
例：Adrenaline（UI）＝ Speed（内部）＝ fast‑paced, intense, reaction-based で整合性が完全確保。

### ■ 2. Feature Labels によるスコア計算の軸が明確になる
内部ロジックで何を重視すべきかがこの表だけで把握できる。

### ■ 3. UIを変更してもロジックが壊れない
「ZenMode」を「Relax」に変えても内部IDは Chill のため、判定は揺れない。

---

# ✅ 次のステップ（あなたの指示 2️⃣）
続いて **Quick Run（Short）** の VIBE定義を作ります。
CHILL / STORY / FOCUS / SPEED と同じ手法で、
- Steamの代表作 →
- 共通特徴 →
- Feature Labels化
の順で作成します。

準備が整っていますので、次のメッセージで **Short（Quick Run）定義**を提示します。
