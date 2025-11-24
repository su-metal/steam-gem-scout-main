// supabase/functions/import-steam-games/index.ts
// Steam の AppID を指定して、game_rankings_cache に upsert する Edge Function
// 単発 (appId) / 複数 (appIds) 両対応
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

type Analysis = {
  hiddenGemVerdict: "Yes" | "No" | "Unknown";
  summary: string;
  labels: string[];
  pros: string[];
  cons: string[];
  riskScore: number;
  bugRisk: number;
  refundMentions: number;
  reviewQualityScore: number;
};

type RankingGame = {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number;
  averagePlaytime: number;
  lastUpdated: string;
  tags: string[];
  steamUrl: string;
  reviewScoreDesc: string;
  screenshots?: { thumbnail?: string; full?: string }[];
  // ★ ヘッダー画像（UI から参照される）
  headerImage?: string;
  // ★ 互換用：旧キー
  header_image?: string;
  analysis: Analysis | null;
  gemLabel: string;
  isStatisticallyHidden: boolean;
  releaseDate: string;
  releaseYear: number;
  isAvailableInStore: boolean;
};

type ImportSteamGamesRequest =
  | {
      appId: number;
      /** Import 後に AI 解析を実行するかどうか（任意） */
      runAiAnalysisAfterImport?: boolean;
    }
  | {
      appIds: number[];
      runAiAnalysisAfterImport?: boolean;
    }
  | {
      recentDays?: number;
      minPositiveRatio?: number;
      minTotalReviews?: number;
      maxEstimatedOwners?: number;
      maxPrice?: number;
      tags?: string[];
      limit?: number;
      dryRun?: boolean;
      // ★ 既存の発売年月フィルタ
      releaseFrom?: string; // "YYYY-MM"
      releaseTo?: string; // "YYYY-MM"
      // ★ 追加: フィルタ結果の中からフロントで選択された AppID 群
      selectedAppIds?: number[];
      /** Import 後に AI 解析を実行するかどうか（任意） */
      runAiAnalysisAfterImport?: boolean;
    };


type ImportCandidate = {
  appId: number;
  title: string;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  price: number;
  tags?: string[];
  releaseDate?: string;
};

