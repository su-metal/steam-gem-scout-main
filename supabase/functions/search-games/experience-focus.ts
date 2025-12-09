// TODO: 後で _shared に切り出して共通化してもOK。
// ひとまず search-games 側でも同じ定義を持たせる。

export type Vibe = "Chill" | "Story" | "Focus" | "Speed" | "Short";

export type FeatureLabel =
  // 🌿 Chill
  | "Cozy Life & Crafting"
  | "Gentle Exploration"
  | "Light Puzzle"
  | "Relaxed Building"
  | "Ambient Experience"
  // 📖 Story
  | "Story-Driven"
  | "Character Drama"
  | "Mystery & Investigation"
  | "Emotional Journey"
  | "Lore / Worldbuilding"
  // 🧠 Focus
  | "Turn-Based Tactics"
  | "Deckbuilding Strategy"
  | "Grand Strategy"
  | "Automation / Factory Strategy"
  | "Colony Management"
  // ⚡ Speed
  | "Action Combat"
  | "Precision Shooter"
  | "Rhythm / Music Action"
  | "Sports & Arena"
  | "High-Intensity Roguelike"
  // ⏱ Short
  | "Run-Based Roguelike"
  | "Arcade Action"
  | "Arcade Shooter"
  | "Short Puzzle"
  | "Micro Progression";


export type ExperienceFocusId =
  // Chill
  | "chill-cozy-life-crafting"
  | "chill-gentle-exploration"
  | "chill-light-puzzle"
  | "chill-relaxed-building"
  | "chill-ambient-experience"
  | "chill-any"
  // Story
  | "story-story-driven"
  | "story-character-drama"
  | "story-mystery-investigation"
  | "story-emotional-journey"
  | "story-lore-worldbuilding"
  | "story-any"
  // Focus
  | "focus-turn-based-tactics"
  | "focus-deckbuilding-strategy"
  | "focus-grand-strategy"
  | "focus-automation-factory-strategy"
  | "focus-colony-management"
  | "focus-any"
  // Speed
  | "speed-action-combat"
  | "speed-precision-shooter"
  | "speed-rhythm-music-action"
  | "speed-sports-arena"
  | "speed-high-intensity-roguelike"
  | "speed-any"
  // Short
  | "short-run-based-roguelike"
  | "short-arcade-action"
  | "short-arcade-shooter"
  | "short-short-puzzle"
  | "short-micro-progression"
  | "short-any";

export interface ExperienceFocus {
  id: ExperienceFocusId;
  vibe: Vibe;
  /** UIに出す名前（ボタンのラベル） */
  label: string;
  /** このFocusで“強く見たい”FeatureLabel群 */
  featureLabels: FeatureLabel[];
}

