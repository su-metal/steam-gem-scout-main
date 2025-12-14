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
  party_based_combat: [
    "party",
    "party members",
    "companions",
    "仲間",
    "パーティ",
    "party-based",
    "party based",
  ],
  command_menu_combat: [
    "command",
    "menu",
    "select actions",
    "コマンド",
    "atb",
    "turn-based",
    "turn based",
  ],
  level_up_growth: [
    "level",
    "exp",
    "experience",
    "experience points",
    "レベル",
    "経験値",
    "growth",
    "stat gain",
  ],
  linear_story_progression: [
    "linear",
    "chapters",
    "chapter",
    "一本道",
    "chapter-based",
    "story progression",
    "章",
    "episode",
  ],
  branching_narrative_structure: [
    "branching",
    "choice",
    "choices matter",
    "choice matters",
    "branching story",
    "route",
    "routes",
    "branching narrative",
    "branching decisions",
    "branching plot",
    "multiple endings",
  ],
};

const FILTERED_FEATURE_LABEL_KEYWORDS_LOWER = Object.fromEntries(
  Object.entries(FILTERED_FEATURE_LABEL_KEYWORDS).map(([label, keywords]) => [
    label,
    keywords.map((keyword) => keyword.toLowerCase()),
  ])
) as Record<string, readonly string[]>;

export const JRPG_STRUCTURAL_LABELS: FeatureLabelV2[] = [
  "party_based_combat",
  "command_menu_combat",
  "level_up_growth",
  "linear_story_progression",
];
const JRPG_STRUCTURAL_LABEL_SET = new Set<FeatureLabelV2>(JRPG_STRUCTURAL_LABELS);

export type JrpgPromotionGate = {
  allowed: boolean;
  reason:
    | "strong_series"
    | "strong_series_allow_e0"
    | "structural_evidence"
    | "insufficient_evidence";
  strong: boolean;
  allowE0: boolean;
  evidenceCount: number;
  threshold: number;
};

export function evaluateJrpgPromotionGate(analysis?: any): JrpgPromotionGate {
  const strong = analysis?.jrpgSeriesSignal === "strong";
  const allowE0 = analysis?.jrpgAllowE0 === true;
  const evidenceCount =
    typeof analysis?.jrpgStructuralEvidenceCount === "number"
      ? analysis.jrpgStructuralEvidenceCount
      : 0;
  const threshold = strong ? (allowE0 ? 0 : 1) : 2;

  if (strong && allowE0) {
    return {
      allowed: true,
      reason: "strong_series_allow_e0",
      strong,
      allowE0,
      evidenceCount,
      threshold,
    };
  }
  if (strong) {
    return {
      allowed: true,
      reason: "strong_series",
      strong,
      allowE0,
      evidenceCount,
      threshold,
    };
  }
  if (evidenceCount >= 2) {
    return {
      allowed: true,
      reason: "structural_evidence",
      strong,
      allowE0,
      evidenceCount,
      threshold,
    };
  }

  return {
    allowed: false,
    reason: "insufficient_evidence",
    strong,
    allowE0,
    evidenceCount,
    threshold,
  };
}

function isJrpgPromotionAllowed(analysis?: any): boolean {
  return evaluateJrpgPromotionGate(analysis).allowed;
}

function hasJrpgAiTag(analysis?: any): boolean {
  if (!analysis || !Array.isArray(analysis.aiTags)) return false;
  return analysis.aiTags.some(
    (tag: string) =>
      typeof tag === "string" && tag.trim().toLowerCase() === "jrpg"
  );
}

function shouldBypassJrpgEvidenceGuard(
  label: FeatureLabelV2,
  analysis?: any
): boolean {
  if (!analysis) return false;
  if (!hasJrpgAiTag(analysis)) return false;
  if (!JRPG_STRUCTURAL_LABEL_SET.has(label)) return false;
  if (label === "linear_story_progression") return false;
  const jrpgCandidates = Array.isArray(analysis.jrpgLabelsAddedRaw)
    ? analysis.jrpgLabelsAddedRaw
    : [];
  return jrpgCandidates.includes(label);
}

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

export type FeatureLabelEvidenceResult = {
  keep: boolean;
  hits: EvidenceHitMap;
};

