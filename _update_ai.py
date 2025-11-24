from pathlib import Path

path = Path('supabase/functions/import-steam-games/index.ts')
text = path.read_text(encoding='utf-8')
start = text.index('async function runAiAnalysisForAppIds')
end = text.index('\nasync function fetchCandidateGamesByFilters')
new_block = """async function runAiAnalysisForAppIds(appIds: number[]): Promise<void> {
  for (const appId of appIds) {
    try {
      const appIdStr = String(appId);

      const { data: existing, error } = await supabase
        .from(\"game_rankings_cache\")
        .select(\"id, data\")
        .eq(\"data->>appId\", appIdStr)
        .maybeSingle();

      if (error) {
        console.error(
          \"runAiAnalysisForAppIds: select error in game_rankings_cache\",
          appId,
          error
        );
        continue;
      }

      if (!existing or not existing.data or not isinstance(existing.data, dict)) {
        console.warn(
          \"runAiAnalysisForAppIds: no existing row for appId\",
          appId
        );
        continue;
      }

      currentData = existing.data

      if (currentData.get('analysis')) {
        print(
          \"runAiAnalysisForAppIds: analysis already present, skipping\",
          appId
        )
        continue
      }

      payload = currentData

      raise NotImplementedError()
  }
}
"""
text = text[:start] + new_block + text[end:]
path.write_text(text, encoding='utf-8')
