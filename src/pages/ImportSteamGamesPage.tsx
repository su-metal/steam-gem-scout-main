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

// ★ ここを「export function」にする（名前付きエクスポート）
export function ImportSteamGamesPage() {
  const [singleAppId, setSingleAppId] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);

  const { toast } = useToast();

  // 文字列から AppID の配列を作る（カンマ / 改行 / 空白区切り）
  const parseAppIds = (input: string): number[] => {
    return input
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0);
  };

  const runImportForAppId = async (appId: number) => {
    const { data, error } = await supabase.functions.invoke<ImportApiResponse>(
      "search-hidden-gems",
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

      setResults((prev) => [result, ...prev]);
      toast({
        title:
          result.status === "ok" ? "Import completed" : "Import failed",
        description:
          result.status === "ok"
            ? `AppID ${appId} has been imported.`
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
      return;
    }

    setIsLoading(true);
    const newResults: ImportResult[] = [];

    try {
      for (const appId of ids) {
        const result = await runImportForAppId(appId);
        newResults.push(result);
      }

      setResults((prev) => [...newResults, ...prev]);

      const successCount = newResults.filter(
        (r) => r.status === "ok"
      ).length;
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

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">
              Import Steam Games
            </h1>
            <p className="text-sm text-muted-foreground">
              Import Steam titles into <code>game_rankings_cache</code>{" "}
              via the Edge Function.
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
          <h2 className="text-lg font-semibold">
            Single AppID Import
          </h2>
          <p className="text-sm text-muted-foreground">
            Enter a single Steam AppID to import one game.
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
        </div>

        {/* Bulk Import */}
        <div className="space-y-4 p-4 md:p-6 bg-card rounded-lg border">
          <h2 className="text-lg font-semibold">
            Bulk Import (multiple AppIDs)
          </h2>
          <p className="text-sm text-muted-foreground mb-2">
            Paste multiple Steam AppIDs separated by spaces, commas or
            new lines. They will be imported one by one.
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

        {/* Result List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent results</h2>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No imports yet. Try importing a game above.
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
                      <div className="text-xs text-red-500">
                        {r.error}
                      </div>
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
      </div>
    </div>
  );
}

// （お好みで）default export も残しておくと、どちらの書き方にも対応できます
export default ImportSteamGamesPage;
