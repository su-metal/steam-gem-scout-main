// src/pages/ImportSteamGamesPage.tsx
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Home, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";

type ImportResult = {
  appId: number;
  status: string;
  title?: string;
  error?: string;
};

type ImportApiResponse = {
  success: boolean;
  results: ImportResult[];
};

type GenerateFactsResponse = {
  appId: number;
  saved: boolean;
  reason?: string;
};

type FilterImportCandidate = {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  price: number;
  tags?: string[];
  releaseDate?: string;
};

type FilterImportResponse = {
  totalCandidates: number;
  inserted: number;
  skippedExisting: number;
  candidates?: FilterImportCandidate[];
};

export function ImportSteamGamesPage() {
  // 既存：AppID 手動インポート
  const [singleAppId, setSingleAppId] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);

  // ★ ここから AI 解析オプション用の state を追加
  const [runAiAfterImport, setRunAiAfterImport] = useState(false);
  const [runFactsAfterPublish, setRunFactsAfterPublish] = useState(false);
  const [factsForce, setFactsForce] = useState(false);
  const [isFactsRunning, setIsFactsRunning] = useState(false);
  // ★ Facts 生成オプション（generate-facts）
  const [runFactsAfterImport, setRunFactsAfterImport] = useState(false);



  // 新規：条件インポート
  const [recentDays, setRecentDays] = useState("90");
  const [minPositivePercent, setMinPositivePercent] = useState("85");
  const [minTotalReviews, setMinTotalReviews] = useState("30");
  const [maxEstimatedOwners, setMaxEstimatedOwners] = useState("50000");
  const [maxPriceUsd, setMaxPriceUsd] = useState("30"); // USD 想定
  const [tagsText, setTagsText] = useState("");
  const [limit, setLimit] = useState("200");

  // AppId / Title フィルター
  const [filterAppId, setFilterAppId] = useState("");
  const [filterTitle, setFilterTitle] = useState("");

  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isFilterImporting, setIsFilterImporting] = useState(false);
  const [previewCandidates, setPreviewCandidates] = useState<
    FilterImportCandidate[]
  >([]);
  const [filterStats, setFilterStats] = useState<{
    totalCandidates: number;
    inserted: number;
    skippedExisting: number;
  } | null>(null);

  const { toast } = useToast();

  const [selectedAppIds, setSelectedAppIds] = useState<number[]>([]);

  const allFilterCandidatesSelected =
    previewCandidates.length > 0 &&
    previewCandidates.every((c) => selectedAppIds.includes(c.appId));

  // 文字列から AppID の配列を作る（カンマ / 改行 / 空白区切り）
  const parseAppIds = (input: string): number[] => {
    return input
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0);
  };

  // 既存：1つの AppID を ingest-steam-game に投げる
  const runImportForAppId = async (appId: number) => {
    const { data, error } = await supabase.functions.invoke<ImportApiResponse>(
      "ingest-steam-game",
      {
        body: { appId },
      }
    );

    if (error) {
      console.error("Import error for appId", appId, error);
      return {
        appId,
        status: "error",
        error: error.message ?? "Unknown error",
      } as ImportResult;
    }

    const apiData = data as ImportApiResponse | null;

    if (!apiData) {
      return {
        appId,
        status: "error",
        error: "No response from edge function",
      };
    }

    if (apiData.results && apiData.results.length > 0) {
      // 代表として最初の結果を使う
      return apiData.results[0];
    }

    return {
      appId,
      status: apiData.success ? "ok" : "error",
    };
  };

  // generate-facts を叩く（詳細ログ付き）
  const runGenerateFactsForAppId = async (
    appId: number,
    force = false,
    debug = false
  ): Promise<GenerateFactsResponse> => {
    const { data, error } = await supabase.functions.invoke<any>("generate-facts", {
      body: { appId, force, debug },
    });

    if (error) {
      const ctx: any = (error as any)?.context;
      let bodyText = "";
      try {
        bodyText = await ctx?.response?.text?.();
      } catch {
        // ignore
      }

      console.error("generate-facts error", {
        appId,
        message: (error as any)?.message,
        status: ctx?.status,
        bodyText,
      });

      return {
        appId,
        saved: false,
        reason: bodyText || (error as any)?.message || "invoke-error",
      };
    }

    console.log("generate-facts success", { appId, data });
    return (data as GenerateFactsResponse) ?? {
      appId,
      saved: false,
      reason: "no-response",
    };
  };


  const handleSingleImport = async () => {
    const ids = parseAppIds(singleAppId);
    if (ids.length === 0) {
      toast({
        title: "Invalid AppID",
        description: "Please enter a valid numeric Steam AppID.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const appId = ids[0];
      const result = await runImportForAppId(appId);

      // ingest が成功したときだけ facts を回す（SSOT: factsは別工程）
      let factsRes: GenerateFactsResponse | null = null;
      if (runFactsAfterImport && result.status === "ok") {
        factsRes = await runGenerateFactsForAppId(appId, factsForce);
      }

      setResults((prev) => [result, ...prev]);

      toast({
        title: result.status === "ok" ? "Import completed" : "Import failed",
        description:
          result.status === "ok"
            ? `AppID ${appId} has been imported.${factsRes
              ? factsRes.saved
                ? " Facts generated."
                : ` Facts skipped/failed: ${factsRes.reason ?? "Unknown"}`
              : ""
            }`
            : `AppID ${appId} failed: ${result.error ?? "Unknown error"}`,
        variant: result.status === "ok" ? "default" : "destructive",
      });

    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkImport = async () => {
    const ids = parseAppIds(bulkInput);

    if (ids.length === 0) {
      toast({
        title: "No AppIDs",
        description:
          "Please enter one or more Steam AppIDs separated by spaces, commas or new lines.",
        variant: "destructive",
      });
    }

    setIsLoading(true);
    const newResults: ImportResult[] = [];

    try {
      for (const appId of ids) {
        const result = await runImportForAppId(appId);
        newResults.push(result);

        if (runFactsAfterImport && result.status === "ok") {
          await runGenerateFactsForAppId(appId, factsForce);
        }
      }

      setResults((prev) => [...newResults, ...prev]);

      const successCount = newResults.filter((r) => r.status === "ok").length;
      const failCount = newResults.length - successCount;

      toast({
        title: "Bulk import completed",
        description: `Succeeded: ${successCount}, Failed: ${failCount}`,
        variant: failCount === 0 ? "default" : "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };


  // 条件インポート用のペイロードを組み立てる
  const buildFilterPayload = (dryRun: boolean) => {
    const payload: any = { dryRun };

    // ---- まずは Tags / AppID / Title の入力を整理 ----
    const tags = tagsText
      .split(/[,、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const appIdNum = Number(filterAppId);
    const hasAppId = Number.isFinite(appIdNum) && appIdNum > 0;

    const titleQuery = filterTitle.trim();

    const hasDirectFilters =
      tags.length > 0 || hasAppId || titleQuery.length > 0;

    // ====================================================
    // A. Tags / AppID / Title のどれかが指定されている場合：
    //    → Hidden Gem 用の数値条件は一切使わない「別軸検索モード」
    // ====================================================
    if (hasDirectFilters) {
      if (tags.length > 0) {
        payload.tags = tags;
      }
      if (hasAppId) {
        payload.filterAppId = appIdNum;
      }
      if (titleQuery.length > 0) {
        payload.titleQuery = titleQuery;
      }

      // Limit は「取得上限」でフィルタ条件ではないので、そのまま使う
      const lim = Number(limit);
      if (Number.isFinite(lim) && lim > 0) payload.limit = lim;
    } else {
      // ============================================
      // B. 何も直接指定されていない場合：
      //    → これまで通り Hidden Gem 用の数値条件で絞る
      // ============================================
      const rd = Number(recentDays);
      if (Number.isFinite(rd) && rd > 0) payload.recentDays = rd;

      const pos = Number(minPositivePercent);
      if (Number.isFinite(pos) && pos > 0) {
        // DB の positive_ratio は 0–100 の数値なので、割らずにそのまま渡す
        payload.minPositiveRatio = pos;
      }

      const minRev = Number(minTotalReviews);
      if (Number.isFinite(minRev) && minRev > 0) {
        payload.minTotalReviews = minRev;
      }

      const maxOwners = Number(maxEstimatedOwners);
      if (Number.isFinite(maxOwners) && maxOwners > 0) {
        payload.maxEstimatedOwners = maxOwners;
      }

      const maxPrice = Number(maxPriceUsd);
      if (Number.isFinite(maxPrice) && maxPrice > 0) {
        // Edge Function 側も USD 単位で比較する
        payload.maxPrice = maxPrice;
      }

      const lim = Number(limit);
      if (Number.isFinite(lim) && lim > 0) payload.limit = lim;

      // ※ Hidden Gem 条件モードでは Tags を使わない方針なら
      //    ここで tags を payload に入れない（今回の要件どおりなら未指定なので実質何もしない）
    }

    // ★本番インポート時かつチェックONのときだけフラグを付ける
    if (!dryRun && runAiAfterImport) {
      payload.runAiAnalysisAfterImport = true;
    }

    return payload;
  };


  const handlePreviewFilterImport = async () => {
    const payload = buildFilterPayload(true);

    setIsPreviewLoading(true);
    setPreviewCandidates([]);
    setFilterStats(null);

    try {
      const { data, error } =
        await supabase.functions.invoke<FilterImportResponse>(
          "publish-steam-games",
          { body: payload }
        );

      if (error) {
        console.error("Filter import preview error", error);
        toast({
          title: "Preview failed",
          description: error.message ?? "Unknown error",
          variant: "destructive",
        });
        return;
      }

      if (!data) {
        toast({
          title: "Preview failed",
          description: "No response from publish-steam-games.",
          variant: "destructive",
        });
        return;
      }

      const candidates = data.candidates ?? [];
      setPreviewCandidates(candidates);
      // プレビュー結果をデフォルトで「全選択」にする
      setSelectedAppIds(candidates.map((c) => c.appId));

      setFilterStats({
        totalCandidates: data.totalCandidates,
        inserted: data.inserted,
        skippedExisting: data.skippedExisting,
      });


      toast({
        title: "Preview completed",
        description: `Found ${data.totalCandidates} candidates (showing up to ${data.candidates?.length ?? 0}).`,
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleRunFilterImport = async () => {
    if (previewCandidates.length === 0) {
      toast({
        title: "No preview",
        description:
          'まず "Preview candidates" を実行して候補を表示してください。',
        variant: "destructive",
      });
      return;
    }

    if (selectedAppIds.length === 0) {
      toast({
        title: "No games selected",
        description:
          "インポートするゲームにチェックを入れてください。",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      ...buildFilterPayload(false),
      selectedAppIds,
      runAiAnalysisAfterImport: runAiAfterImport,
    };

    setIsFilterImporting(true);
    try {
      const { data, error } =
        await supabase.functions.invoke<FilterImportResponse>(
          "publish-steam-games",
          { body: payload }
        );

      if (error) {
        console.error("Filter import error", error);
        toast({
          title: "Import failed",
          description: error.message ?? "Unknown error",
          variant: "destructive",
        });
        return;
      }

      if (!data) {
        toast({
          title: "Import failed",
          description: "No response from publish-steam-games.",
          variant: "destructive",
        });
        return;
      }

      setFilterStats({
        totalCandidates: data.totalCandidates,
        inserted: data.inserted,
        skippedExisting: data.skippedExisting,
      });

      // publish 後に facts を回す（A案）
      if (runFactsAfterPublish) {
        setIsFactsRunning(true);
        try {
          // 安全優先：逐次（後で Promise.all にして高速化できる）
          for (const id of selectedAppIds) {
            await runGenerateFactsForAppId(id, factsForce);
          }
        } finally {
          setIsFactsRunning(false);
        }
      }


      toast({
        title: "Filtered import completed",
        description: `Imported ${data.inserted} games (total candidates: ${data.totalCandidates}).`,
      });
    } finally {
      setIsFilterImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">
              Import Steam Games
            </h1>
            <p className="text-sm text-muted-foreground">
              Import Steam titles into <code>game_rankings_cache</code> via
              Edge Functions.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/">
                <Home className="w-4 h-4 mr-2" />
                Home
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/rankings">
                <ListChecks className="w-4 h-4 mr-2" />
                Rankings
              </Link>
            </Button>
          </div>
        </div>

        {/* Single AppID Import */}
        <div className="space-y-4 p-4 md:p-6 bg-card rounded-lg border">
          <h2 className="text-lg font-semibold">Single AppID Import</h2>
          <p className="text-sm text-muted-foreground">
            Enter a single Steam AppID to import one game (via{" "}
            <code>ingest-steam-game</code>).
          </p>

          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <Input
              placeholder="e.g. 2563430"
              value={singleAppId}
              onChange={(e) => setSingleAppId(e.target.value)}
              className="md:max-w-xs"
            />
            <Button onClick={handleSingleImport} disabled={isLoading}>
              {isLoading ? "Importing..." : "Import game"}
            </Button>
          </div>
          {/* generate-facts オプション */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={runFactsAfterImport}
                onChange={(e) => setRunFactsAfterImport(e.target.checked)}
              />
              <span>After import, generate facts (generate-facts)</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={factsForce}
                onChange={(e) => setFactsForce(e.target.checked)}
                disabled={!runFactsAfterImport}
              />
              <span>force overwrite</span>
            </label>
          </div>
        </div>

        {/* Bulk Import */}
        <div className="space-y-4 p-4 md:p-6 bg-card rounded-lg border">
          <h2 className="text-lg font-semibold">
            Bulk Import (multiple AppIDs)
          </h2>
          <p className="text-sm text-muted-foreground mb-2">
            Paste multiple Steam AppIDs separated by spaces, commas or new
            lines. They will be imported one by one (via{" "}
            <code>ingest-steam-game</code>).
          </p>

          <Textarea
            className="min-h-[120px] text-sm"
            placeholder={"e.g.\n2563430 123456 789012\n..."}
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
          />

          <div className="flex justify-end">
            <Button onClick={handleBulkImport} disabled={isLoading}>
              {isLoading ? "Importing..." : "Import all"}
            </Button>
          </div>
        </div>

        {/* Filter-based Import (NEW) */}
        <div className="space-y-4 p-4 md:p-6 bg-card rounded-lg border">
          <h2 className="text-lg font-semibold">
            Auto Import by Filters (via <code>publish-steam-games</code>)
          </h2>
          <p className="text-sm text-muted-foreground mb-2">
            Use your default Hidden Gem criteria to find candidate games from{" "}
            <code>steam_games</code> and import them into{" "}
            <code>game_rankings_cache</code>.
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">
                Recent days (last_steam_fetch_at)
              </label>
              <Input
                type="number"
                value={recentDays}
                onChange={(e) => setRecentDays(e.target.value)}
                placeholder="90"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">
                Min positive ratio (%)
              </label>
              <Input
                type="number"
                value={minPositivePercent}
                onChange={(e) => setMinPositivePercent(e.target.value)}
                placeholder="85"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">
                Min total reviews
              </label>
              <Input
                type="number"
                value={minTotalReviews}
                onChange={(e) => setMinTotalReviews(e.target.value)}
                placeholder="30"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">
                Max estimated owners
              </label>
              <Input
                type="number"
                value={maxEstimatedOwners}
                onChange={(e) => setMaxEstimatedOwners(e.target.value)}
                placeholder="50000"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">
                Max price (USD)
              </label>
              <Input
                type="number"
                value={maxPriceUsd}
                onChange={(e) => setMaxPriceUsd(e.target.value)}
                placeholder="30"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">
                Limit (max games to fetch)
              </label>
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="200"
              />
            </div>

            {/* ---- ここから「別軸」フィルター群 ---- */}
            <div className="space-y-1 md:col-span-3">
              <label className="text-xs font-medium">
                Tags (comma or space separated, optional)
              </label>
              <Input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="Indie, Roguelike, Deckbuilder..."
              />
              <p className="text-[11px] text-muted-foreground">
                ※ Tags / AppID / Title のいずれかを指定すると、上の Hidden Gem 条件
                （Recent days / Min positive / Min reviews / Max owners / Max price）
                は無視され、タグ等だけで検索します。
              </p>
            </div>

            <div className="space-y-1 md:col-span-3">
              <label className="text-xs font-medium">
                Filter by AppID (optional)
              </label>
              <Input
                value={filterAppId}
                onChange={(e) => setFilterAppId(e.target.value)}
                placeholder="Exact AppID, e.g. 526870"
              />
            </div>

            <div className="space-y-1 md:col-span-3">
              <label className="text-xs font-medium">
                Filter by Title (contains, optional)
              </label>
              <Input
                value={filterTitle}
                onChange={(e) => setFilterTitle(e.target.value)}
                placeholder="e.g. satisfactory, factory"
              />
            </div>
          </div>

          {/* AI 解析オプション */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mt-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={runAiAfterImport}
                onChange={(e) => setRunAiAfterImport(e.target.checked)}
              />
              <span>After import, run AI analysis for candidates</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={runFactsAfterPublish}
                onChange={(e) => setRunFactsAfterPublish(e.target.checked)}
              />
              <span>After publish, generate facts (generate-facts)</span>
            </label>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={factsForce}
                onChange={(e) => setFactsForce(e.target.checked)}
                disabled={!runFactsAfterPublish}
              />
              <span>force overwrite facts</span>
            </label>


            <div className="text-xs text-muted-foreground">
              Backend will run AI analysis for the imported games when checked.
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {/* 既存のボタンたち（上から少しだけ変更） */}
            <Button
              variant="outline"
              onClick={handlePreviewFilterImport}
              disabled={isPreviewLoading || isFilterImporting}
            >
              {isPreviewLoading ? "Previewing..." : "Preview candidates"}
            </Button>
            <Button
              onClick={handleRunFilterImport}
              disabled={
                isPreviewLoading ||
                isFilterImporting ||
                previewCandidates.length === 0 ||
                selectedAppIds.length === 0
              }
            >
              {isFilterImporting
                ? "Importing..."
                : "Import selected games"}
            </Button>
          </div>


          {filterStats && (
            <p className="text-xs text-muted-foreground">
              Total candidates: {filterStats.totalCandidates} / Inserted:{" "}
              {filterStats.inserted} / Skipped: {filterStats.skippedExisting}
            </p>
          )}

          {previewCandidates.length > 0 && (
            <div className="mt-4 border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="px-2 py-1">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={allFilterCandidatesSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAppIds(
                              previewCandidates.map((c) => c.appId)
                            );
                          } else {
                            setSelectedAppIds([]);
                          }
                        }}
                      />
                    </th>
                    <th className="px-2 py-1">AppID</th>
                    <th className="px-2 py-1">Title</th>
                    <th className="px-2 py-1">Pos%</th>
                    <th className="px-2 py-1">Reviews</th>
                    <th className="px-2 py-1">Owners</th>
                    <th className="px-2 py-1">Price</th>
                    <th className="px-2 py-1">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {previewCandidates.map((c) => (
                    <tr key={c.appId} className="border-t">
                      <td className="px-2 py-1">
                        +                       <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedAppIds.includes(c.appId)}
                          onChange={(e) => {
                            setSelectedAppIds((prev) =>
                              e.target.checked
                                ? Array.from(new Set([...prev, c.appId]))
                                : prev.filter((id) => id !== c.appId)
                            );
                          }}
                        />
                      </td>
                      <td className="px-2 py-1 font-mono">{c.appId}</td>
                      <td className="px-2 py-1">{c.title}</td>
                      <td className="px-2 py-1">
                        {c.positiveRatio.toFixed(1)}%
                      </td>
                      <td className="px-2 py-1">{c.totalReviews}</td>
                      <td className="px-2 py-1">{c.estimatedOwners}</td>
                      <td className="px-2 py-1">
                        {c.price != null ? `$${c.price.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-2 py-1">
                        {c.tags?.slice(0, 4).join(", ")}
                        {c.tags && c.tags.length > 4 ? " ..." : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Result List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent manual imports</h2>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No manual imports yet. Try importing a game above.
            </p>
          ) : (
            <div className="space-y-2">
              {results.map((r, idx) => (
                <div
                  key={`${r.appId}-${idx}-${r.status}`}
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">
                      AppID {r.appId}
                    </div>
                    {r.title && (
                      <div className="font-medium">{r.title}</div>
                    )}
                    {r.error && (
                      <div className="text-xs text-red-500">{r.error}</div>
                    )}
                  </div>
                  <div
                    className={
                      r.status === "ok"
                        ? "text-xs font-semibold text-emerald-600"
                        : "text-xs font-semibold text-red-500"
                    }
                  >
                    {r.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div >
    </div >
  );
}

export default ImportSteamGamesPage;