type ImportSteamGamesResult = {
  totalCandidates: number;
  inserted: number;
  skippedExisting: number;
  candidates?: ImportCandidate[];
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY") ?? "";

// ★ 追加: analyze-hidden-gem のエンドポイント
const ANALYZE_HIDDEN_GEM_URL =
  `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/analyze-hidden-gem`;

// Supabase サーバーサイドクライアント
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";

Deno.serve(async (req) => {
  // CORS 対応（フロントから直接呼ぶ想定）
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST is allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = (await req.json()) as ImportSteamGamesRequest;

    // ★ 追加: フロントから渡されたフラグを読み取る
    const runAiAnalysisAfterImport =
      (body as any).runAiAnalysisAfterImport === true;

    const hasSingleAppId =
      typeof (body as any).appId === "number" &&
      Number.isFinite((body as any).appId);
    const hasMultipleAppIds = Array.isArray((body as any).appIds);

    // ① 従来どおり appId / appIds を直指定するモード
    if (hasSingleAppId || hasMultipleAppIds) {
      const appIds: number[] = hasMultipleAppIds
        ? ((body as any).appIds as number[])
        : [(body as any).appId as number];

      if (!appIds.length) {
        return new Response(
          JSON.stringify({ error: "appId or appIds is required" }),
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      const { inserted, skippedExisting, results } =
        await upsertGamesToRankingsCache(appIds);

      if (runAiAnalysisAfterImport && appIds.length > 0) {
        try {
          console.log(
            "[import-steam-games] Running AI analysis for",
            appIds
          );
          await runAiAnalysisForAppIds(appIds);
        } catch (e) {
          console.error(
            "[import-steam-games] runAiAnalysisForAppIds failed",
            e
          );
        }
      }

      const response: ImportSteamGamesResult & {
        results: { appId: number; status: "ok" | "error"; message?: string }[];
      } = {
        totalCandidates: appIds.length,
        inserted,
        skippedExisting,
        candidates: undefined,
        results,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ② 条件指定モード（recentDays / positiveRatio など）
    const {
      recentDays,
      minPositiveRatio,
      minTotalReviews,
      maxEstimatedOwners,
      maxPrice,
      tags,
      limit,
      dryRun,
      // ★ 発売年月フィルタ
      releaseFrom,
      releaseTo,
      // ★ フロントで選択された AppID 一覧（任意）
      selectedAppIds,
    } = body as any;

    if (
      recentDays == null &&
      minPositiveRatio == null &&
      minTotalReviews == null &&
      maxEstimatedOwners == null &&
      maxPrice == null &&
      (!tags || !Array.isArray(tags) || tags.length === 0) &&
      !releaseFrom &&
      !releaseTo
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Filter-based import requires at least one condition (recentDays / minPositiveRatio / etc.)",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const { candidates, totalCandidates } = await fetchCandidateGamesByFilters({
      recentDays,
      minPositiveRatio,
      minTotalReviews,
      maxEstimatedOwners,
      maxPrice,
      tags,
      limit,
      releaseFrom,
      releaseTo,
    });

    // ★ フロントから selectedAppIds が送られてきている場合、
    //    フィルタ結果の中から、その AppID だけをさらに絞り込む。
    const hasSelection =
      Array.isArray(selectedAppIds) && selectedAppIds.length > 0;

    const selectedSet = hasSelection
      ? new Set(selectedAppIds.map((id: number) => Number(id)))
      : null;

    const filteredCandidates = hasSelection
      ? candidates.filter((c) => selectedSet!.has(Number(c.appId)))
      : candidates;

    // dryRun: true → プレビュー用。DB には書かない
    // プレビュー時は「元のフィルタ結果」をそのまま返す（UI 側でチェック制御）
    if (dryRun) {
      const response: ImportSteamGamesResult = {
        totalCandidates,
        inserted: 0,
        skippedExisting: 0,
        candidates,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // dryRun でなければ、絞り込み済みの候補だけを game_rankings_cache に流し込む
    const appIds = filteredCandidates.map((c) => c.appId);

    if (appIds.length === 0) {
      // 選択された AppID がフィルタ結果に含まれていなかったケース
      const response: ImportSteamGamesResult = {
        totalCandidates: 0,
        inserted: 0,
        skippedExisting: 0,
        candidates: undefined,
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const { inserted, skippedExisting } = await upsertGamesToRankingsCache(
      appIds
    );

    // ★ 追加: Import 後に AI 解析を実行するオプション
    if (runAiAnalysisAfterImport && appIds.length > 0) {
      try {
        await runAiAnalysisForAppIds(appIds);
      } catch (e) {
        console.error("runAiAnalysisForAppIds failed:", e);
        // ここでは import 自体は成功として扱いたいので、throw はしない
      }
    }

    const response: ImportSteamGamesResult = {
      // ★ selectedAppIds が指定されている場合は「実際に対象となった件数」を返す
      totalCandidates: hasSelection
        ? filteredCandidates.length
        : totalCandidates,
      inserted,
      skippedExisting,
      candidates: undefined,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    console.error("Unexpected error in import-steam-games", e);
    return new Response(
      JSON.stringify({
        error: "Unexpected error",
        detail: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});

type FilterParams = {
  recentDays?: number;
  minPositiveRatio?: number;
  minTotalReviews?: number;
  maxEstimatedOwners?: number;
  maxPrice?: number;
  tags?: string[];
  limit?: number;
  // ★ 追加: 発売年月フィルタ（"YYYY-MM" 形式）
  releaseFrom?: string; // 例: "2017-01"
  releaseTo?: string; // 例: "2017-12"
};

// 日付文字列から「年」だけ安全に抜き出すヘルパー
function parseReleaseYear(dateStr?: string | null): number {
  if (!dateStr) return 0;

  // まずは Date としてパースしてみる
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.getUTCFullYear();
  }

  // うまくパースできない形式の場合は、文字列中の4桁の数字を拾う
  const m = String(dateStr).match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

function buildRankingGameFromSteamRow(row: any): RankingGame {
  const appId: number = row.app_id;
  const title: string = row.title ?? `App ${appId}`;

  const positiveRatio: number = row.positive_ratio ?? 0;
  const totalReviews: number = row.total_reviews ?? 0;
  const estimatedOwners: number = row.estimated_owners ?? 0;
  const recentPlayers: number = 0; // steam_games には現状含めていないので 0 で初期化

  const price: number = row.price ?? 0; // USD (例: 19.99)
  const averagePlaytime: number = row.average_playtime ?? 0;

  const tags: string[] = Array.isArray(row.tags) ? row.tags : [];

  // steam_games 側に既に入っている screenshots JSON をそのまま使う
  const screenshots = Array.isArray(row.screenshots) ? row.screenshots : [];

  // headerImage は DB 側に既に保存されている値を優先し、
  // 無い場合は appId から Steam の標準ヘッダー URL を組み立てる
  const headerImage: string =
    (row.headerImage as string | undefined) ??
    (row.header_image as string | undefined) ??
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

  const steamUrl: string =
    row.steam_url ?? `https://store.steampowered.com/app/${appId}`;

  const reviewScoreDesc: string = row.review_score_desc ?? "Unknown";

  // ★ 本当の発売日を使う。なければ最後の取得日時でフォールバック
  const releaseDateStr: string =
    row.release_date ?? row.last_steam_fetch_at ?? "";
  const releaseYear: number = parseReleaseYear(releaseDateStr);

  const nowIso = new Date().toISOString();
  const currentYear = new Date().getFullYear();

  // ---- ここから hidden_gem_candidates 用の統計フィルタ ----
  // price は cents 想定なのでドルに変換
  const priceUsd = price;

  // 1) total_reviews: 30〜5000
  const withinReviewRange = totalReviews >= 30 && totalReviews <= 5000;

  // 2) positive_ratio: 90%以上
  const highPositiveRatio = positiveRatio >= 90;

  // 3) owners: 〜20万
  const ownersInRange = estimatedOwners > 0 && estimatedOwners <= 200_000;

  // 4) price: 2〜40ドル
  const priceInRange = priceUsd >= 2 && priceUsd <= 40;

  // 5) release_year: 直近5年以内（※現状は last_steam_fetch_at から年だけ抜いた近似）
  const releaseRecentEnough = releaseYear > 0 && currentYear - releaseYear <= 5;

  const isStatisticallyHidden =
    withinReviewRange &&
    highPositiveRatio &&
    ownersInRange &&
    priceInRange &&
    releaseRecentEnough;
  // ---- ここまで hidden_gem_candidates 判定 ----

  const rankingGame: RankingGame = {
    appId,
    title,
    positiveRatio,
    totalReviews,
    estimatedOwners,
    recentPlayers,
    price,
    averagePlaytime,
    lastUpdated: nowIso,
    tags,
    steamUrl,
    reviewScoreDesc,
    screenshots,
    // ★ ヘッダー画像（検索・一覧カードで使用）
    headerImage,
    // 旧キーも一応揃えておく
    header_image: headerImage,
    // ランキング生成時点では AI 解析は未実行なので null
    analysis: null,
    // gemLabel は後から AI/別処理で更新
    gemLabel: "",
    // ★ 統計ベースの「隠れ良作候補」フラグ
    isStatisticallyHidden,
    releaseDate: releaseDateStr,
    releaseYear,
    isAvailableInStore: true,
  };

  return rankingGame;
}

async function upsertGamesToRankingsCache(appIds: number[]): Promise<{
  inserted: number;
  skippedExisting: number;
  results: { appId: number; status: "ok" | "error"; message?: string }[];
}> {
  const results: {
    appId: number;
    status: "ok" | "error";
    message?: string;
  }[] = [];

  let inserted = 0;
  let skippedExisting = 0;

  if (!appIds.length) {
    return { inserted, skippedExisting, results };
  }

  // まず倉庫テーブル steam_games から、対象 appId の行をまとめて取得
  const { data: steamRows, error } = await supabase
    .from("steam_games")
    .select(
      `
        app_id,
        title,
        positive_ratio,
        total_reviews,
        estimated_owners,
        price,
        average_playtime,
        tags,
        screenshots,  
        steam_url,
        review_score_desc,
        release_date,
        release_year,
        last_steam_fetch_at
      `
    )
    .in("app_id", appIds);

  if (error) {
    console.error("supabase steam_games fetch error", error);
    for (const appId of appIds) {
      results.push({
        appId,
        status: "error",
        message: error.message,
      });
    }
    return { inserted, skippedExisting, results };
  }

  const rowsByAppId = new Map<number, any>();
  for (const row of steamRows ?? []) {
    rowsByAppId.set(Number(row.app_id), row);
  }

  for (const appId of appIds) {
    try {
      const row = rowsByAppId.get(Number(appId));
      if (!row) {
        results.push({
          appId,
          status: "error",
          message: "steam_games row not found for this appId",
        });
        continue;
      }

      // steam_games の行から RankingGame を組み立てる
      const rankingGame = buildRankingGameFromSteamRow(row);

      const appIdStr = String(appId);

      // 既存の analysis / gemLabel がある場合は保持するためのプレースホルダ
      let rankingGameForUpdate = rankingGame;

      // 既に同じ appId の行があれば UPDATE、なければ INSERT
      const { data: existing, error: selectError } = await supabase
        .from("game_rankings_cache")
        .select("id, data") // ★ 元は "id" だけだった所を変更
        .eq("data->>appId", appIdStr)
        .maybeSingle();

      if (selectError) {
        console.error("Select error in game_rankings_cache", selectError);
        results.push({
          appId,
          status: "error",
          message: selectError.message,
        });
        continue;
      }

      // 既存行がある場合は、analysis / gemLabel / headerImage を引き継ぐ
      if (existing && existing.data && typeof existing.data === "object") {
        const previousData = existing.data as any;

        rankingGameForUpdate = {
          ...rankingGame,
          analysis:
            previousData.analysis !== undefined
              ? previousData.analysis
              : rankingGame.analysis,
          gemLabel:
            previousData.gemLabel !== undefined
              ? previousData.gemLabel
              : rankingGame.gemLabel,
          // headerImage は既存があれば優先し、無い場合は今回計算したものを使う
          headerImage:
            previousData.headerImage ??
            previousData.header_image ??
            (rankingGame as any).headerImage ??
            (rankingGame as any).header_image,
          header_image:
            previousData.header_image ??
            previousData.headerImage ??
            (rankingGame as any).header_image ??
            (rankingGame as any).headerImage,
        };
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from("game_rankings_cache")
          .update({
            app_id: appId, // ← 追加
            title: rankingGameForUpdate.title, // ← 追加
            data: rankingGameForUpdate, // 既存 JSON も更新
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error("Update error in game_rankings_cache", updateError);
          results.push({
            appId,
            status: "error",
            message: updateError.message,
          });
          continue;
        }

        skippedExisting++; // 既存行の更新としてカウント
        inserted++; // UI 的には「処理成功」として数えたいので increment
        results.push({ appId, status: "ok" });
      } else {
        const { error: insertError } = await supabase
          .from("game_rankings_cache")
          .insert({
            app_id: appId, // ← 追加
            title: rankingGame.title, // ← 追加
            data: rankingGame, // 既存 JSON
          });

        if (insertError) {
          console.error("Insert error in game_rankings_cache", insertError);
          results.push({
            appId,
            status: "error",
            message: insertError.message,
          });
          continue;
        }

        inserted++;
        results.push({ appId, status: "ok" });
      }
    } catch (e) {
      console.error("Error importing appId from steam_games", appId, e);
      results.push({
        appId,
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { inserted, skippedExisting, results };
}

/**
 * Import 済みの appId 群に対して analyze-hidden-gem を実行し、
 * game_rankings_cache.data.analysis / gemLabel を更新する。
 *
 * - 既に analysis が入っている場合はスキップ
 * - 統計上の hidden gem 判定が true のものだけを対象にしても良いが、
 *   ここでは「import されたもの全て」をベースにしつつ
 *   analysis が null のものだけに絞る。
 */
async function runAiAnalysisForAppIds(appIds: number[]): Promise<void> {
  for (const appId of appIds) {
    try {
      const appIdStr = String(appId);

      const { data: existing, error } = await supabase
        .from("game_rankings_cache")
        .select("id, data")
        .eq("data->>appId", appIdStr)
        .maybeSingle();

      if (error) {
        console.error(
          "runAiAnalysisForAppIds: select error in game_rankings_cache",
          appId,
          error
        );
        continue;
      }

      if (!existing || !existing.data || typeof existing.data !== "object") {
        console.warn(
          "runAiAnalysisForAppIds: no existing row for appId",
          appId
        );
        continue;
      }

      const currentData = existing.data as any;

      const payload = currentData;

      const res = await fetch(ANALYZE_HIDDEN_GEM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error(
          "runAiAnalysisForAppIds: analyze-hidden-gem failed for appId",
          appId,
          await res.text()
        );
        continue;
      }

      const aiResult = await res.json();
      if (!aiResult || typeof aiResult !== "object") {
        console.error(
          "runAiAnalysisForAppIds: invalid AI response for appId",
          appId,
          aiResult
        );
        continue;
      }

      const updatedData: Record<string, any> = {
        ...currentData,
        analysis: aiResult,
      };

      if (typeof (aiResult as any).gemLabel === "string") {
        updatedData.gemLabel = (aiResult as any).gemLabel;
      }

      const { error: updateError } = await supabase
        .from("game_rankings_cache")
        .update({ data: updatedData })
        .eq("id", existing.id);

      if (updateError) {
        console.error(
          "runAiAnalysisForAppIds: update error in game_rankings_cache",
          appId,
          updateError
        );
        continue;
      }

      console.log(
        "runAiAnalysisForAppIds: stored AI analysis for appId",
        appId
      );
    } catch (e) {
      console.error(
        "runAiAnalysisForAppIds: unexpected error for appId",
        appId,
        e
      );
    }
  }
}

async function fetchCandidateGamesByFilters(params: FilterParams): Promise<{
  candidates: ImportCandidate[];
  totalCandidates: number;
}> {
  const {
    recentDays,
    minPositiveRatio,
    minTotalReviews,
    maxEstimatedOwners,
    maxPrice,
    tags,
    limit = 200,
    // ★ 追加
    releaseFrom,
    releaseTo,
  } = params;

  let query = supabase.from("steam_games").select(
    `
        app_id,
        title,
        positive_ratio,
        total_reviews,
        estimated_owners,
        price,
        tags,
        release_date,
        release_year,
        last_steam_fetch_at
      `,
    { count: "exact" }
  );

  // 直近◯日フィルタ（release_date 基準）
  if (recentDays && recentDays > 0) {
    const since = new Date();
    since.setDate(since.getDate() - recentDays);
    const sinceIso = since.toISOString();

    // ★ 基準を last_steam_fetch_at → release_date に変更
    query = query.gte("release_date", sinceIso);
  }

  // ★ 発売年月フィルタ（"YYYY-MM" を期待）
  if (releaseFrom) {
    // "YYYY-MM" → "YYYY-MM-01"
    const fromDate = `${releaseFrom}-01`;
    query = query.gte("release_date", fromDate);
  }

  if (releaseTo) {
    const [y, m] = releaseTo.split("-").map((v: string) => Number(v));
    if (y && m) {
      const lastDay = new Date(y, m, 0).getDate(); // 月末日
      const toDate = `${releaseTo}-${String(lastDay).padStart(
        2,
        "0"
      )}T23:59:59Z`;
      query = query.lte("release_date", toDate);
    }
  }

  if (minPositiveRatio != null) {
    query = query.gte("positive_ratio", minPositiveRatio);
  }

  if (minTotalReviews != null) {
    query = query.gte("total_reviews", minTotalReviews);
  }

  if (maxEstimatedOwners != null) {
    query = query.lte("estimated_owners", maxEstimatedOwners);
  }

  if (maxPrice != null) {
    query = query.lte("price", maxPrice);
  }

  if (tags && tags.length > 0) {
    // tags は text[] を想定（jsonb[] でも contains でOK）
    query = query.contains("tags", tags);
  }

  query = query.limit(limit);

  const { data, error, count } = await query;

  if (error) {
    console.error("fetchCandidateGamesByFilters error", error);
    throw new Error(error.message);
  }

  const candidates: ImportCandidate[] =
    (data ?? []).map((row: any) => ({
      appId: row.app_id,
      title: row.title,
      positiveRatio: row.positive_ratio ?? 0,
      totalReviews: row.total_reviews ?? 0,
      estimatedOwners: row.estimated_owners ?? 0,
      price: row.price ?? 0,
      tags: row.tags ?? [],
      // ★ 発売日があればそちらを優先、なければ取得日時
      releaseDate: row.release_date ?? row.last_steam_fetch_at ?? undefined,
    })) ?? [];

  return {
    candidates,
    totalCandidates: count ?? candidates.length,
  };
}

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// ▼ 日付文字列からリリース年を抽出するユーティリティ
