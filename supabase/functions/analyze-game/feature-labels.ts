import type {
  FeatureLabel as BaseFeatureLabel,
  FeatureLabelV2,
} from "../_shared/feature-labels.ts";
import {
  FEATURE_LABEL_DISPLAY_NAMES,
  FEATURE_LABELS_V2,
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

function flattenFeatureLabelV2Input(raw?: unknown): unknown[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (typeof raw === "string") {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw;
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

export function buildFeatureLabelsFromAnalysis(
  analysisFeatureLabels: string[] | null | undefined
): FeatureLabel[] {
  return normalizeAnalysisFeatureLabels(analysisFeatureLabels);
}

export function normalizeAnalysisFeatureLabelsV2(
  raw?: unknown
): FeatureLabelV2[] {
  const values = flattenFeatureLabelV2Input(raw);
  const seen = new Set<string>();
  const result: FeatureLabelV2[] = [];

  for (const item of values) {
    const slug = item?.toString().trim().toLowerCase();
    if (!slug) continue;
    if (!isFeatureLabelV2(slug)) continue;
    if (seen.has(slug)) continue;

    seen.add(slug);
    result.push(slug as FeatureLabelV2);
  }

  return result;
}
