import {
  EXPERIENCE_FOCUS_LIST,
  type ExperienceFocusId,
} from "../../supabase/functions/search-games/experience-focus.ts";

const EXPERIENCE_FOCUS_ID_SET = new Set<ExperienceFocusId>(
  EXPERIENCE_FOCUS_LIST.map((focus) => focus.id)
);

const EXPERIENCE_FOCUS_ALIAS_MAP: Record<string, ExperienceFocusId> = {
  "story-narrative-action": "story-driven-play",
};

export function normalizeExperienceFocusId(
  value: string | null | undefined
): ExperienceFocusId | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  if (EXPERIENCE_FOCUS_ID_SET.has(normalized as ExperienceFocusId)) {
    return normalized as ExperienceFocusId;
  }
  return EXPERIENCE_FOCUS_ALIAS_MAP[normalized] ?? null;
}

export const EXPERIENCE_FOCUS_LABEL_MAP = new Map<string, string>(
  EXPERIENCE_FOCUS_LIST.map((focus) => [focus.id, focus.label] as [string, string])
);