export function shouldKeepFeatureLabelByEvidence(
  label: FeatureLabelV2,
  analysis: any
): FeatureLabelEvidenceResult {
  if (!analysis) {
    return { keep: false, hits: {} };
  }
  const keywords = FILTERED_FEATURE_LABEL_KEYWORDS_LOWER[label];
  if (!keywords || keywords.length === 0) {
    return { keep: true, hits: {} };
  }

  const evidenceGroups: {
    name: EvidenceGroupName;
    texts: string[];
  }[] = [
    {
      name: "prosCons",
      texts: [
        ...collectTextFromValue(analysis?.pros),
        ...collectTextFromValue(analysis?.cons),
      ],
    },
    { name: "labels", texts: collectTextFromValue(analysis?.labels) },
    { name: "audience", texts: collectAudienceTexts(analysis) },
    { name: "summary", texts: collectSummaryTexts(analysis) },
  ];

  const hits: EvidenceHitMap = {};
  let matchedGroups = 0;

  for (const group of evidenceGroups) {
    const matchedKeywords = collectEvidenceKeywordMatches(
      group.texts,
      keywords
    );
    if (matchedKeywords.length > 0) {
      matchedGroups += 1;
      hits[group.name] = matchedKeywords;
    }
  }

  let keep = matchedGroups >= 2;

  if (label === "branching_narrative_structure") {
    const hasProsCons = (hits.prosCons?.length ?? 0) > 0;
    const hasLabels = (hits.labels?.length ?? 0) > 0;
    const hasAudience = (hits.audience?.length ?? 0) > 0;
    if (!hasProsCons || (!hasLabels && !hasAudience)) {
      keep = false;
    }
  }

  if (
    label === "branching_narrative_structure" &&
    keep &&
    analysis &&
    typeof analysis === "object"
  ) {
    (analysis as any).branchingEvidenceHits = hits;
  }

  return { keep, hits };
}

type EvidenceGroupName = "prosCons" | "labels" | "audience" | "summary";
type EvidenceHitMap = Partial<Record<EvidenceGroupName, string[]>>;

function collectEvidenceKeywordMatches(
  texts: string[],
  keywords: readonly string[]
): string[] {
  const hits = new Set<string>();
  if (!keywords || keywords.length === 0) return [];

  for (const text of texts) {
    if (!text) continue;
    const lowerText = text.toLowerCase();
    for (const keyword of keywords) {
      if (!keyword) continue;
      if (lowerText.includes(keyword)) {
        hits.add(keyword);
      }
    }
  }

  return Array.from(hits);
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

  const promotedLabels: FeatureLabelV2[] = [];
  const promotedSet = new Set<FeatureLabelV2>();

  const filtered = result.filter((label) => {
    if (shouldBypassJrpgEvidenceGuard(label, analysis)) {
      if (!promotedSet.has(label)) {
        promotedSet.add(label);
        promotedLabels.push(label);
      }
      return true;
    }

    if (!FILTERED_FEATURE_LABEL_KEYWORDS[label]) return true;
    const evidence = shouldKeepFeatureLabelByEvidence(label, analysis);
    return evidence.keep;
  });

  let promotedPost: FeatureLabelV2[] = [];
  if (analysis && typeof analysis === "object") {
    const rawSource: unknown =
      Array.isArray((analysis as any).featureLabelsV2Raw) &&
      (analysis as any).featureLabelsV2Raw.length > 0
        ? (analysis as any).featureLabelsV2Raw
        : raw;

    const rawValues = Array.isArray(rawSource) ? rawSource : [];
    const rawSet = new Set<string>(
      rawValues
        .map((item: unknown) =>
          typeof item === "string" ? item.trim().toLowerCase() : ""
        )
        .filter(Boolean)
    );

    const candidates: FeatureLabelV2[] = [];
    for (const label of JRPG_STRUCTURAL_LABELS) {
      if (rawSet.has(label) && isFeatureLabelV2(label)) {
        candidates.push(label);
      }
    }

    const gate = evaluateJrpgPromotionGate(analysis);
    if (gate.allowed && candidates.length > 0) {
      const existing = new Set<string>(filtered);
      for (const label of candidates) {
        if (promotedPost.length >= 2) break;
        if (existing.has(label)) continue;
        existing.add(label);
        filtered.push(label);
        promotedPost.push(label);
      }
    } else {
      promotedPost = promotedLabels;
    }

    (analysis as any).jrpgPromotionCandidates = candidates;
    (analysis as any).jrpgPromotedLabels = promotedPost;
    (analysis as any).jrpgPromotionGate = gate;
    (analysis as any).jrpgPromotionAttempted = candidates.length > 0;
  }

  return filtered;
}

