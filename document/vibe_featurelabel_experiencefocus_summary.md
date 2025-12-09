# Vibe × FeatureLabel × Experience Focus 全体設計まとめ（最新版）

## ■ 1. VIBE（5カテゴリ）

| Vibe | 意味 | コア体験 |
|------|------|-----------|
| **chill** | リラックスして遊びたい | Cozy / Relax / Ambient |
| **story** | 物語を味わいたい | Narrative / Drama / Mystery |
| **focus** | 頭を使いたい | Strategy / Tactics / Planning |
| **speed** | 緊張感・反射神経 | Action / Rhythm / Precision |
| **short** | 1プレイが短い | Roguelike / Arcade / Micro-session |

---

## ■ 2. Experience Focus（各Vibe 5種 + Any）

### **Chill**
- Cozy Life & Crafting  
- Gentle Exploration  
- Light Puzzle  
- Relaxed Building  
- Ambient Experience  
- Any

### **Story**
- Story-Driven  
- Character Drama  
- Mystery & Investigation  
- Emotional Journey  
- Lore / Worldbuilding  
- Any

### **Focus**
- Turn-Based Tactics  
- Deckbuilding Strategy  
- Grand Strategy  
- Automation / Factory Strategy  
- Colony Management  
- Any

### **Speed**
- Action Combat  
- Precision Shooter  
- Rhythm / Music Action  
- Sports & Arena  
- High-Intensity Roguelike  
- Any

### **Short**
- Run-Based Roguelike  
- Arcade Action  
- Arcade Shooter  
- Short Puzzle  
- Micro Progression  
- Any

---

## ■ 3. FeatureLabel（35カテゴリ：体験の語彙）

### 🎭 **Story / Narrative 系**
- story_driven
- character_drama
- mystery_investigation
- emotional_journey
- dialogue_heavy
- branching_choice
- social_deduction_narrative

### 🌿 **Chill / Cozy / Atmosphere 系**
- cozy_atmosphere
- wholesome_chill
- ambient_experience
- gentle_exploration
- light_puzzle
- cozy_life_crafting

### 🧠 **Tactical / Strategy 系**
- turn_based_tactics
- deckbuilding_strategy
- grand_strategy
- automation_factory
- colony_management

### ⚡ **Action / Speed 系**
- action_combat
- precision_shooter
- rhythm_action
- sports_arena
- high_intensity

### 🎮 **Short / Roguelike 系**
- run_based_roguelike
- arcade_action
- arcade_shooter
- micro_progression
- short_puzzle

### 🛠 **Sandbox / Building 系**
- base_building
- crafting
- exploration_core

### 🌀 **Tension / Mood 系（雰囲気の単独要素）**
- dark_tension
- sci_fi_mystery
- psychological_atmosphere

---

## ■ 4. Vibe → FeatureLabel（雰囲気一致マッピング）

### **Chillに強く紐づくラベル**
- cozy_atmosphere
- wholesome_chill
- gentle_exploration
- ambient_experience
- relaxed_building（= base_building / cozy life 系）

### **Storyに強く紐づくラベル**
- story_driven
- character_drama
- emotional_journey
- mystery_investigation
- dialogue_heavy
- branching_choice

### **Focusに強く紐づくラベル**
- turn_based_tactics
- deckbuilding_strategy
- automation_factory
- colony_management
- grand_strategy

### **Speedに強く紐づくラベル**
- action_combat
- precision_shooter
- rhythm_action
- sports_arena
- high_intensity

### **Shortに強く紐づくラベル**
- run_based_roguelike
- arcade_action
- arcade_shooter
- micro_progression
- short_puzzle

---

## ■ 5. FeatureLabel → Experience Focus（マッチ度算出）
```
+3 = 完全一致（そのFocusの中核要素）
+2 = 強い関連
+1 = 弱い関連
0  = 関係なし
-1 = ズレている
```
ExperienceFocus と FeatureLabel の組み合わせに応じて VibeFocusMatchScore を算出。検索結果を並べる際の「体験一致度」に利用。

---

## ■ 6. aiTags → FeatureLabels の変換フロー
1. AI が出力した aiTags を正規化
2. genre-slug とは独立した **mechanic 抽出補強**（crafting / building など）
3. **Story Heavy 判定の強化**
4. `mapAiTagsToFeatureLabels` により候補抽出
5. `ensureMinimumLabels` により
   - 最低3本保証
   - Story ゲームでは Story系を必ず先頭へ
   - Sandbox / Rhythm / Sports などの fallback は Story を上書きしない
6. 最大12までに整形

これにより、GNOSIA のようなストーリー系が壊れる問題を根本的に解決。

---

## ■ 7. この設計の目的
- Vibe（気分）でゲーム探しの入口を作る
- FeatureLabel でゲーム体験の「共通語」を作る
- Experience Focus で細かい方向性を定義する
- 三層構造により **精度の高い体験検索** が可能になる

---

以上が現時点での最新・完全な体系です。

