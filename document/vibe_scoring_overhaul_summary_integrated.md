# 🎯 VIBE SCORING OVERHAUL SUMMARY — 完全統合最新版

以下は、あなたがこれまで提示してきた全ファイル：
- **vibe_scoring_overhaul_summary_latest**（キャンバスの最新版）
- **vibe_experience_focus_mapping_v_1.md** fileciteturn34file0
- **steam_gem_finder_spec.md** fileciteturn34file1
- **steam_import_pipeline_spec.md** fileciteturn34file2
- **気分プリセット〜search_games〜表示までの流れ.md** fileciteturn34file4
- **vibe_experience_focus_master_list.md** fileciteturn34file6

これらの内容から **矛盾なく共通化できる項目のみを統合した正式仕様** です。
重複部分は一本化し、衝突する内容は最新の合意に基づき調整しています。

本ドキュメントは **VIBE体系・スコアリング体系・Feature Labels体系・検索フロー体系** を一体化した、現時点での「正式版仕様書」です。

---

# 1. 🎮 アプリ全体の基本思想（共通仕様）

### ■ アプリの目的
- Steam の **埋もれた良作 / 気分に合うゲーム** を自然に発見できるようにする。
- ユーザーは **気分（VIBE）→ 体験方向性（Experience Focus）→ 詳細フィルター** の順で探す。
- ジャンル検索ではなく「気分から探す」ことが最初の入口となる。

### ■ 情報構造（フロー）
1. **Index（気分プリセット選択）**
2. **SearchPage（VIBE × Experience Focus に応じた検索結果）**
3. **GameDetail（AI解析による深い理解）**

この 3 層構造は全ドキュメントで一貫している。

---

# 2. 🌈 VIBE（気分分類）体系 — 統一最新版

すべての資料から一致した 5分類：

| VIBE（UI名） | 内部ID | コア特徴（Feature Labels） |
|--------------|----------|-------------------------------|
| ZenMode | Chill | cozy / relaxing / meditative / atmospheric / gentle-exploration |
| Narrative | Story | story-driven / emotional / character-driven / mystery / lore-rich |
| Tactical | Focus | strategic / logic-heavy / systems-driven / automation / colony |
| Adrenaline | Speed | fast-paced / reaction-based / high-intensity / shooter / action-combat / sports |
| Quick Run | Short | short-session / arcade / run-based / micro-progression |

→ これらは **vibe_experience_focus_master_list.md** と **v1 mapping** の内容を完全統合した形。

---

# 3. 🧭 Experience Focus（各VIBE 5枠 + Any）— 完全統合版

## 🌿 ZenMode（Chill）
1. Cozy Life & Crafting  
2. Gentle Exploration  
3. Light Puzzle  
4. Relaxed Building / Townmaking  
5. Ambient Experience（癒し・視覚没入）  
6. Any

---

## 📖 Narrative（Story）
1. Story-Driven  
2. Character Drama  
3. Mystery & Investigation  
4. Emotional Journey  
5. Lore / Worldbuilding  
6. Any

---

## 🧠 Tactical（Focus）
1. Turn-Based Tactics  
2. Deckbuilding Strategy  
3. Grand Strategy  
4. Automation / Factory Strategy  
5. Colony Management  
6. Any

---

## ⚡ Adrenaline（Speed）
1. Action Combat  
2. Precision Shooter  
3. Rhythm / Music Action  
4. Sports & Arena（競技/格闘含む）  
5. High-Intensity Roguelike  
6. Any

---

## ⏱ Quick Run（Short）
1. Run-Based Roguelike  
2. Arcade Action  
3. Arcade Shooter  
4. Short Puzzle  
5. Micro Progression  
6. Any

→ **全資料で矛盾なく統合可能だった完全版**。

---

# 4. 🧠 Feature Labels（AI解析構造）— 整合と統合

すべての仕様に登場するラベル構造を整理し、次の3カテゴリに統一：

