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

export function normalizeAnalysisFeatureLabelsV2(
  raw?: unknown
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
