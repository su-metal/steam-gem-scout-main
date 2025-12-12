import type {
  FeatureLabel as BaseFeatureLabel,
  FeatureLabelV2,
} from "../_shared/feature-labels.ts";
import {
  FEATURE_LABEL_DISPLAY_NAMES,
  FEATURE_LABELS_V2,
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
function collectAnalysisEvidenceTexts(analysis: any): string[] {
  if (!analysis || typeof analysis !== "object") return [];

  const gatherStrings = (input?: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    return input
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const texts = [
    ...gatherStrings(analysis.labels),
    ...gatherStrings(analysis.pros),
    ...gatherStrings(analysis.cons),
  ];

  const addAudienceFields = (audience?: any[]) => {
    if (!Array.isArray(audience)) return;
    for (const segment of audience) {
      if (!segment || typeof segment !== "object") continue;
      for (const key of [
        "label",
        "description",
        "hitReviewOriginal",
        "hitReviewParaphrased",
      ]) {
        const value = (segment as any)[key];
        if (typeof value === "string" && value.trim()) {
          texts.push(value.trim());
        }
      }
    }
  };

  addAudienceFields(analysis.audiencePositive);
  addAudienceFields(analysis.audienceNeutral);
  addAudienceFields(analysis.audienceNegative);

  return texts;
}

const PLAYER_CUSTOMIZATION_GROUP_KEYWORDS: readonly string[][] = [
  [
    "キャラクリ",
    "キャラクター作成",
    "外見",
    "見た目",
    "髪型",
    "顔",
    "衣装",
    "スキン",
    "コスメ",
    "appearance",
    "character creation",
    "custom character",
  ],
  [
    "ビルド",
    "スキルツリー",
    "パーク",
    "perk",
    "特性",
    "クラス",
    "成長方針",
    "build",
    "skill tree",
    "trait",
  ],
  [
    "ロードアウト",
    "装備構成",
    "武器構成",
    "装備セット",
    "カスタム",
    "loadout",
    "gear setup",
    "equipment",
  ],
];

const normalizedKeywords = PLAYER_CUSTOMIZATION_GROUP_KEYWORDS.map((group) =>
  group.map((keyword) => keyword.toLowerCase())
);

function matchesGroup(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

export function shouldKeepPlayerCustomization(analysis: any): boolean {
  const texts = collectAnalysisEvidenceTexts(analysis);
  if (texts.length === 0) return false;

  const groupHits = normalizedKeywords.map((keywords) =>
    texts.some((text) => matchesGroup(text, keywords))
  );

  const matchedGroups = groupHits.filter(Boolean).length;
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

  if (
    result.includes("player_customization") &&
    !shouldKeepPlayerCustomization(analysis)
  ) {
    return result.filter((label) => label !== "player_customization");
  }
  return result;
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
