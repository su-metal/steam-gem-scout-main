// src/types/rankingGame.ts

export interface ScreenshotInfo {
  type?: "image" | "video";
  thumbnail: string;
  full: string;
}

export type GemLabel =
  | "Hidden Gem"
  | "Improved Hidden Gem"
  | "Emerging Gem"
  | "Highly rated but not hidden"
  | "Not a hidden gem";

export interface HiddenGemAnalysis {
  hiddenGemVerdict: "Yes" | "No" | "Unknown";
  summary: string;
  labels: string[];
  pros: string[];
  cons: string[];
  riskScore: number;
  bugRisk: number;
  refundMentions: number;
  reviewQualityScore: number;
  currentStateSummary?: string | null;
  historicalIssuesSummary?: string | null;
  hasImprovedSinceLaunch?: boolean | null;
  stabilityTrend?: "Improving" | "Stable" | "Deteriorating" | "Unknown" | null;
  currentStateReliability?: "high" | "medium" | "low" | null;
  historicalIssuesReliability?: "high" | "medium" | "low" | null;
  aiError?: boolean;
}

export interface RankingGameData {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number; // ドル単位
  priceOriginal: number | null;
  discountPercent: number;
  isOnSale: boolean;
  averagePlaytime: number; // 分単位
  lastUpdated: string; // ISO
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  screenshots?: ScreenshotInfo[];
  analysis: HiddenGemAnalysis | null; // ★ 初回は null の可能性あり
  gemLabel: GemLabel;
  isStatisticallyHidden: boolean;
  releaseDate: string;
  releaseYear: number;
  isAvailableInStore: boolean;
  headerImage: string | null;
}
