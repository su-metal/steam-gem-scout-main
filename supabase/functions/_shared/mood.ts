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

// =========================
// AI 解析を使った補正ロジック
// =========================

// analysis のうち、気分補正に使う最小限の構造だけを定義
export interface MoodAnalysisLike {
  summary?: string;
  pros?: string[];
  cons?: string[];
  labels?: string[];
  audiencePositive?: { label?: string; description?: string }[];
  audienceNegative?: { label?: string; description?: string }[];
}

// analysis からテキストを全部かき集めて 1 本の文字列にする
function buildAnalysisText(a?: MoodAnalysisLike | null): string {
  if (!a) return "";
  const parts: string[] = [];

  if (a.summary) parts.push(a.summary);
  if (a.labels?.length) parts.push(a.labels.join(" "));
  if (a.pros?.length) parts.push(a.pros.join(" "));
  if (a.cons?.length) parts.push(a.cons.join(" "));

  if (a.audiencePositive?.length) {
    for (const p of a.audiencePositive) {
      if (p.label) parts.push(p.label);
      if (p.description) parts.push(p.description);
    }
  }

  if (a.audienceNegative?.length) {
    for (const n of a.audienceNegative) {
      if (n.label) parts.push(n.label);
      if (n.description) parts.push(n.description);
    }
  }

  return parts.join(" ").toLowerCase();
}

// 0〜1 の範囲で軸をちょっとだけ増減させるユーティリティ
function bumpAxis(v: MoodVector, key: MoodSliderId, delta: number) {
  const next = v[key] + delta;
  v[key] = Math.max(0, Math.min(1, next));
}

/**
 * タグから作ったベース MoodVector に対して、
 * AI 解析（summary/pros/cons/labels/audiencePositive 等）のニュアンスで
 * 0.1〜0.25 程度の軽微な補正をかける。
 */
export function applyAiMoodAdjustment(
  base: MoodVector,
  analysis?: MoodAnalysisLike | null
): MoodVector {
  if (!analysis) return base;

  const text = buildAnalysisText(analysis);
  if (!text) return base;

  const out: MoodVector = { ...base };

  // --- Story 濃度: Play-focused ↔ Narrative ---
  if (/(物語重視|ストーリー重視|物語|ストーリー|narrative|story[- ]rich)/.test(text)) {
    bumpAxis(out, "story", 0.18);
  }
  if (/(キャラ|キャラクター|会話|ドラマ)/.test(text)) {
    bumpAxis(out, "story", 0.07);
  }

  // --- テンション: Cozy ↔ Intense ---
  if (/(ホラー|恐怖|スリル|緊張感|サバイバル|心臓に悪い|びっくり|jumpscare|intense|tense)/.test(text)) {
    bumpAxis(out, "tension", 0.22);
  }
  if (/(まったり|癒し|ゆったり|リラックス|chill|cozy|のんびり)/.test(text)) {
    bumpAxis(out, "tension", -0.22);
  }

  // --- 操作量: Passive ↔ Active ---
  if (/(アクション|爽快|テンポが速い|スピーディ|忙しい操作|コンボ|連打|dodgeroll|bullet hell)/.test(text)) {
    bumpAxis(out, "operation", 0.18);
  }
  if (/(放置|眺める|idle|オートプレイ|自動で進む)/.test(text)) {
    bumpAxis(out, "operation", -0.18);
  }

  // --- 思考負荷: Simple ↔ Deep ---
  if (/(戦略|ストラテジー|タクティクス|戦術|パズル|頭を使う|思考|ビルド構築|デッキ構築|tactical|strategy|planning)/.test(text)) {
    bumpAxis(out, "brain", 0.22);
  }
  if (/(単純|シンプル|気軽|カジュアル|難しくない)/.test(text)) {
    bumpAxis(out, "brain", -0.15);
  }

  // --- セッション長: Short ↔ Long ---
  if (/(短時間|サクッと|スキマ時間|1時間程度|30分程度|ショートセッション|short session|bite[- ]sized)/.test(text)) {
    bumpAxis(out, "session", -0.18);
  }
  if (/(長時間|腰を据えて|ボリューム|周回プレイ|やり込み|何十時間|長く遊べる|long session)/.test(text)) {
    bumpAxis(out, "session", 0.18);
  }

  return out;
}

/**
 * タグベースの MoodVector を作成し、
 * もし analysis があれば AI 補正をかけた最終ベクトルを返す。
 */
export function buildMoodFromTagsAndAnalysis(
  tags: string[],
  analysis?: MoodAnalysisLike | null
): MoodVector {
  const raw = calcRawMood(tags);
  const base = normalizeMood(raw);
  return applyAiMoodAdjustment(base, analysis);
}