### ■ FEEL（雰囲気・テンション）
cozy / relaxing / meditative / atmospheric / emotional / tense / fast-paced / chaotic / high-intensity / casual-friendly / hardcore

### ■ MECHANICS（遊びの構造）
puzzle-heavy / logic-heavy / tactical / strategic / exploration-heavy / crafting / building / farming / shooter / action-combat / platformer / rhythm / roguelike / run-based / short-session / micro-progression / automation / factory / colony-management / resource-management / deckbuilding / grand-strategy

### ■ NARRATIVE（物語の性質）
story-driven / character-driven / emotional-narrative / mystery / investigation / lore-rich / cinematic / minimal-story

→ 各 VIBE のコア特徴はこのラベル群から抽出して定義済み。

---

# 5. 🧩 VIBE × Feature Labels の一致度スコア（重要）

### ■ 主役は 5軸ではなく、Feature-Label ベースの一致度
以前の：5軸ベクトル（session / operation / tension / story / brain）
→ 現在：**Feature Labels × VIBEコア特徴の相性値** が主軸

ただし：5軸は GameDetail での演出的“補助表示”として残す（資料間で矛盾なし）。

### ■ 3段階分類（UI表示）
- **ON VIBE**（強一致）
- **NEAR VIBE**（部分一致）
- **DISCOVERY**（ズレているが面白い脇道）

※ すべての資料で合意している最新仕様。

---

# 6. 🔍 Search フロー（Index → Search → GameDetail）— 正式統合版

### ① Index（気分プリセット選択）
- primaryVibePreset を決定
- Experience Focus を選択
- これらを `navigate('/search', state)` で渡す

### ② SearchPage
- 受け取った VIBE と Focus から内部検索条件を生成
- `search-games` 関数に渡す

### ③ search-games（Supabase Functions）
- 倉庫：`steam_games`
- ショーウィンドウ：`game_rankings_cache`
- AI解析：`analyze-hidden-gem`

→ pipeline は **steam_import_pipeline_spec.md** の記述と矛盾なし。

### ④ SearchResultCard / GameDetail
- moodScore（→ 現在は廃止）
- 新方式：**vibeFit（ON/NEAR/DISCOVERY）** のみ表示
- GameDetail では Feature Labels に基づく「Why it fits」を表示

---

# 7. 🔧 ランキングスコア体系（baseScore × vibeFit）

### ■ baseScore（品質フィルタ）
- レビュー品質
- プレイ時間の適正
- 価格帯の健全性
- リリース年補正

### ■ vibeFit（気分一致度）
VIBE と Feature Labels の一致度により 3段階分類

### ■ 表示方法
- %表示は完全廃止
- 決定した 3分類のみを UI に表示

→ 全資料で矛盾なし。

---

# 8. 🗄 Steam Import Pipeline（統合）

3層モデル（完全一致）：
1. **steam_games**（倉庫）
2. **game_rankings_cache**（ショーウィンドウ）
3. **analyze-hidden-gem**（AI解析）

Import filtered games は倉庫→ショーケースのコピーのみ（AIもSteam APIも叩かない）
→ steam_import_pipeline_spec と整合。

---

# 9. ✔ この統合版の目的
- すべての資料間の **矛盾を排除**
- 最新の議論内容（例：Sportsの扱い）を反映
- VIBE検索と Hidden Gem 検索を統一思想で扱えるように再構成
- 今後実装する **VIBE × Feature × Focus の相性マトリクス** への基礎

---

# 10. 次のステップ（提案）
- Feature Labels 正式語彙リストを確定
- VIBE × Feature ラベルの数値マトリクス作成
- TypeScript に落とすスコアリング関数の生成
- SearchPage / GameDetail 新UIへの組み込み

---

このドキュメントは、現時点での **完全統合された最新仕様書** です。
必要であればこの上にすぐ実装設計を追加できます。