export function normalizeAnalysisFeatureLabelsV2Raw(
  raw?: unknown,
  extra?: FeatureLabelV2[]
): string[] {
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

  if (Array.isArray(extra)) {
    for (const item of extra) {
      if (!item) continue;
      const canonical = item.trim().toLowerCase();
      if (!canonical) continue;
      if (!isFeatureLabelV2(canonical)) continue;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      result.push(canonical);
    }
  }

  return result;
}

type JrpgStructuralDefinition = {
  label: FeatureLabelV2;
  keywords: string[];
  tagKeywords?: string[];
  minEvidence?: number;
};

export type JrpgStructuralLabelsResult = {
  labels: FeatureLabelV2[];
  evidence: Partial<Record<FeatureLabelV2, string[]>>;
};

const JRPG_STRUCTURAL_DEFINITIONS: JrpgStructuralDefinition[] = [
  {
    label: "party_based_combat",
    keywords: ["party", "party members", "companions", "仲間", "パーティ"],
    tagKeywords: ["party-based"],
    minEvidence: 1,
  },
  {
    label: "command_menu_combat",
    keywords: [
      "command",
      "menu",
      "select action",
      "select actions",
      "コマンド",
      "atb",
      "turn-based",
      "turn based",
    ],
    tagKeywords: ["turn-based"],
    minEvidence: 1,
  },
  {
    label: "level_up_growth",
    keywords: [
      "level",
      "exp",
      "experience",
      "experience points",
      "レベル",
      "経験値",
      "growth",
    ],
    minEvidence: 1,
  },
  {
    label: "linear_story_progression",
    keywords: [
      "linear",
      "chapters",
      "chapter",
      "一本道",
      "chapter-based",
      "story progression",
      "章",
      "episode",
    ],
    minEvidence: 2,
  },
];

function collectJrpgTexts(analysis?: any): string[] {
  if (!analysis) return [];
  const texts: string[] = [];
  texts.push(...collectTextFromValue(analysis?.summary));
  texts.push(...collectTextFromValue(analysis?.reason));
  texts.push(...collectTextFromValue(analysis?.pros));
  texts.push(...collectTextFromValue(analysis?.cons));
  texts.push(...collectTextFromValue(analysis?.labels));
  texts.push(...collectAudienceTexts(analysis));
  return texts;
}

function collectKeywordMatches(
  texts: string[],
  keywords: readonly string[]
): string[] {
  const matches: string[] = [];
  if (!keywords || keywords.length === 0) return matches;
  for (const text of texts) {
    if (!text) continue;
    const lowerText = text.toLowerCase();
    for (const keyword of keywords) {
      if (!keyword) continue;
      const lowerKeyword = keyword.toLowerCase();
      if (lowerText.includes(lowerKeyword)) {
        matches.push(text);
        break;
      }
    }
  }
  return matches;
}

export function applyJrpgStructuralLabels(
  analysis?: any
): JrpgStructuralLabelsResult {
  if (!hasJrpgAiTag(analysis)) {
    return { labels: [], evidence: {} };
  }

  const texts = collectJrpgTexts(analysis);
  const tagSlugs = new Set<string>();
  if (Array.isArray(analysis?.featureTagSlugs)) {
    for (const tag of analysis.featureTagSlugs) {
      if (typeof tag === "string") {
        const normalized = tag.trim().toLowerCase();
        if (normalized) tagSlugs.add(normalized);
      }
    }
  }
  if (Array.isArray(analysis?.tags)) {
    for (const tag of analysis.tags) {
      if (typeof tag === "string") {
        const normalized = tag.trim().toLowerCase();
        if (normalized) tagSlugs.add(normalized);
      }
    }
  }

  const labels: FeatureLabelV2[] = [];
  const evidence: Partial<Record<FeatureLabelV2, string[]>> = {};
  const seen = new Set<string>();

  for (const def of JRPG_STRUCTURAL_DEFINITIONS) {
    const textMatches = collectKeywordMatches(texts, def.keywords);
    const tagMatches: string[] = [];
    if (def.tagKeywords) {
      for (const tagKeyword of def.tagKeywords) {
        if (tagSlugs.has(tagKeyword.toLowerCase())) {
          tagMatches.push(`Steam tag: ${tagKeyword}`);
        }
      }
    }
    const combined = [...textMatches, ...tagMatches];
    const requiredEvidence = def.minEvidence ?? 1;
    if (combined.length >= requiredEvidence) {
      if (!seen.has(def.label)) {
        labels.push(def.label);
        seen.add(def.label);
      }
      evidence[def.label] = combined;
    }
  }

  return { labels, evidence };
}
