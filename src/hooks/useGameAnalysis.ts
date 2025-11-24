// src/hooks/useGameAnalysis.ts
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { RankingGameData, HiddenGemAnalysis } from "@/types/rankingGame";

interface UseGameAnalysisResult {
  analysis: HiddenGemAnalysis | null;
  isAnalyzing: boolean;
  error: string | null;
}

export function useGameAnalysis(game: RankingGameData | null): UseGameAnalysisResult {
  const [analysis, setAnalysis] = useState<HiddenGemAnalysis | null>(game?.analysis ?? null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(!game?.analysis);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!game) return;

    // すでに「今と昔」モデル付きで解析済なら叩かない
    if (game.analysis && game.analysis.currentStateSummary && game.analysis.historicalIssuesSummary) {
      setAnalysis(game.analysis);
      setIsAnalyzing(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setIsAnalyzing(true);
      setError(null);

      // ★ analyze-hidden-gem の GameData に合わせて payload を組む
      const payload = {
        title: game.title,
        appId: game.appId,
        positiveRatio: game.positiveRatio,
        totalReviews: game.totalReviews,
        estimatedOwners: game.estimatedOwners,
        recentPlayers: game.recentPlayers,
        price: game.price,
        averagePlaytime: game.averagePlaytime,
        lastUpdated: game.lastUpdated,
        releaseDate: game.releaseDate,
        tags: game.tags,
        // reviews / earlyReviews / recentReviews を後で足すならここに追加
      };

      const { data, error } = await supabase.functions.invoke<HiddenGemAnalysis>(
        "analyze-hidden-gem",
        { body: payload }
      );

      if (cancelled) return;

      if (error) {
        console.error("analyze-hidden-gem error:", error);
        setError(error.message ?? "Failed to analyze game");
        setIsAnalyzing(false);
        return;
      }

      if (!data) {
        setError("No analysis returned from analyze-hidden-gem");
        setIsAnalyzing(false);
        return;
      }

      setAnalysis(data);
      setIsAnalyzing(false);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [game?.appId]);

  return { analysis, isAnalyzing, error };
}
