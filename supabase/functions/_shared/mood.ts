// =========================
// 5軸の型定義
// =========================
export type MoodSliderId =
  | "operation"
  | "session"
  | "tension"
  | "story"
  | "brain";

export interface MoodVector {
  operation: number;
  session: number;
  tension: number;
  story: number;
  brain: number;
}

export type TagWeights = Partial<Record<MoodSliderId, number>>;

// =========================
// Steamタグ → 5軸 重みテーブル
// =========================
// 軸ごとの最大寄与量（あとで正規化で使う）
const AXIS_SCALE: Record<MoodSliderId, number> = {
  operation: 2.5, // 操作量
  session: 2.5, // セッション長
  tension: 3.0, // Cozy ↔ Intense
  story: 3.0, // ストーリー濃度
  brain: 2.5, // 思考負荷
};

// Steamタグ → 5軸 重みテーブル（v2: 振れ幅を大きく）
export const TAG_TO_MOOD: Record<string, TagWeights> = {
  // --- アクション・戦闘寄り ---
  Action: { operation: 2.0, tension: 1.0 },
  "Action RPG": { operation: 2.0, brain: 0.8, tension: 1.5, session: 1.2 },
  Shooter: { operation: 2.5, tension: 1.5 },
  "Souls-like": { operation: 2.5, tension: 2.8, brain: 1.5, session: 1.8 },

  // ローグライク系（短時間セッション寄り）
  Roguelite: { session: -1.0, operation: 1.2, tension: 1.0, brain: 0.8 },
  Roguelike: { session: -1.0, operation: 1.0, tension: 1.0, brain: 1.0 },

  // --- Cozy / リラックス系 ---
  Relaxing: { tension: -2.5, operation: -1.5 },
  Cozy: { tension: -2.8, operation: -1.0 },
  Wholesome: { tension: -2.2, story: 1.0 },

  // --- ホラー / サバイバル系 ---
  Horror: { tension: 3.0, session: 0.8 },
  "Survival Horror": { tension: 3.0, brain: 0.8, session: 1.5 },
  Survival: { tension: 2.0, brain: 0.8, session: 1.5 },

  // --- RPG / 物語重視 ---
  RPG: { story: 1.5, brain: 0.8, session: 1.8 },
  JRPG: { story: 2.0, brain: 0.8, session: 2.2 },
  "Story Rich": { story: 2.5 },
  "Visual Novel": {
    operation: -2.0,
    story: 3.0,
    session: 1.5,
    brain: 0.8,
  },
  Adventure: { story: 1.0, tension: 0.2 },

  // --- 思考系 ---
  Strategy: { brain: 2.5, session: 2.0 },
  "Grand Strategy": { brain: 3.0, session: 2.5 },
  Tactics: { brain: 2.0, session: 1.5 },
  Puzzle: { brain: 2.0 },
  "City Builder": { brain: 2.0, session: 2.0 },
  "Card Battler": { brain: 1.5, tension: 0.5 },

  // --- Cozy系シミュレーション ---
  "Farming Sim": { tension: -2.0, story: 1.0, brain: 0.8, session: 1.8 },
  "Life Sim": { tension: -1.5, story: 1.0 },

  // --- セッション長系 ---
  Short: { session: -2.0 },
  "Short Game": { session: -2.0 },
  "Open World": { session: 2.0 },

  // TODO: 実際の Steam タグを見ながら、ここにさらに追加していく
};

// 生値の初期値
export const EMPTY_MOOD: MoodVector = {
  operation: 0,
  session: 0,
  tension: 0,
  story: 0,
  brain: 0,
};

// タグから生スコア生成
export function calcRawMood(tags: string[]): MoodVector {
  const scores: Record<MoodSliderId, number> = { ...EMPTY_MOOD };
  for (const tag of tags) {
    const w = TAG_TO_MOOD[tag];
    if (!w) continue;
    (Object.keys(w) as MoodSliderId[]).forEach((k) => {
      scores[k] += w[k]!;
    });
  }
  return scores as MoodVector;
}

// 軸ごとのスケールを使って -maxAbs〜+maxAbs → 0〜1 に正規化
export function normalizeMood(raw: MoodVector): MoodVector {
  const out: MoodVector = { ...EMPTY_MOOD };

  (Object.keys(raw) as MoodSliderId[]).forEach((k) => {
    const maxAbs = AXIS_SCALE[k]; // 例: tension は 3.0 まで
    const v = Math.max(-maxAbs, Math.min(maxAbs, raw[k]));
    out[k] = (v + maxAbs) / (2 * maxAbs); // -maxAbs〜+maxAbs → 0〜1
  });

  return out;
}
