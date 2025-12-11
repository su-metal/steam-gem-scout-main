import type { FeatureLabel as BaseFeatureLabel } from "../_shared/feature-labels.ts";
import {
  FEATURE_LABEL_DISPLAY_NAMES,
  MECHANIC_FEATURE_LABELS,
  MOOD_FEATURE_LABELS,
} from "../_shared/feature-labels.ts";

export type FeatureLabel = BaseFeatureLabel;

export { FEATURE_LABEL_DISPLAY_NAMES, MECHANIC_FEATURE_LABELS, MOOD_FEATURE_LABELS };

export function normalizeAnalysisFeatureLabels(
  raw?: string[] | null
): FeatureLabel[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const result: FeatureLabel[] = [];

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const slug = item.trim();
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
