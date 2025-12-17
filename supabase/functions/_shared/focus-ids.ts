import {
  EXPERIENCE_FOCUS_LIST,
  type ExperienceFocusId,
} from "../search-games/experience-focus.ts";

const EXPERIENCE_FOCUS_ID_SET = new Set(
  EXPERIENCE_FOCUS_LIST.map((focus) => focus.id)
);

export const FOCUS_ID_ALIAS_MAP: Record<string, ExperienceFocusId> = {
  "story-narrative-action": "story-driven-play",
};

export interface NormalizeFocusOptions {
  debugMode?: boolean;
  context?: {
    appId?: number | null;
    title?: string | null;
    source?: string | null;
  };
}

export function normalizeFocusId(
  value: string | null | undefined,
  options?: NormalizeFocusOptions
): ExperienceFocusId | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  let resolved: ExperienceFocusId | null = null;

  if (EXPERIENCE_FOCUS_ID_SET.has(normalized as ExperienceFocusId)) {
    resolved = normalized as ExperienceFocusId;
  } else if (normalized in FOCUS_ID_ALIAS_MAP) {
    resolved = FOCUS_ID_ALIAS_MAP[normalized];
  }

  if (options?.debugMode && normalized !== resolved && resolved) {
    console.warn("[focus-id-normalize]", {
      appId: options.context?.appId ?? null,
      title: options.context?.title ?? null,
      source: options.context?.source ?? null,
      oldId: normalized,
      newId: resolved,
    });
  }

  return resolved;
}