export const EXPERIENCE_FOCUS_LIST: ExperienceFocus[] = [
  // 🌿 Chill
  {
    id: "chill-cozy-life-crafting",
    vibe: "Chill",
    label: "Cozy Life & Crafting",
    featureLabels: ["Cozy Life & Crafting"],
  },
  {
    id: "chill-gentle-exploration",
    vibe: "Chill",
    label: "Gentle Exploration",
    featureLabels: ["Gentle Exploration"],
  },
  {
    id: "chill-light-puzzle",
    vibe: "Chill",
    label: "Light Puzzle",
    featureLabels: ["Light Puzzle"],
  },
  {
    id: "chill-relaxed-building",
    vibe: "Chill",
    label: "Relaxed Building",
    featureLabels: ["Relaxed Building"],
  },
  {
    id: "chill-ambient-experience",
    vibe: "Chill",
    label: "Ambient Experience",
    featureLabels: ["Ambient Experience"],
  },
  {
    id: "chill-any",
    vibe: "Chill",
    label: "Any",
    featureLabels: [
      "Cozy Life & Crafting",
      "Gentle Exploration",
      "Light Puzzle",
      "Relaxed Building",
      "Ambient Experience",
    ],
  },

  // 📖 Story
  {
    id: "story-story-driven",
    vibe: "Story",
    label: "Story-Driven",
    featureLabels: ["Story-Driven"],
  },
  {
    id: "story-character-drama",
    vibe: "Story",
    label: "Character Drama",
    featureLabels: ["Character Drama"],
  },
  {
    id: "story-mystery-investigation",
    vibe: "Story",
    label: "Mystery & Investigation",
    featureLabels: ["Mystery & Investigation"],
  },
  {
    id: "story-emotional-journey",
    vibe: "Story",
    label: "Emotional Journey",
    featureLabels: ["Emotional Journey"],
  },
  {
    id: "story-lore-worldbuilding",
    vibe: "Story",
    label: "Lore / Worldbuilding",
    featureLabels: ["Lore / Worldbuilding"],
  },
  {
    id: "story-any",
    vibe: "Story",
    label: "Any",
    featureLabels: [
      "Story-Driven",
      "Character Drama",
      "Mystery & Investigation",
      "Emotional Journey",
      "Lore / Worldbuilding",
    ],
  },

  // 🧠 Focus（Tactical）
  {
    id: "focus-turn-based-tactics",
    vibe: "Focus",
    label: "Turn-Based Tactics",
    featureLabels: ["Turn-Based Tactics"],
  },
  {
    id: "focus-deckbuilding-strategy",
    vibe: "Focus",
    label: "Deckbuilding Strategy",
    featureLabels: ["Deckbuilding Strategy"],
  },
  {
    id: "focus-grand-strategy",
    vibe: "Focus",
    label: "Grand Strategy",
    featureLabels: ["Grand Strategy"],
  },
  {
    id: "focus-automation-factory-strategy",
    vibe: "Focus",
    label: "Automation / Factory Strategy",
    featureLabels: ["Automation / Factory Strategy"],
  },
  {
    id: "focus-colony-management",
    vibe: "Focus",
    label: "Colony Management",
    featureLabels: ["Colony Management"],
  },
  {
    id: "focus-any",
    vibe: "Focus",
    label: "Any",
    featureLabels: [
      "Turn-Based Tactics",
      "Deckbuilding Strategy",
      "Grand Strategy",
      "Automation / Factory Strategy",
      "Colony Management",
    ],
  },

  // ⚡ Speed（Adrenaline）
  {
    id: "speed-action-combat",
    vibe: "Speed",
    label: "Action Combat",
    featureLabels: ["Action Combat"],
  },
  {
    id: "speed-precision-shooter",
    vibe: "Speed",
    label: "Precision Shooter",
    featureLabels: ["Precision Shooter"],
  },
  {
    id: "speed-rhythm-music-action",
    vibe: "Speed",
    label: "Rhythm / Music Action",
    featureLabels: ["Rhythm / Music Action"],
  },
  {
    id: "speed-sports-arena",
    vibe: "Speed",
    label: "Sports & Arena",
    featureLabels: ["Sports & Arena"],
  },
  {
    id: "speed-high-intensity-roguelike",
    vibe: "Speed",
    label: "High-Intensity Roguelike",
    featureLabels: ["High-Intensity Roguelike"],
  },
  {
    id: "speed-any",
    vibe: "Speed",
    label: "Any",
    featureLabels: [
      "Action Combat",
      "Precision Shooter",
      "Rhythm / Music Action",
      "Sports & Arena",
      "High-Intensity Roguelike",
    ],
  },

  // ⏱ Short（Quick Run）
  {
    id: "short-run-based-roguelike",
    vibe: "Short",
    label: "Run-Based Roguelike",
    featureLabels: ["Run-Based Roguelike"],
  },
  {
    id: "short-arcade-action",
    vibe: "Short",
    label: "Arcade Action",
    featureLabels: ["Arcade Action"],
  },
  {
    id: "short-arcade-shooter",
    vibe: "Short",
    label: "Arcade Shooter",
    featureLabels: ["Arcade Shooter"],
  },
  {
    id: "short-short-puzzle",
    vibe: "Short",
    label: "Short Puzzle",
    featureLabels: ["Short Puzzle"],
  },
  {
    id: "short-micro-progression",
    vibe: "Short",
    label: "Micro Progression",
    featureLabels: ["Micro Progression"],
  },
  {
    id: "short-any",
    vibe: "Short",
    label: "Any",
    featureLabels: [
      "Run-Based Roguelike",
      "Arcade Action",
      "Arcade Shooter",
      "Short Puzzle",
      "Micro Progression",
    ],
  },
];

export const EXPERIENCE_FOCUS_BY_VIBE: Record<Vibe, ExperienceFocus[]> =
  {
    Chill: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "Chill"),
    Story: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "Story"),
    Focus: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "Focus"),
    Speed: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "Speed"),
    Short: EXPERIENCE_FOCUS_LIST.filter((f) => f.vibe === "Short"),
  };
