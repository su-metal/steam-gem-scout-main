# Story VIBE × Experience Focus — Source of Truth（確定版）

本ドキュメントは **Story VIBE 配下の Experience Focus 判定に関する最終確定版 SoT** である。 実装・調整・デバッグにおいて迷った場合は、必ず本ドキュメントを唯一の正として参照する。

---

## 1. 全体設計の原則

### 基本思想

- 本プロダクトは **ジャンル分類ではなく体験分類** を目的とする
- Facts は「緩く保存」し、**判定は band 計算で厳密に行う**
- AI の揺らぎは前提とし、
  - Facts 層では極力情報を落とさない
  - Band 層で UX 的に破綻しない制御を行う

### レイヤー責務

- **generate-facts**
  - LLM / Steam corpus から Facts を生成
  - narrative assist / RPG assist を含む（※ただし限定的）
- **facts-v11 (FocusRule)**
  - must / mustAny / boost / ban による band 設計
- **search-games**
  - computeBand 実行
  - 最終的な ON / NEAR / DISCOVERY / OFF を確定
  - UX 安定のための *最小限の post-cap* を許容

---

## 2. Narrative / RPG Assist の確定ルール

### narrative\_driven\_progression

- Steam corpus が薄い場合でも、RPG 構造シグナルがあれば **true に assist されうる**
- ただし assist は **narrative\_driven\_progression のみ**を対象とする

### battle\_loop\_core / power\_scaling\_over\_time（重要）

- **自動 inject は行わない**
- 例外的に以下すべてを満たす場合のみ inject を許可する
  - narrativeDecisionHasRpgSignal === true
  - Steam corpus に明示的な戦闘語彙が存在
    - battle / combat / fight / turn-based / real-time など
- inject されたタグは debug.autoInjectedYesNoTags に必ず記録する

→ これにより Disco Elysium のような「非戦闘・読解型 narrative RPG」が 誤って battle\_loop\_core を持つことを防ぐ

---

## 3. Story Experience Focus 定義（確定）

### story-reading-centered-story

```ts
{
  id: "story-reading-centered-story",
  vibe: "story",
  must: [],
  mustAny: [
    "reading_heavy_interaction",
    "choice_has_consequence",
    "branching_narrative",
  ],
  boost: [
    "narrative_driven_progression",
    "lore_optional_depth",
  ],
  ban: [
    "battle_loop_core",
    "high_input_pressure",
    "precision_timing_required",
    "time_pressure",
  ],
}
```

- must は存在しない
- **mustAny が成立すれば NEAR / ON が成立しうる**
- battle\_loop\_core が入った場合のみ明確に減点される

代表例:

- Disco Elysium
- Planescape: Torment

---

### story-journey-and-growth

```ts
{
  id: "story-journey-and-growth",
  vibe: "story",
  must: [
    "narrative_driven_progression",
    "battle_loop_core",
  ],
  boost: [
    "map_reveal_progression",
    "free_movement_exploration",
    "resource_management",
    "power_scaling_over_time",
    "lore_optional_depth",
  ],
  ban: [
    "automation_core",
    "optimization_required",
    "high_input_pressure",
    "precision_timing_required",
    "time_pressure",
  ],
}
```

- **旅 × 成長 × 戦闘を伴う narrative** が対象
- JRPG / 王道RPG がここに強く寄る
- battle\_loop\_core は *事実ベース* でのみ成立すべき

代表例:

- Persona シリーズ
- Final Fantasy X

---

### story-narrative-action

- 戦闘・演出・テンポが物語牽引の主軸
- narrative\_driven\_progression + action loop が強い場合に ON

代表例:

- The Last of Us
- God of War

---

### story-choice-and-consequence

- 選択が世界状態や結末に影響する
- choice\_has\_consequence / branching\_narrative が中核

代表例:

- Baldur's Gate 3
- Detroit: Become Human

---

## 4. Band 判定の確定ルール

- must 未達
  - → 最大でも DISCOVERY
- mustAny 成立
  - → NEAR 以上が可能
- ban ヒット
  - → ON 不可（NEAR / DISCOVERY に降格）

### UX 安定用 post-cap（search-games）

- computeBand は純粋関数として保持
- UX 破綻を防ぐため、以下の条件でのみ post-cap を許可

story-journey-and-growth を **ON → NEAR に落とす条件**

- narrativeDecision === "none"
- narrativeRpgAssistApplied === true
- corpus が薄い
  - about\_the\_game 不在 or 総文字数 < 800

※ JRPG / Persona / FF のような厚い corpus は対象外

---

## 5. デバッグ可視性（必須）

- mustHits / mustMissing
- mustAnyHits / mustAnyMissing
- autoInjectedYesNoTags
- selectedFocusBand === allFocusBands[experienceFocusId]

→ 表示の不整合は **バグ扱い** とする

---

## 6. この SoT が保証すること

- Disco Elysium

  - story-reading-centered-story: NEAR / ON
  - story-journey-and-growth: OFF / DISCOVERY

- Persona / FF

  - story-journey-and-growth: ON
  - story-reading-centered-story: NEAR

- Witcher 3

  - story-journey-and-growth: NEAR
  - story-narrative-action: ON

---

以上を **Story VIBE × Experience Focus の最終確定 SoT** とする。

