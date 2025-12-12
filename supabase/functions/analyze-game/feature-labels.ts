import type {
  FeatureLabel as BaseFeatureLabel,
  FeatureLabelV2,
} from "../_shared/feature-labels.ts";
import {
  FEATURE_LABEL_DISPLAY_NAMES,
  FEATURE_LABEL_V2_ALIASES,
  isFeatureLabelV2,
  MECHANIC_FEATURE_LABELS,
  MOOD_FEATURE_LABELS,
} from "../_shared/feature-labels.ts";

export type FeatureLabel = BaseFeatureLabel;

export { FEATURE_LABEL_DISPLAY_NAMES, MECHANIC_FEATURE_LABELS, MOOD_FEATURE_LABELS };

function flattenFeatureLabelInput(
  raw?: string[] | string | null
): string[] {
  if (!raw) return [];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw;
  return [];
}

function flattenFeatureLabelV2Input(raw?: unknown): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (typeof raw === "string") {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      typeof item === "string" ? item : item?.toString() ?? ""
    );
  }
  return [];
}

export function normalizeAnalysisFeatureLabels(
  raw?: string[] | null
): FeatureLabel[] {
  const values = flattenFeatureLabelInput(raw ?? []);
  const seen = new Set<string>();
  const result: FeatureLabel[] = [];

  for (const item of values) {
    const slug = item?.toString().trim().toLowerCase();
    if (!slug) continue;
    if (seen.has(slug)) continue;

    seen.add(slug);
    result.push(slug as FeatureLabel);
  }

  return result;
}
const FILTERED_FEATURE_LABEL_KEYWORDS: Record<string, readonly string[]> = {
  player_customization: [
    "キャラクリ",
    "キャラクター作成",
    "外見",
    "見た目",
    "髪型",
    "顔",
    "衣装",
    "スキン",
    "コスメ",
    "character creation",
    "custom character",
    "appearance",
    "build",
    "skill tree",
    "perk",
    "loadout",
    "gear",
    "equipment",
  ],
  base_building: [
    "拠点",
    "基地",
    "建設",
    "建造",
    "建築",
    "ハブ",
    "フォートレス",
    "outpost",
    "camp",
    "base building",
    "settlement",
  ],
  automation_logic: [
    "自動化",
    "automation",
    "logic",
    "workflow",
    "triggers",
    "システム",
    "トリガー",
    "macro",
  ],
  automation_processes: [
    "プロセス",
    "process",
    "pipeline",
    "flow",
    "sequence",
    "automation",
    "自動化",
  ],
  colony_management: [
    "コロニー",
    "植民地",
    "入植",
    "settlement",
    "colonist",
    "colony management",
  ],
  survival_loop: [
    "サバイバル",
    "生存",
    "survive",
    "survival loop",
    "resource loop",
    "資源",
    "ループ",
    "耐える",
  ],
  choice_consequence: [
    "選択",
    "分岐",
    "決断",
    "結果",
    "ルート",
    "選び方",
    "行動で変化",
    "取り返し",
    "影響",
    "choice",
    "consequence",
    "branching",
    "decision",
    "route",
    "outcomes",
  ],
  multiple_endings: [
    "マルチエンディング",
    "複数エンディング",
    "真エンド",
    "バッドエンド",
    "別エンド",
    "エンディング回収",
    "multiple endings",
    "alternate endings",
    "true ending",
    "bad ending",
  ],
};

const FILTERED_FEATURE_LABEL_KEYWORDS_LOWER = Object.fromEntries(
  Object.entries(FILTERED_FEATURE_LABEL_KEYWORDS).map(([label, keywords]) => [
    label,
    keywords.map((keyword) => keyword.toLowerCase()),
  ])
) as Record<string, readonly string[]>;

function collectTextFromValue(raw?: unknown): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(raw)) {
    const result: string[] = [];
    for (const item of raw) {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed) {
          result.push(trimmed);
        }
      }
    }
    return result;
  }

  return [];
}

function collectAudienceTexts(analysis: any): string[] {
  const result: string[] = [];
  if (!analysis) return result;

  for (const audienceKey of [
    "audiencePositive",
    "audienceNeutral",
    "audienceNegative",
  ]) {
    const audience = analysis[audienceKey];
    if (!Array.isArray(audience)) continue;
    for (const segment of audience) {
      if (!segment || typeof segment !== "object") continue;
      for (const key of [
        "label",
        "description",
        "hitReviewOriginal",
        "hitReviewParaphrased",
        "missReviewOriginal",
        "missReviewParaphrased",
      ]) {
        const value = (segment as any)[key];
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed) {
            result.push(trimmed);
          }
        }
      }
    }
  }

  return result;
}

function collectSummaryTexts(analysis: any): string[] {
  const summaries: string[] = [];
  if (!analysis) return summaries;

  for (const key of ["summary", "reason"]) {
    const value = analysis[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        summaries.push(trimmed);
      }
    }
  }

  return summaries;
}

function hasKeywordMatch(texts: string[], keywords: readonly string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return true;
      }
    }
  }
  return false;
}

export function shouldKeepFeatureLabelByEvidence(
  label: FeatureLabelV2,
  analysis: any
): boolean {
  if (!analysis) return false;
  const keywords = FILTERED_FEATURE_LABEL_KEYWORDS_LOWER[label];
  if (!keywords || keywords.length === 0) {
    return true;
  }

  const evidenceGroups = [
    [...collectTextFromValue(analysis?.pros), ...collectTextFromValue(analysis?.cons)],
    collectTextFromValue(analysis?.labels),
    collectAudienceTexts(analysis),
    collectSummaryTexts(analysis),
  ];

  const matchedGroups = evidenceGroups.reduce((count, texts) => {
    if (hasKeywordMatch(texts, keywords)) {
      return count + 1;
    }
    return count;
  }, 0);

  return matchedGroups >= 2;
}

export function normalizeAnalysisFeatureLabelsV2(
  raw?: unknown,
  analysis?: any
): FeatureLabelV2[] {
  const values = flattenFeatureLabelV2Input(raw);
  const seen = new Set<string>();
  const result: FeatureLabelV2[] = [];

  for (const item of values) {
    if (!item) continue;
    const canonical = FEATURE_LABEL_V2_ALIASES[item.trim().toLowerCase()] ?? item.trim().toLowerCase();
    if (!canonical) continue;
    if (!isFeatureLabelV2(canonical)) continue;
    if (seen.has(canonical)) continue;

    seen.add(canonical);
    result.push(canonical as FeatureLabelV2);
  }

  if (!analysis) {
    return result;
  }

  return result.filter((label) => {
    if (!FILTERED_FEATURE_LABEL_KEYWORDS[label]) return true;
    return shouldKeepFeatureLabelByEvidence(label, analysis);
  });
}

export function normalizeAnalysisFeatureLabelsV2Raw(raw?: unknown): string[] {
  const values = flattenFeatureLabelV2Input(raw);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of values) {
    if (!item) continue;
    const slug = item.trim().toLowerCase();
    if (!slug) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
  }

  return result;
}
