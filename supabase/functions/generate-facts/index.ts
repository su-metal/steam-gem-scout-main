// supabase/functions/generate-facts/index.ts
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 既存のFactsカタログ（SSOT）
import { FACT_TAGS } from "../_shared/facts-v11.ts";

// facts-v11.ts 側に isFactTag が無い前提で、ここで確定ガードを作る
const FACT_TAG_SET = new Set<string>(
  (FACT_TAGS as readonly string[]).map((t) => String(t).trim().toLowerCase())
);
function isFactTag(t: string) {
  return FACT_TAG_SET.has(String(t).trim().toLowerCase());
}

type GenerateFactsRequest = {
  appId: number | string;
  force?: boolean;
  sources?: string[];
  debug?: boolean;
};

type EvidenceItem = {
  source: string;
  quote: string;
  confidence?: number;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function badRequest(message: string) {
  return json(400, { error: message });
}

function normalizeBool(v: unknown, fallback = false) {
  return typeof v === "boolean" ? v : fallback;
}

function parseAppId(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

async function fetchSteamAppDetails(appId: number) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`;
  const res = await fetch(url, {
    headers: { "user-agent": "generate-facts/1.0" },
  });
  if (!res.ok) return { ok: false as const, status: res.status, url };
  const data = await res.json();
  const entry = data?.[String(appId)];
  if (!entry?.success || !entry?.data)
    return { ok: false as const, status: 404, url };
  return { ok: true as const, status: 200, url, data: entry.data };
}

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCorpusFromSteam(app: any) {
  const short =
    typeof app?.short_description === "string" ? app.short_description : "";
  const about =
    typeof app?.about_the_game === "string" ? app.about_the_game : "";
  const genres = Array.isArray(app?.genres)
    ? app.genres.map((g: any) => g?.description).filter(Boolean)
    : [];
  const categories = Array.isArray(app?.categories)
    ? app.categories.map((c: any) => c?.description).filter(Boolean)
    : [];

  const corpus = [
    `steam.short:\n${stripHtml(short)}`,
    `steam.about:\n${stripHtml(about)}`,
    `steam.genres:\n${genres.join(", ")}`,
    `steam.categories:\n${categories.join(", ")}`,
  ].join("\n\n");

  const MAX_CHARS = 16000;
  return corpus.length > MAX_CHARS ? corpus.slice(0, MAX_CHARS) : corpus;
}

async function generateFactsViaLLM(args: { appId: number; corpus: string }) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = Deno.env.get("OPENAI_FACTS_MODEL") ?? "gpt-4o-mini";

  // カタログ（facts-v11.ts の FACT_TAGS）をプロンプトで“列挙”して幻覚を抑える
  const allowedTags = Array.from(FACT_TAG_SET).sort();

  // Structured Outputs: json_schema で固定（スキーマに必ず一致）
  // Docs: response_format = { type:"json_schema", json_schema:{...} } :contentReference[oaicite:1]{index=1}
  const schema = {
    name: "facts_output",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["tags", "evidence"],
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Allowed tag ids only (lowercase).",
        },
        evidence: {
          type: "object",
          additionalProperties: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source", "quote"],
              properties: {
                source: { type: "string" },
                quote: { type: "string" },
                confidence: { type: "number" },
              },
            },
          },
          description:
            "Map tag -> evidence items (at least 1 per returned tag).",
        },
      },
    },
  } as const;

  const system = [
    "You are a facts extractor for Steam games.",
    "Return ONLY JSON that matches the provided JSON Schema.",
    "Select tags ONLY from the provided allowed tag list.",
    "Every returned tag MUST have at least 1 evidence item.",
    "Evidence quotes must be short excerpts copied from the corpus (no paraphrase).",
    "If unsure, omit the tag.",
  ].join("\n");

  const user = [
    `appId: ${args.appId}`,
    "",
    "Allowed facts tags (exact match, lowercase):",
    allowedTags.join(", "),
    "",
    "Corpus (sources are prefixed like steam.short / steam.about / steam.genres / steam.categories):",
    args.corpus,
  ].join("\n");

  const body = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const status = res.status;
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    console.error("[generate-facts] openai http error", {
      status,
      textPreview: text.slice(0, 400),
    });
    throw new Error(`OpenAI HTTP ${status}: ${text.slice(0, 800)}`);
  }

  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    console.error("[generate-facts] openai json parse failed", {
      status,
      textPreview: text.slice(0, 800),
    });
    throw new Error(
      `OpenAI parse failed (HTTP ${status}): ${text.slice(0, 800)}`
    );
  }

  const content =
    json?.choices?.[0]?.message?.content ??
    json?.output?.[0]?.content?.find?.((c: any) => c?.type === "output_text")
      ?.text ??
    json?.output_text;

  const rawText = typeof content === "string" ? content : "";
  if (!rawText) {
    console.error("[generate-facts] openai missing content", {
      status,
      jsonPreview: JSON.stringify(json).slice(0, 800),
    });
    throw new Error(`OpenAI response missing content (HTTP ${status})`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("[generate-facts] model content not json", {
      rawTextPreview: rawText.slice(0, 800),
    });
    throw new Error(`Model output is not valid JSON: ${rawText.slice(0, 800)}`);
  }

  return {
    model,
    ...(parsed ?? {}),
  };
}

function guardFacts(raw: {
  tags: string[];
  evidence: Record<string, EvidenceItem[]>;
}) {
  const MAX_TAGS = 24;

  const normalizedTags = (raw.tags ?? [])
    .map((t) => String(t).trim().toLowerCase())
    .filter((t) => t.length > 0);

  const outTags: string[] = [];
  const outEvidence: Record<string, EvidenceItem[]> = {};

  for (const t of normalizedTags) {
    if (!isFactTag(t)) continue;

    const ev = raw.evidence?.[t];
    if (!Array.isArray(ev) || ev.length === 0) continue;

    const cleanedEv = ev
      .map((x) => ({
        source: String((x as any)?.source ?? "").trim(),
        quote: String((x as any)?.quote ?? "").trim(),
        confidence:
          typeof (x as any)?.confidence === "number"
            ? (x as any).confidence
            : undefined,
      }))
      .filter((x) => x.source && x.quote);

    if (cleanedEv.length === 0) continue;

    outTags.push(t);
    outEvidence[t] = cleanedEv;

    if (outTags.length >= MAX_TAGS) break;
  }

  return { tags: outTags, evidence: outEvidence };
}

// serve import をやめて Deno.serve を使う（型も Request で確定）
Deno.serve(async (req: Request) => {
  console.log("[generate-facts] request", {
    method: req.method,
    url: req.url,
    at: new Date().toISOString(),
  });

  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  let body: GenerateFactsRequest;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const appId = parseAppId(body?.appId);
  if (!appId) return badRequest("appId is required");

  const force = normalizeBool(body?.force, false);
  const debug = normalizeBool(body?.debug, false);
  const sources = Array.isArray(body?.sources) ? body.sources : ["steam"];

  console.log("[generate-facts] parsed", { appId, force, debug, sources });

  if (sources.length === 0 || sources.some((s) => s !== "steam")) {
    return badRequest("sources must be ['steam'] for now");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json(500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: existing, error: readErr } = await supabase
    .from("game_rankings_cache")
    .select("app_id, data")
    .eq("app_id", appId)
    .maybeSingle();

  if (readErr)
    return json(500, { error: "DB read failed", details: readErr.message });

  console.log("[generate-facts] cache row lookup", {
    table: "game_rankings_cache",
    key: "app_id",
    appId,
    found: !!existing,
  });

  // A案：publish 前（=行が無い）なら保存できないので終了
  if (!existing) {
    return json(200, { appId, saved: false, reason: "missing-cache-row" });
  }

  const existingFacts = (existing as any)?.data?.facts;
  if (existingFacts && !force) {
    return json(200, { appId, saved: false, reason: "already-exists" });
  }

  const steam = await fetchSteamAppDetails(appId);
  if (!steam.ok) {
    return json(404, {
      error: "steam-appdetails-not-found",
      appId,
      status: steam.status,
      url: steam.url,
    });
  }

  const corpus = buildCorpusFromSteam(steam.data);

  let raw: Awaited<ReturnType<typeof generateFactsViaLLM>> | null = null;
  try {
    raw = await generateFactsViaLLM({ appId, corpus });
  } catch (e) {
    console.error("[generate-facts] openai failed", {
      appId,
      message: (e as any)?.message ?? String(e),
    });
    return json(500, {
      error: "openai_failed",
      appId,
      details: (e as any)?.message ?? String(e),
    });
  }
  console.log("[generate-facts] llm raw", {
    model: raw?.model,
    rawTagCount: Array.isArray(raw?.tags) ? raw.tags.length : null,
    rawTagsPreview: Array.isArray(raw?.tags) ? raw.tags.slice(0, 10) : null,
  });

  const guarded = guardFacts({ tags: raw.tags, evidence: raw.evidence });
  console.log("[generate-facts] guarded", {
    savedTagCount: guarded.tags.length,
    savedTags: guarded.tags,
  });

  console.log("[generate-facts] guard diff", {
    rawTagsCount: Array.isArray(raw?.tags) ? raw.tags.length : 0,
    rawTags: Array.isArray(raw?.tags) ? raw.tags.slice(0, 20) : [],
    guardedCount: Array.isArray(guarded?.tags) ? guarded.tags.length : 0,
    guardedTags: Array.isArray(guarded?.tags) ? guarded.tags : [],
    rejected:
      Array.isArray(raw?.tags) && Array.isArray(guarded?.tags)
        ? raw.tags
            .map((t: any) => String(t).trim().toLowerCase())
            .filter((t: string) => t)
            .filter((t: string) => !guarded.tags.includes(t))
            .slice(0, 40)
        : [],
  });

  const now = new Date().toISOString();

  const nextData = {
    ...((existing as any)?.data ?? {}),
    facts: guarded.tags,
    facts_meta: {
      version: "v1.1",
      generatedAt: now,
      model: raw.model ?? "unknown",
      evidence: guarded.evidence,
      sources: {
        steam: {
          fetchedAt: now,
          appDetailsOk: true,
          storeApiUrl: steam.url,
        },
      },
      notes: "facts-only",
    },
  };

  const { error: updateErr } = await supabase
    .from("game_rankings_cache")
    .update({ data: nextData })
    .eq("app_id", appId);

  console.log("[generate-facts] update", {
    ok: !updateErr,
    error: updateErr?.message ?? null,
    factsCount: Array.isArray((nextData as any)?.facts)
      ? (nextData as any).facts.length
      : null,
  });

  if (updateErr) {
    console.error("[generate-facts] update failed", updateErr);
    return json(500, {
      error: "db_update_failed",
      appId,
      details: updateErr.message,
    });
  }

  const { data: checkRow, error: checkErr } = await supabase
    .from("game_rankings_cache")
    .select("app_id, data")
    .eq("app_id", appId)
    .maybeSingle();

  console.log("[generate-facts] post-check", {
    ok: !checkErr,
    hasFacts: Array.isArray((checkRow as any)?.data?.facts),
    factsCount: Array.isArray((checkRow as any)?.data?.facts)
      ? (checkRow as any).data.facts.length
      : null,
    error: checkErr?.message ?? null,
  });

  if (debug) {
    return json(200, {
      appId,
      saved: true,
      facts: guarded.tags,
      debug: {
        corpusChars: corpus.length,
        rawTagCount: raw.tags?.length ?? 0,
        savedTagCount: guarded.tags.length,
      },
    });
  }

  return json(200, { appId, saved: true, facts: guarded.tags });
});
