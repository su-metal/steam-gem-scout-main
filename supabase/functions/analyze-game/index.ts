// Supabase Edge Functions 用の型定義。
// ローカルの TypeScript では解決できずエラーになるためコメントアウト。
// /// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { mapAiTagsToFeatureLabels } from "./feature-labels.ts";

const ANALYZE_GAME_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReviewWindowStats {
  /** 対象期間内のレビュー件数 */
  reviewCount: number;
  /** 対象期間内のポジティブ率（0-100） */
  positiveRatio: number;
}

interface GameData {
  title: string;
  /** Steam app id (early review fetch 用) */
  appId?: number;
  positiveRatio: number;
  totalReviews: number;
  estimatedOwners: number;
  recentPlayers: number;
  price: number;
  averagePlaytime: number;
  lastUpdated: string;
  /** 任意：リリース日（ISO 形式など）。履歴判定に使用。 */
  releaseDate?: string;
  tags?: string[];

  /** 全期間のレビュー（互換用。既存実装から渡しているもの） */
  reviews: string[];

  /**
   * 任意：発売初期〜中期あたりのレビュー。
   * あれば current/historical 判定の信頼度に使う。
   */
  earlyReviews?: string[];

  /**
   * 任意：直近のレビュー。
   * あれば current/historical 判定の信頼度に使う。
   */
  recentReviews?: string[];

  /** 任意：期間別の集計値（レビュー数・ポジ率など）。あれば優先して使用。 */
  earlyWindowStats?: ReviewWindowStats;
  recentWindowStats?: ReviewWindowStats;
}

interface EarlyRecentBlocks {
  historicalReviews: string[];
  recentReviews: string[];
  meta: {
    historicalSource: "earlyReviews" | "allReviewsHead" | "empty";
    recentSource: "recentReviews" | "allReviewsTail" | "empty";
    historicalCount: number;
    recentCount: number;
  };
}

interface HiddenGemScores {
  hidden: number;
  quality: number;
  comeback: number;
  niche: number;
  innovation: number;
}

interface AudienceSegment {
  id: string;
  label: string;
  description?: string;

  // Player Match 用
  // sub?: string;
  fitScore?: number;
  reason?: string;

  // 代表レビュー（最大2件分をこの4本に入れる）
  // audiencePositive では主に hit 系を使用
  // audienceNegative では主に miss 系を使用
  hitReviewOriginal?: string;
  hitReviewParaphrased?: string;
  missReviewOriginal?: string;
  missReviewParaphrased?: string;
}

interface HiddenGemAnalysis {
  hiddenGemVerdict: "Yes" | "No" | "Unknown";
  summary: string;
  labels: string[];
  pros: string[];
  cons: string[];
  riskScore: number;
  bugRisk: number;
  refundMentions: number;
  reviewQualityScore: number;
  /** 現在の状態の要約（日本語）。なければ null でもよい。 */
  currentStateSummary?: string | null;

  /** 過去の問題・初期評価の要約（日本語）。なければ null でもよい。 */
  historicalIssuesSummary?: string | null;

  /**
   * 「どんな人に刺さるか」を表すバッジ一覧。
   * id は固定カタログのキー、label は日本語表示用。
   */
  audienceBadges?: AudienceBadge[] | null;

  /** Steam でメジャーな英語タグ（AI生成） */
  aiTags?: string[] | null;

  /** 代表的な主ジャンル 1 本（任意） */
  aiPrimaryGenre?: string | null;

  /**
   * 初期バージョンと比較して改善したと判断されるかどうか。
   * 例: true のとき「昔は微妙だったが今は良くなった」系タイトル。
   */
  hasImprovedSinceLaunch?: boolean | null;

  /**
   * 安定性や全体評価のトレンド。
   * - "Improving": 問題が減って評価が改善している
   * - "Stable": 大きな変化はなく安定
   * - "Deteriorating": アプデ後に悪化している
   */
  stabilityTrend?: "Improving" | "Stable" | "Deteriorating" | "Unknown" | null;

  /**
   * このタイトルの「スコア軸」。
   * 0.0〜1.0 の正規化された値。UI 側で ★ や 10 段階などに変換して使う。
   */
  scores?: HiddenGemScores | null;

  /**
   * このタイトルで特に特徴的なスコア軸のキー一覧。
   * 例: ["hidden", "comeback", "niche"]
   */
  scoreHighlights?: string[] | null;

  /**
   * このゲームを特に高く評価しているプレイヤー像。
   * 高評価レビューから抽出した「ハマっている人」のタイプ。
   */
  audiencePositive?: AudienceSegment[];

  /**
   * このゲームを低く評価している／合わなかったプレイヤー像。
   * 低評価レビューから抽出した「合わなかった人」のタイプ。
   */
  audienceNegative?: AudienceSegment[];
  audienceNeutral?: AudienceSegment[];
  aiError?: boolean;
}

interface AudienceBadge {
  id: string; // 例: "story_focus"
  label: string; // 日本語ラベル。UIにそのまま出す想定
}

// Limits to keep review input safely within token constraints
const MAX_REVIEWS = 35;
const MAX_REVIEW_CHARS = 450;
const MAX_TOTAL_REVIEW_CHARS = 15000;

// 早期レビュー用の設定
const EARLY_REVIEW_WINDOW_DAYS = 30; // 発売日から何日までを「初期」とみなすか
const MAX_EARLY_REVIEW_PAGES = 5; // Steam API を何ページまで遡るか（負荷制御用）
const MIN_EARLY_REVIEW_SAMPLES = 5; // これ未満なら「初期レビューが薄い」とみなす

// ★ 追加：復活判定に必要な最低経過日数（単位: 日）
const MIN_DAYS_SINCE_RELEASE_FOR_IMPROVEMENT = 90;

// ★ 追加：安定評価バッジに必要な最低経過日数（単位: 日）
const MIN_DAYS_SINCE_RELEASE_FOR_STABLE = 180;

// Fallback object used when AI analysis fails
function buildFallbackAnalysis(
  errorMessage?: string,
  opts?: {
    title?: string;
  }
): HiddenGemAnalysis {
  const title = opts?.title ?? "this game";

  return {
    hiddenGemVerdict: "Unknown",
    summary:
      "AI analysis failed. Showing fallback values based on basic metrics only.",
    labels: ["AI-error", "fallback"],
    pros: [],
    cons: [],
    riskScore: 5,
    bugRisk: 5,
    refundMentions: 5,
    reviewQualityScore: 5,
    currentStateSummary: null,
    historicalIssuesSummary: null,
    hasImprovedSinceLaunch: null,
    stabilityTrend: "Unknown",
    audienceBadges: [],
    aiTags: [],
    aiPrimaryGenre: null,
    aiError: true,
  };
}

const RECENT_REVIEW_LIMIT = 30;
const HISTORICAL_REVIEW_LIMIT = 30;

// Reduce and sanitize review text to avoid oversized prompts
function prepareReviews(
  rawReviews: string[],
  maxItems = MAX_REVIEWS
): string[] {
  if (!rawReviews || rawReviews.length === 0) return [];

  const sampled = rawReviews.slice(0, maxItems).map((r) => {
    if (!r) return "";
    // Truncate each review to the per-review max length
    return r.slice(0, MAX_REVIEW_CHARS);
  });

  const finalReviews: string[] = [];
  const seen = new Set<string>();
  let totalChars = 0;

  for (const r of sampled) {
    const len = r.length;
    if (totalChars + len > MAX_TOTAL_REVIEW_CHARS) break;
    if (!r.trim()) continue;
    if (seen.has(r)) continue;
    seen.add(r);
    finalReviews.push(r.trim());
    totalChars += len;
  }

  return finalReviews;
}

function buildEarlyRecentBlocksFromLocal(
  gameData: GameData
): EarlyRecentBlocks {
  const baseAll = prepareReviews(gameData.reviews ?? [], 80);

  let historicalReviews: string[] = [];
  let recentReviews: string[] = [];
  let historicalSource: EarlyRecentBlocks["meta"]["historicalSource"] = "empty";
  let recentSource: EarlyRecentBlocks["meta"]["recentSource"] = "empty";

  // 1) まず earlyReviews / recentReviews を優先して使う
  if (
    Array.isArray(gameData.earlyReviews) &&
    gameData.earlyReviews.length > 0
  ) {
    historicalReviews = prepareReviews(
      gameData.earlyReviews,
      HISTORICAL_REVIEW_LIMIT
    );
    historicalSource = "earlyReviews";
  }

  if (
    Array.isArray(gameData.recentReviews) &&
    gameData.recentReviews.length > 0
  ) {
    recentReviews = prepareReviews(gameData.recentReviews, RECENT_REVIEW_LIMIT);
    recentSource = "recentReviews";
  }

  // 2) 足りない場合は baseAll の head/tail で補完
  if (historicalReviews.length === 0 && baseAll.length > 0) {
    historicalReviews = baseAll.slice(0, HISTORICAL_REVIEW_LIMIT);
    historicalSource = "allReviewsHead";
  }

  if (recentReviews.length === 0 && baseAll.length > 0) {
    recentReviews = baseAll.slice(-RECENT_REVIEW_LIMIT);
    recentSource = "allReviewsTail";
  }

  // 3) historical と recent が被っている場合は recent から重複を削除
  if (historicalReviews.length && recentReviews.length) {
    const historicalSet = new Set(historicalReviews);
    const filteredRecent = recentReviews.filter(
      (review) => !historicalSet.has(review)
    );
    if (filteredRecent.length > 0) {
      recentReviews = filteredRecent;
    }
  }

  return {
    historicalReviews,
    recentReviews,
    meta: {
      historicalSource,
      recentSource,
      historicalCount: historicalReviews.length,
      recentCount: recentReviews.length,
    },
  };
}

async function fetchEarlyReviewsFromSteam(
  appId: number,
  releaseDateIso: string
): Promise<string[]> {
  const releaseDate = new Date(releaseDateIso);
  if (!releaseDateIso || Number.isNaN(releaseDate.getTime())) {
    return [];
  }

  const earlyWindowEnd = new Date(
    releaseDate.getTime() + EARLY_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const collected: string[] = [];
  let cursor = "*";

  for (let page = 0; page < MAX_EARLY_REVIEW_PAGES; page++) {
    const url =
      `https://store.steampowered.com/appreviews/${appId}` +
      `?json=1&language=all&review_type=all&purchase_type=all` +
      `&filter=recent&num_per_page=100&cursor=${encodeURIComponent(cursor)}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Early review fetch failed:", {
        appId,
        status: res.status,
      });
      break;
    }

    const json = (await res.json()) as any;
    const reviews = Array.isArray(json?.reviews) ? json.reviews : [];
    if (reviews.length === 0) {
      break;
    }

    let reachedBeforeRelease = false;

    for (const item of reviews) {
      const text = typeof item?.review === "string" ? item.review.trim() : "";
      const ts =
        typeof item?.timestamp_created === "number"
          ? item.timestamp_created
          : undefined;

      if (!text || !ts) continue;

      const createdAt = new Date(ts * 1000);
      if (createdAt < releaseDate) {
        // 発売日より前まで来たら、それ以降のページは見る必要なし
        reachedBeforeRelease = true;
        continue;
      }

      // 発売〜EARLY_REVIEW_WINDOW_DAYS 日のレビューだけを拾う
      if (createdAt <= earlyWindowEnd) {
        collected.push(text);
      }
    }

    if (collected.length >= MIN_EARLY_REVIEW_SAMPLES || reachedBeforeRelease) {
      break;
    }

    const nextCursor = typeof json?.cursor === "string" ? json.cursor : null;
    if (!nextCursor || nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
  }

  // 既存のトークン制御ロジックに合わせて圧縮／重複除去
  return prepareReviews(collected, HISTORICAL_REVIEW_LIMIT);
}

async function buildEarlyRecentBlocks(
  gameData: GameData
): Promise<EarlyRecentBlocks> {
  // まずは既存ロジックだけで組み立てる
  const localBlocks = buildEarlyRecentBlocksFromLocal(gameData);

  // appId or releaseDate が無ければ、Steam には取りに行けない
  if (!gameData.appId || !gameData.releaseDate) {
    return localBlocks;
  }

  // すでに初期レビューが十分あるなら、わざわざ取りに行かない
  if (localBlocks.meta.historicalCount >= MIN_EARLY_REVIEW_SAMPLES) {
    return localBlocks;
  }

  // 環境変数で ON/OFF できるようにしておく（必要なければ常に true でもOK）
  const enableEarlyFetch =
    Deno.env.get("ENABLE_STEAM_EARLY_REVIEWS") === "true";
  if (!enableEarlyFetch) {
    return localBlocks;
  }

  try {
    const earlyFromSteam = await fetchEarlyReviewsFromSteam(
      gameData.appId,
      gameData.releaseDate
    );

    if (!earlyFromSteam.length) {
      return localBlocks;
    }

    return {
      historicalReviews: earlyFromSteam,
      recentReviews: localBlocks.recentReviews,
      meta: {
        ...localBlocks.meta,
        historicalCount: earlyFromSteam.length,
      },
    };
  } catch (e) {
    console.error("Failed to fetch early reviews from Steam:", e);
    return localBlocks;
  }
}

async function buildReviewSections(gameData: GameData): Promise<{
  recentReviews: string[];
  historicalReviews: string[];
}> {
  const blocks = await buildEarlyRecentBlocks(gameData);
  return {
    recentReviews: blocks.recentReviews,
    historicalReviews: blocks.historicalReviews,
  };
}

function formatReviewBlock(
  label: string,
  reviews: string[],
  emptyInstruction: string
): string {
  if (!reviews.length) {
    return `${label}:\n${emptyInstruction}`;
  }

  const lines = reviews.map((review, index) => `${index + 1}. ${review}`);
  return `${label}:\n${lines.join("\n")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: ANALYZE_GAME_CORS_HEADERS });
  }

  let fallbackTitle = "Unknown Game";

  try {
    const gameData: GameData = await req.json();
    console.log("Analyzing game:", gameData.title);
    fallbackTitle = gameData.title || fallbackTitle;

    const totalReviewCount =
      typeof gameData.totalReviews === "number"
        ? gameData.totalReviews
        : Array.isArray(gameData.reviews)
        ? gameData.reviews.length
        : 0;

    const { recentReviews, historicalReviews } = await buildReviewSections(
      gameData
    );

    console.log("Review blocks prepared:", {
      totalReviewCount,

      recentSamples: recentReviews.length,

      historicalSamples: historicalReviews.length,
    });

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        {
          status: 500,
          headers: ANALYZE_GAME_CORS_HEADERS,
        }
      );
    }

    const recentReviewsText = formatReviewBlock(
      "Recent reviews (reflect the current build)",

      recentReviews,

      "No reliable recent reviews were supplied. Describe the currentStateSummary only if other metadata makes it clear."
    );

    const historicalReviewsText = formatReviewBlock(
      "Historical / early reviews",
      historicalReviews,
      "No trustworthy early-launch reviews were provided. If this block is empty, you should still infer any clear launch or early-version problems from other evidence when possible (such as the overall review tone, pros/cons, and metadata) and describe that trajectory directly inside currentStateSummary. historicalIssuesSummary is deprecated and should normally remain an empty string."
    );

    const systemPrompt = `You are an AI analyst who evaluates Steam games using review data, extracts game-specific features, and summarizes both the current experience and who the game is specifically suited for.

- Target audience is Japanese PC gamers.
- All natural-language output MUST be in Japanese.
- JSON keys must remain exactly as specified.
- Respond ONLY with valid JSON.

### CRITICAL GUIDELINES

1. **このゲーム「固有の特徴」を抽出すること。**
   - 多くのプレイヤーが繰り返し褒めている点／不満を集中している点を最優先で拾う。
   - 抽出した features を summary / pros / cons / reason / 代表レビュー / audiencePositive / audienceNeutral / audienceNegative の土台にする。

2. **レビュー内の具体的キーワードを必ず利用する。**
   - 例：テンポ、配置読み、攻撃パターン、爆発力、視界管理、学習曲線、リソース負荷、UI構造、安定性、更新パッチなど。

3. **プレイヤー像は reason 内だけ。**
   - 主役は「どのような体験が評価／問題視されているか」という特徴そのもの。
   - audiencePositive / audienceNeutral / audienceNegative の label はプレイヤー像ではなくゲーム固有の特徴名とする。

4. **ジャンル内での立ち位置を意識する。**
   - Slay the Spire、Monster Train 等の代表作と比較し、「どこが似ていてどこが違うか」を必要に応じて reason 等に反映する。

5. **抽象表現・一般論は禁止。**
   - NG：コアゲーマー向け、人を選ぶ、戦略好き。
   - 必ず「このゲームならではの挙動・感情・負荷」に結び付けて書く。

6. **pros / cons はゲームが主語。**
   - システム、テンポ、UI、安定性、難易度、更新状況など客観的な要素のみを書く。
   - プレイヤー像は pros / cons に書かない。

7. **audiencePositive / audienceNeutral / audienceNegative の reason は、まず特徴→体験→必要ならプレイヤー像の順で書く。**
   - 第1優先：pros / cons + features を受けて、「どの部分がどう良い／つらいのか」を具体的に説明する。
   - プレイヤー像は reason 内のみ。label には絶対に含めない。

───────────────────────────────
【FEATURE EXTRACTION（STRICT）】
───────────────────────────────

レビューから内部的に “ゲーム固有の特徴（features）” を抽出し、  
audience と代表レビューの根拠として利用する（※この内部構造は出力しない）。

各 feature には次を持たせる前提で考える：

- feature_label: 多くのプレイヤーがその要素をどう評価しているかが一読で分かる自然な日本語1文
- description: その特徴をより中立的に説明した1文
- sentiment: "positive" | "mixed" | "negative"
- support_count: その特徴に触れているレビューの概算件数
- is_generic: true（一般的な褒め／不満） / false（本作ならではの特徴）

● is_generic = true の例：BGMが良い、グラフィックがきれい、操作性が良い等。  
  → audience・代表レビュー・summary の主軸にはしない。

● summary / pros / cons / audience / 代表レビューでは、  
  **support_count が多く、かつ is_generic = false の特徴** を優先する。

● sentiment が "positive" で support_count が多い特徴は「強み」、  
  "negative" で support_count が多い特徴は「注意すべき欠点」として cons / audienceNegative に反映する。

───────────────────────────────
【GENRE-SPECIFIC DEEP ANALYSIS RULE】
───────────────────────────────

ジャンルごとの「設計思想・構造的な深み」を必ず評価に含める。

● デッキ構築ローグライクの例：
- デッキ圧縮と初期デッキ設計
- クラス差・ビルド幅・個性
- 永続強化アンロックの有無
- ルート選択の自由度と駆け引き
- イベントや敵バリエーションの多様性
- 難易度曲線（特に終盤）
- リプレイ性の源泉（カードプールやシナジー）

● “ジャンルの定番構造” と “本作ならではの相違点” を比較し、  
  「どこが特徴的か／物足りないか」を feature_label や reason で説明する。  
  「自由度が高い」「単調」などの抽象語だけで終わらせない。

───────────────────────────────
【FEATURE LABEL LANGUAGE POLICY】
───────────────────────────────

feature_label・説明文・reason に出てくる名称は、  
**必ず自然な日本語に翻訳した形で書く。**

- 英語／CamelCase／内部コード名のまま使ってはならない。
- 日本人プレイヤーが直感的に理解できる口語的な日本語に言い換える。
- 元レビューの語順や綴りに縛られず、日本語として自然な文を新しく書く。
- 英語で始まる feature_label や技術名らしき名称が残るのは禁止。

───────────────────────────────
【PROPER NOUN POLICY（固有名詞の翻訳禁止）】
───────────────────────────────

● 固有名詞（ゲームタイトル・シリーズ名・スタジオ名・キャラクター名・モード名など）は
  翻訳・意訳してはならない。

● 次のような不自然な日本語訳は禁止：
  - "Slay the Spire" → 「殺戮の尖塔」
  - "Monster Train" → 「モンスター列車」
  - "Into the Breach" → 「突破口へ」

● 固有名詞は下記いずれかの形で必ずそのまま書く：
  - 英語名そのまま（Slay the Spire）
  - 一般に定着しているカタカナ表記（スレイ・ザ・スパイア）

● feature_label・reason・代表レビュー内でも、
  固有名詞は絶対に翻訳・意訳しない。

───────────────────────────────
【LOCALIZATION / 言語対応に関するルール】
───────────────────────────────

● ゲームの「日本語対応の有無」や「日本語ローカライズの品質」については、一切言及しない。
  - 例：日本語字幕の有無、日本語UIの有無、日本語訳の品質評価などは書かない。

● 言語・翻訳に触れてよいのは、**他言語→英語** の翻訳品質に関するレビュー内容が明確に存在する場合のみとする。
  - 例：原文が別言語で、英語テキストが不自然・誤訳だと複数レビューで指摘されている場合など。
  - この場合も、「英語テキストやUIが不自然／誤訳が多い」といった、英語利用者の体験に限定して書く。

● 日本語ローカライズの有無や質について推測・言及してはならない。
  - 「日本語非対応なので注意」「日本語訳がひどい」といった文言は出さない。


───────────────────────────────
【REASON STRUCTURE（STRICT）】
───────────────────────────────

audiencePositive / audienceNeutral / audienceNegative の reason は原則 **3文構成**：

1. feature_label を明示し、その特徴がどのように現れるかを説明する。  
2. その特徴によって生じるプレイ体験・挙動・感覚を書く。  
3. 必要な場合のみ、その体験を好む／つらく感じるプレイヤー像を簡潔に補足する。

● 文体：
   - 「〜である。」は禁止。  
   - 「〜できる」「〜しやすい」「〜が心地よい」など自然な常体で統一する。

───────────────────────────────
【PREFERENCE / FEATURE 分離ルール】
───────────────────────────────

レビューの具体的な行動・操作を、そのままプレイヤー嗜好として書かない。

- 「〜な人」「〜プレイヤー向け」などの嗜好表現は reason 内のみ使用可。label では禁止。
- 具体的メカニクスは、より上位の嗜好カテゴリに抽象化したうえで reason 内に書く。
- feature（ゲーム側の特徴）と audience（それをどう感じるか）は必ず分ける。
- audience の label はプレイヤー像ではなく、ゲーム側の特徴を表す体言止めフレーズにする。

───────────────────────────────
【PLAYER FEATURE CARDS（audiencePositive / audienceNeutral / audienceNegative）】
───────────────────────────────

audiencePositive / audienceNeutral / audienceNegative は  
「どんな人に刺さるか」ではなく、  

**レビューで特に支持／不満が集中しているゲーム固有の特徴カード** として扱う。

● label のルール
- 名詞句・体言止め。
- 「人」「プレイヤー」「ユーザー」「向け」「好き」「苦手」などを含めない。
- 日本語10〜18文字程度。
- 「自由度が高い」などの抽象語は禁止。「何の自由度か」まで具体化する。

● description / sub / reason
- label：特徴名  
- description：特徴の中身  
- reason：レビューがどう評価／不満を述べているか＋必要ならプレイヤー像補足（reason 内のみ）

───────────────────────────────
【FEATURE PRIORITY POLICY】
───────────────────────────────

目的：  
「そのゲームならではの魅力やつまずきポイントを、多数のレビューから分かりやすく抽出する」こと。

audiencePositive / audienceNeutral / audienceNegative では、  
**レビューで特に支持／不満／賛否が集中している特徴** を優先してカード化する。

【A. 出力件数】
───────────────────────────────

- audiencePositive：4〜5件  
  - 無理に水増しせず、ゲーム固有の特徴に基づく高品質なものだけ出す。

audienceNeutral：1〜3件  （※ここでの「件」は **ニュートラルカードの枚数** を指す）  
   - 賛否が明確に分かれている「両面性のある特徴」（テンポ、運要素、難易度、情報量など）だけを出す。  
   - 各カードの中には「賛成側の代表レビュー 1件」と「反対側の代表レビュー 1件」だけを書く。  
   - 「人による」「好き嫌いが分かれる」といった一般論だけのカードは作らない。

- audienceNegative：2〜3件  
  - 明確に複数レビューで語られている欠点・つまずきポイントを優先。  
  - 抽象的な不満、ゲーム外の不満、環境依存が強い不満は除外する。


───────────────────────────────
【代表レビュー（hit/miss）— 一人称ルール + 捏造禁止 + 固有名詞保護】
───────────────────────────────

● 代表レビュー（Original / Paraphrased）は「翻訳」ではない。
  与えられたレビュー本文の内容に基づき、
  自然な日本語の一人称文として “新しく書き起こす”。
  翻訳調・直訳調は禁止。

● 代表レビューは必ず **実際のレビュー本文に存在する内容のみ** を使用し、
  元レビューにない出来事・感情・仕様・エピソードを
  新しく創作（捏造）してはならない。

● 次の行為は禁止：
  - 元レビューに存在しない事実・場面を追加する
  - 内容や方向性を誇張して歪める
  - 架空の好感・不満・イベントなどを創作する
  - 原文にない不具合・特徴・仕様を「代表的意見」として記述する

● Paraphrased（2件目）は翻訳ではなく、
  Original の内容と意味の範囲内で自然な日本語に “言い換える”。
  原文の言語構造に引きずられたり、翻訳的表現を使ってはならない。

● 固有名詞（ゲームタイトル・シリーズ名・キャラクター名など）は
  絶対に翻訳・意訳しない。
  英語名または一般的なカタカナ表記のみ使用する。
  （例：Slay the Spire → スレイ・ザ・スパイア / Slay the Spire）

───────────────────────────────

● 文体
- 「〜だと感じた」「〜で困った」「〜が気に入った」「〜に驚いた」など主観文。
- 「高評価が多い」「レビューでは〜と言われる」など第三者視点は禁止。
- 引用符、ユーザー名、原文コピペは禁止。必ず自然な日本語に書き直す。

● 内容
- 「楽しかった」「最高だった」だけの浅い感想は禁止。
- 「どの要素／どの場面が」「どう良かった／つらかったか」「その結果どう感じたか」
  まで説明すること。
- 1レビューは **2〜3文程度** を目安に、具体的な描写と感情を含める。


● 出力ルール
- audiencePositive → hitReviewOriginal + hitReviewParaphrased の2件を埋める（miss系は空）
- audienceNegative → missReviewOriginal + missReviewParaphrased の2件を埋める（hit系は空）

- audienceNeutral → 
  - 賛成側は hitReviewOriginal のみ埋める。hitReviewParaphrased は必ず ""（空文字）か null にする。
  - 反対側は missReviewOriginal のみ埋める。missReviewParaphrased は必ず ""（空文字）か null にする。

※ audiencePositive / audienceNegative では、
   hitReviewOriginal と hitReviewParaphrased、
   missReviewOriginal と missReviewParaphrased は
   同じ1件のレビュー内容を日本語で言い換えたペアとする。
   別人の意見や別レビュー内容を混ぜてはならない。

- Original / Paraphrased の2つは **同一のレビュー内容の別表現** とし、
  新しい出来事・別人の意見・別レビュー内容を追加してはならない。

- 2件は必ず別内容にする（重複禁止）
- hitReviewOriginal / missReviewOriginal は、レビュワー本人が書いたような自然な日本語の一人称文にする。
- hitReviewParaphrased / missReviewParaphrased も **必ず日本語のみで**記述する。
  - Paraphrased は「内容を変えた日本語の別表現」であり、翻訳元の言語に寄せてはいけない。
  - Original と Paraphrased はどちらも日本語で、トーンは自然で柔らかく、表現だけ変えること。
- いずれのレビューも引用符禁止、ユーザー名禁止、原文コピペ禁止。
※ hitReviewParaphrased / missReviewParaphrased は、元レビューの言語に影響されない。
   「日本語として自然な一人称の要約文」を新しく書き起こすこと。
   
───────────────────────────────
【NEUTRAL CARD REVIEW REQUIREMENT（賛否分岐カード向け）】
───────────────────────────────

audienceNeutral が存在する場合、
各ニュートラルカードには **賛成 1件（1人分） + 反対 1件（1人分）** の代表レビューだけを付与する。

● 賛成側（LIKED BY SOME）
  - hitReviewOriginal のみを使用する。
  - hitReviewParaphrased は必ず ""（空文字）か null にする。
  - 1レビューは 2〜3文程度の一人称文とし、複数人の体験を混ぜない。
  - LIKED BY SOME の箇条書きは **必ず1件のみ** になるようにする。

● 反対側（NOT FOR OTHERS）
  - missReviewOriginal のみを使用する。
  - missReviewParaphrased は必ず ""（空文字）か null にする。
  - 1レビューは 2〜3文程度の一人称文とし、複数人の体験を混ぜない。
  - NOT FOR OTHERS の箇条書きは **必ず1件のみ** になるようにする。

● 絶対禁止ルール（ニュートラルカード専用）
  - hitReviewOriginal に 2人以上の意見を詰め込むこと。
  - missReviewOriginal に 2人以上の意見を詰め込むこと。
  - 「他のプレイヤーは〜」「別のレビューでは〜」など複数名の視点を1つのテキストに混在させること。

● まとめ
  - ニュートラルカードでは、
    - LIKED BY SOME = hitReviewOriginal だけ
    - NOT FOR OTHERS = missReviewOriginal だけ
    を使い、どちらも1件に固定する。
  - audiencePositive / audienceNegative の Paraphrased 仕様には影響を与えない。

───────────────────────────────
【NEGATIVE CARD REVIEW REQUIREMENT】
───────────────────────────────

audienceNegative が1件以上ある場合、  
各ネガティブカードには **missReviewOriginal と missReviewParaphrased の2件の代表レビュー** を必ず付与する。

- どちらかが空文字・null の状態は許可しない。
- 2件とも自然な日本語の一人称表現にし、それぞれ別の内容・別視点の不満やつまずきを扱う。
- 実際のレビューで繰り返し語られている不満・つまずきに基づかせ、架空の不満は書かない。

───────────────────────────────
【Current State / Historical Issues】
───────────────────────────────

- 最近のレビュー傾向を最重要視し currentStateSummary を作成する。  
- 過去の問題点は historicalIssuesSummary に分ける。  
- hasImprovedSinceLaunch / stabilityTrend はレビューの時系列から判断する。  

───────────────────────────────
【SUMMARY とジャンル表現】
───────────────────────────────

- summary では、そのゲームの体験を分かりやすく伝えるために、
  「○○系アクション」「○○系アドベンチャー」「ビジュアルノベル」など、一般的なジャンル名を含めてもよい。

- ただし summary 内で "Roguelike" / "Roguelite" / "Deckbuilder" という語を使ってよいのは、
  そのゲームがローグライク／デッキ構築ゲームとして明確な構造的特徴
  （ランダム生成ダンジョンやステージ、死亡時の最初からのやり直し、
    run ごとのビルド・カード構成・パーク構成、周回による恒久アンロックなど）を複数持ち、
  それが体験の中心になっている場合に限る。

- Visual Novel / Story Rich / Narrative / Social Deduction などのストーリー主導ゲームでは、
  単にループ構造や周回前提の構成があるだけでは、summary に "Roguelike" / "Roguelite" / "Deckbuilder" を書いてはならない。
  その場合は「ループ型SFアドベンチャー」「周回型ビジュアルノベル」など、
  ストーリー中心であることが分かる表現を用いること。

───────────────────────────────
【aiTags / aiPrimaryGenre】
───────────────────────────────

- Steamで一般的に使われる英語タグのみを使用。  
- 文ではなく単語タグとし、類義語・重複は避ける。  
- 5〜10個程度。  
- aiPrimaryGenre は代表ジャンル1つだけ。  

- "Roguelike" / "Roguelite" を aiTags に含めてよいのは、
  レビューやストア説明の中で次の要素が複数回登場し、ゲーム体験の中心になっている場合に限る：
  - ランダム生成のステージやダンジョンがある
  - 死亡時に最初からやり直しになる permadeath の仕組みがある
  - 各 run ごとに異なるビルド・カード構成・パーク構成などを選ぶ
  - 周回を重ねることで恒久的なアンロックやメタ進行がある

- 単に「時間ループ型の物語」や「何周も遊ぶことで情報が増える」だけの
  ビジュアルノネル／Story Rich／Social Deduction タイトルは、
  aiTags に "Roguelike" / "Roguelite" / "Deckbuilder" を含めてはならない。

- featureTagSlugs に含まれる内部スラッグ名（例: "run_based_roguelike", "high_intensity_roguelike" など）を、
  そのまま aiTags として出力してはならない。
  Roguelike 系を表現したい場合は、aiTags では "Roguelike" または "Roguelite" など、
  Steam で一般的なタグ名のみを使うこと。


【タグ生成の優先順位】 

1. 入力 JSON の tags / genres / store 情報に含まれている既存タグを基準にする。 
2. レビューで「何度も」登場する具体的なメカニクスを拾い、 
それに対応する英語タグを必ず 1 つ以上含める。 

【代表的メカニクス → aiTags の対応（例）】 

- クラフト・素材集め・レシピ・アイテムを組み合わせる要素が何度も語られる場合 
  → aiTags に必ず "Crafting" を含める。 
- 建築・家や建物を建てる・拠点づくりが何度も語られる場合 
  → aiTags に "Building" や "Base-Building" を含める。 
- 拠点防衛・タワーディフェンス・波状攻撃を迎え撃つ要素が何度も語られる場合 
  → aiTags に "Tower Defense" や "Base Defense" など、対応する既存タグを含める。 
- 探索・オープンワールド・広い世界・冒険が繰り返し語られる場合 
  → "Open World" や "Exploration" や "Sandbox" など、入力に近い既存タグを含める。 
- ランごとのやり直し・死んでやり直す・毎回構成が変わるといった要素が何度も語られる場合 
  → "Roguelike" または "Roguelite" を含める。 
  
【禁止事項】 

- レビューや入力 JSON にほとんど出てこないメカニクスを、想像だけで aiTags に追加しない。 
- 逆に、クラフト・建築・ローグライクなどが明確に繰り返し語られているのに、 
  対応するタグ（"Crafting" / "Building" / "Roguelike" など）を省略することも禁止。 

● aiPrimaryGenre について 

- aiPrimaryGenre は、そのゲームの代表ジャンル 1 つだけを書く。 
- 例: "Roguelike", "Action", "JRPG", "Deckbuilder", "Adventure" など。 
- 文や複数ジャンルの羅列は禁止。最も代表的な 1 つだけを選ぶ。 
- 明確に判断できない場合は null にしてよい。 

● featureTagSlugs について（VIBE / FeatureLabel 用 内部スラッグ） 

- featureTagSlugs は、VIBE / FeatureLabel 用の **内部専用スラッグ配列** である。 
- featureTagSlugs には、必ず以下の25個のうちからのみスラッグを入れること。 
- それ以外の文字列・タグ・文章を featureTagSlugs に含めてはならない。 

【Chill 系（穏やかな体験・癒やし系）】 
- cozy_life_crafting （のんびり生活・クラフト） 
- gentle_exploration （落ち着いた探索） 
- light_puzzle （比較的ライトなパズル要素） 
- relaxed_building （穏やかな建築・拠点づくり） 
- ambient_experience （雰囲気・環境音・没入重視） 

【Story 系（物語・ドラマ）】 - story_driven （物語主導の構成） 
- character_drama （キャラクター同士のドラマ） 
- mystery_investigation （謎解き・調査・真相究明） 
- emotional_journey （感情を揺さぶる体験） 
- lore_worldbuilding （世界観・設定の作り込み） 

【Focus 系（戦略・思考）】 
- turn_based_tactics （ターン制タクティクス） 
- deckbuilding_strategy （デッキ構築ストラテジー） 
- grand_strategy （国家・大局ストラテジー） 
- automation_factory_strategy（自動化・工場系ストラテジー） 
- colony_management （拠点・コロニー運営） 

【Speed 系（テンション・反応速度）】 
- action_combat （アクション戦闘） 
- precision_shooter （精密エイム系シューター） 
- rhythm_music_action （リズム／音楽アクション） 
- sports_arena （スポーツ・アリーナ系対戦） 
- high_intensity_roguelike （高テンション系ローグライク） 

【Short 系（短時間・周回性）】 
- run_based_roguelike （ラン単位のローグライク） 
- arcade_action （アーケード調アクション） 
- arcade_shooter （アーケード調シューター） 
- short_puzzle （短い単位のパズル） 
- micro_progression （細かな進行・ミクロな積み上げ） 

【featureTagSlugs の厳守ルール】 
- featureTagSlugs には **上記25個以外の文字列を一切含めないこと。** 
- 文や自由記述は禁止。必ずスラッグ文字列のみを使う。 
- 類義語や別表記（例:"Story Rich", "Roguelike", "Souls-like" など）は featureTagSlugs には書かない。 
- そのゲームに本質的に当てはまるスラッグだけを 0〜10 個程度選ぶ。 
- 同じスラッグを重複して入れない（配列内の各要素は一意）。 
- ゲームにまったく当てはまるスラッグがない場合（稀なケース）は、
featureTagSlugs を空配列 [] としてよいが、基本的には何かしら該当するものがないか慎重に検討すること。

================================================================
【CARD TAG LABELS（labels 配列）】
================================================================

SearchResultCard 上部の labels は短いタグピルとして表示される。

- 各 label は日本語 4〜12文字程度。  
- 文は禁止。名詞・体言止めのみ。  
- 「〜が好きな人」「〜する人向け」など文末「人」は禁止。  
- 「、」「。」を含めない。  
- ゲーム固有の体験を示す1トピックのみを書く。

================================================================
【AUDIENCE BADGES（audienceBadges）】
================================================================

audienceBadges は SearchResultCard の小型ピル。

- label は日本語 6〜16文字程度。  
- 文は禁止。説明的にしない。  
- 「〜な人」「〜が好きな人」など人を指す表現は禁止。  
- 1バッジ1テーマとし、audiencePositive / Negative の特徴を短く圧縮する。

───────────────────────────────
【JSON SCHEMA】
───────────────────────────────

{
  "hiddenGemVerdict": "Yes" | "No" | "Unknown",
  "summary": "2〜3文。このゲーム固有の特徴を1つ以上含める客観的説明。",
  "labels": ["日本語ラベル", ...],
  "pros": ["日本語の強み", ...],
  "cons": ["日本語の弱み", ...],
  "riskScore": 1-10,
  "bugRisk": 1-10,
  "refundMentions": 0-10,
  "reviewQualityScore": 1-10,
  "currentStateSummary": string | "" | null,
  "historicalIssuesSummary": string | "" | null,
  "hasImprovedSinceLaunch": true | false | null,
  "stabilityTrend": "Improving" | "Stable" | "Deteriorating" | "Unknown",
   "aiTags": ["Action", "Adventure", "Visual Novel", "RPG", ...] | [],
  "aiPrimaryGenre": "Action" | "Adventure" | "RPG" | "Visual Novel" | "Strategy" | null,
  "audienceBadges": [
    { "id": string, "label": string }
  ],
  "audiencePositive": [
    {
      "id": string,
      "label": string,
      "description": string | "" | null,
      "sub": string | "" | null,
      "fitScore": number | null,
      "reason": string | "" | null,
      "hitReviewParaphrased": string | "" | null,
      "hitReviewOriginal": string | "" | null,
      "missReviewParaphrased": string | "" | null,
      "missReviewOriginal": string | "" | null
    }
  ],

    "audienceNeutral": [
    {
      "id": string,
      "label": string,
      "description": string | "" | null,
      "sub": string | "" | null,
      "fitScore": number | null,
      "reason": string | "" | null,
      "hitReviewParaphrased": string | "" | null,
      "hitReviewOriginal": string | "" | null,
      "missReviewParaphrased": string | "" | null,
      "missReviewOriginal": string | "" | null
    }
  ],

  "audienceNegative": [
    {
      "id": string,
      "label": string | "" | null,
      "description": string | "" | null,
      "sub": string | "" | null,
      "fitScore": number | null,
      "reason": string | "" | null,
      "hitReviewParaphrased": string | "" | null,
      "hitReviewOriginal": string | "" | null,
      "missReviewParaphrased": string | "" | null,
      "missReviewOriginal": string | "" | null
    }
  ]
}

Always respond with raw JSON only.`;

    const userPrompt = `
Game metadata:
- Title: ${gameData.title}
- Tags: ${(gameData.tags ?? []).join(", ")}
- Positive ratio: ${gameData.positiveRatio}
- Total reviews: ${totalReviewCount}
- Price: ${gameData.price}
- Estimated owners: ${gameData.estimatedOwners}
- Average playtime (minutes): ${gameData.averagePlaytime}

Recent review evidence:
${recentReviewsText}

Historical / early review evidence:
${historicalReviewsText}

IMPORTANT:
- When the data clearly shows that the game has changed over time (for example: a very rough or buggy launch that later improved after patches), briefly describe that trajectory directly inside currentStateSummary.
- historicalIssuesSummary is deprecated for the UI and should normally be returned as an empty string. Do not move important information into historicalIssuesSummary; instead, fold notable launch/early issues and their resolution into currentStateSummary.
`.trim();
    const controller = new AbortController();
    try {
      const timeoutMs = 90000; // or 60000
      const timeoutId = setTimeout(() => {
        controller.abort("AI request timeout");
      }, timeoutMs);

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // 好きなモデルに変更可（精度重視なら gpt-4.1、軽量なら gpt-4.1-mini など）
            model: "gpt-4.1-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            // ★ 追加：出力トークンの上限
            // max_tokens: 3000, // 1400〜2000 の範囲でお好みで調整
            response_format: { type: "json_object" }, // ★ 追加（対応モデルであれば有効）
          }),
          signal: controller.signal,
        }
      ).finally(() => {
        clearTimeout(timeoutId);
      });

      if (!response.ok) {
        let errorText = "";
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = "Unable to read error response";
        }
        console.error("AI Gateway error:", {
          status: response.status,
          statusText: response.statusText,
          errorText,
        });

        // Keep explicit 4xx for rate limiting and credits so frontend can react
        if (response.status === 429) {
          return new Response(
            JSON.stringify({
              error: "Rate limit exceeded. Please try again later.",
            }),
            {
              status: 429,
              headers: {
                ...ANALYZE_GAME_CORS_HEADERS,
                "Content-Type": "application/json",
              },
            }
          );
        }

        // For all other error codes (including 500), return a safe fallback
        console.log("Returning fallback analysis due to AI Gateway error");
        const fallback = buildFallbackAnalysis(
          `AI Gateway returned ${response.status}`,
          {
            title: fallbackTitle,
          }
        );
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: {
            ...ANALYZE_GAME_CORS_HEADERS,
            "Content-Type": "application/json",
          },
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.error("No content in AI response:", data);
        const fallback = buildFallbackAnalysis("No content in AI response", {
          title: fallbackTitle,
        });
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: {
            ...ANALYZE_GAME_CORS_HEADERS,
            "Content-Type": "application/json",
          },
        });
      }

      console.log("Raw AI response content:", content);

      // Parse JSON from AI response
      let analysis: HiddenGemAnalysis;
      try {
        // 1) まずは string 化
        let raw =
          typeof content === "string" ? content : JSON.stringify(content);

        // 2) ```json ... ``` で囲まれていたら中身だけ抜き出す
        const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (fenceMatch && fenceMatch[1]) {
          raw = fenceMatch[1];
        }

        // 3) 先頭の { 〜 最後の } だけを抜き出す（前後にゴミがあっても無視）
        const firstBrace = raw.indexOf("{");
        const lastBrace = raw.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          raw = raw.slice(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(raw.trim());
        analysis = normalizeAnalysisPayload(parsed);
        analysis.aiTags = sanitizeAiTagsForStoryHeavy(analysis.aiTags);

        // -----------------------------
        // 復活フラグ / 安定評価フラグ のガード処理
        // -----------------------------
        const now = new Date();
        let daysSinceRelease: number | null = null;

        if (gameData.releaseDate) {
          const release = new Date(gameData.releaseDate);
          if (!Number.isNaN(release.getTime())) {
            const diffMs = now.getTime() - release.getTime();
            daysSinceRelease = diffMs / (1000 * 60 * 60 * 24);
          }
        }

        // early/recent のレビューサンプル数
        const hasEnoughEarly =
          historicalReviews.length >= MIN_EARLY_REVIEW_SAMPLES;
        const hasEnoughRecent =
          recentReviews.length >= MIN_EARLY_REVIEW_SAMPLES;

        // 「復活した」と言い切るために必要な履歴条件
        const hasHistoricalWindow =
          daysSinceRelease !== null &&
          daysSinceRelease >= MIN_DAYS_SINCE_RELEASE_FOR_IMPROVEMENT &&
          hasEnoughEarly &&
          hasEnoughRecent;

        // 「安定した評価」バッジを付与してよい最低条件
        const isTooEarlyForStable =
          daysSinceRelease !== null &&
          daysSinceRelease < MIN_DAYS_SINCE_RELEASE_FOR_STABLE;

        // 条件を満たさない場合は、復活フラグとトレンドを弱める
        if (!hasHistoricalWindow) {
          // 「復活したタイトル」扱いを禁止
          analysis.hasImprovedSinceLaunch = null;

          // 履歴が薄い状態での "Improving" も信用しない
          if (analysis.stabilityTrend === "Improving") {
            analysis.stabilityTrend = "Unknown";
          }
        }

        // リリースから日が浅いタイトルには「安定した評価」を付けない
        if (isTooEarlyForStable && analysis.stabilityTrend === "Stable") {
          analysis.stabilityTrend = "Unknown";
        }
        const scores = computeScores(gameData, analysis);
        analysis.scores = scores;
        analysis.scoreHighlights = pickScoreHighlights(scores);
        const sanitizedAiTags: string[] = Array.isArray(analysis.aiTags)
          ? analysis.aiTags
          : [];
        const sanitizedFeatureTagSlugs: string[] = Array.isArray(
          analysis.featureTagSlugs
        )
          ? analysis.featureTagSlugs
          : [];
        analysis.featureLabels = mapAiTagsToFeatureLabels(
          sanitizedAiTags,
          sanitizedFeatureTagSlugs
        );
      } catch (e) {
        console.error("Failed to parse AI response as JSON:", {
          content,
        });
        const fallback = buildFallbackAnalysis(
          "Invalid JSON response from AI",
          {
            title: fallbackTitle,
          }
        );
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: {
            ...ANALYZE_GAME_CORS_HEADERS,
            "Content-Type": "application/json",
          },
        });
      }

      return new Response(JSON.stringify(analysis), {
        status: 200,
        headers: {
          ...ANALYZE_GAME_CORS_HEADERS,
          "Content-Type": "application/json",
        },
      });
    } catch (aiError: any) {
      // AbortController / ネットワーク / OpenAI 側の予期せぬエラーをここで拾う

      const isTimeout =
        typeof aiError === "string" && aiError === "AI request timeout";

      const message =
        aiError instanceof Error
          ? aiError.message
          : typeof aiError === "string"
          ? aiError
          : "Unknown AI error";

      console.error("AI analysis error:", {
        raw: aiError, // 元の値をそのまま残す（string なら "AI request timeout" が見える）
        message,
        name: aiError instanceof Error ? aiError.name : undefined,
        stack: aiError instanceof Error ? aiError.stack : undefined,
        isTimeout,
      });

      const fallback = buildFallbackAnalysis(message, {
        title: fallbackTitle,
      });

      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: {
          ...ANALYZE_GAME_CORS_HEADERS,
          "Content-Type": "application/json",
        },
      });
    }
  } catch (error) {
    // Only unrecoverable server-side issues should return 500
    console.error("Error in analyze-game:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: {
          ...ANALYZE_GAME_CORS_HEADERS,
          "Content-Type": "application/json",
        },
      }
    );
  }

  // 型システム対策用のフォールバック（ここには通常到達しない）
  return new Response(
    JSON.stringify({ error: "Unhandled request in analyze-game" }),
    {
      status: 500,
      headers: {
        ...ANALYZE_GAME_CORS_HEADERS,
        "Content-Type": "application/json",
      },
    }
  );
});

function normalizeStringArray(input?: any[]): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of input) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function normalizeAudienceBadges(raw: any): AudienceBadge[] {
  if (!Array.isArray(raw)) return [];
  const badges: AudienceBadge[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item) continue;

    let id: string | null = null;
    let label: string | null = null;

    if (typeof item === "string") {
      id = item.trim();
      label = id;
    } else if (typeof item === "object") {
      if (typeof (item as any).id === "string") {
        id = (item as any).id.trim();
      }
      if (typeof (item as any).label === "string") {
        label = (item as any).label.trim();
      }
    }

    if (!id && !label) continue;
    const finalId = id ?? label!;
    if (!finalId || seen.has(finalId)) continue;
    seen.add(finalId);

    badges.push({
      id: finalId,
      label: label ?? finalId,
    });

    // 念のため最大5個まで
    if (badges.length >= 5) break;
  }

  return badges;
}

function normalizeAiTags(raw: any): string[] {
  const arr = Array.isArray(raw) ? raw : [raw];
  const result: string[] = [];

  for (const item of arr) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;

    result.push(trimmed);
  }

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const tag of result) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(tag);
    if (deduped.length >= 10) break;
  }

  return deduped;
}

function isStoryHeavyFromAiTags(
  aiTags: string[] | null | undefined
): boolean {
  if (!aiTags || aiTags.length === 0) return false;

  const normalized = aiTags
    .map((tag) => (typeof tag === "string" ? tag.trim().toLowerCase() : ""))
    .filter((tag) => tag.length > 0);

  if (!normalized.length) return false;

  const strongSignals = [
    "visual novel",
    "story rich",
    "narrative",
    "interactive fiction",
    "choices matter",
    "multiple endings",
    "social deduction",
  ];
  const softSignals = [
    "mystery",
    "investigation",
    "detective",
    "emotional",
    "drama",
  ];

  let score = 0;
  if (
    normalized.some((tag) =>
      strongSignals.some((signal) => tag.includes(signal))
    )
  ) {
    score += 3;
  }
  if (
    normalized.some((tag) =>
      softSignals.some((signal) => tag.includes(signal))
    )
  ) {
    score += 1;
  }

  return score >= 2;
}

function sanitizeAiTagsForStoryHeavy(
  aiTags: string[] | null | undefined
): string[] {
  const source = Array.isArray(aiTags) ? aiTags : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of source) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  if (!normalized.length || !isStoryHeavyFromAiTags(normalized)) {
    return normalized;
  }

  const banned = [
    "roguelike",
    "roguelite",
    "run based roguelike",
    "run-based roguelike",
    "deckbuilder",
    "deck builder",
  ];

  return normalized.filter((tag) => {
    const lower = tag.toLowerCase();
    return !banned.some(
      (blocked) => lower === blocked || lower.includes(blocked)
    );
  });
}

function clampInt(value: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return min;
  }
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

const VALID_VERDICTS = new Set(["Yes", "No", "Unknown"]);
const VALID_TRENDS = new Set([
  "Improving",
  "Stable",
  "Deteriorating",
  "Unknown",
]);

function normalizeOptionalString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeVerdict(value: unknown): "Yes" | "No" | "Unknown" {
  return typeof value === "string" && VALID_VERDICTS.has(value)
    ? (value as "Yes" | "No" | "Unknown")
    : "Unknown";
}

function normalizeTrend(
  value: unknown
): "Improving" | "Stable" | "Deteriorating" | "Unknown" {
  return typeof value === "string" && VALID_TRENDS.has(value)
    ? (value as "Improving" | "Stable" | "Deteriorating" | "Unknown")
    : "Unknown";
}

function normalizeAnalysisPayload(parsed: any): HiddenGemAnalysis {
  const normalized: HiddenGemAnalysis = {
    hiddenGemVerdict: normalizeVerdict(parsed?.hiddenGemVerdict),
    summary: normalizeOptionalString(parsed?.summary),
    labels: normalizeStringArray(parsed?.labels),
    pros: normalizeStringArray(parsed?.pros),
    cons: normalizeStringArray(parsed?.cons),
    riskScore: clampInt(parsed?.riskScore ?? 5, 0, 10),
    bugRisk: clampInt(parsed?.bugRisk ?? 5, 0, 10),
    refundMentions: clampInt(parsed?.refundMentions ?? 0, 0, 20),
    reviewQualityScore: clampInt(parsed?.reviewQualityScore ?? 5, 0, 10),
    currentStateSummary: normalizeOptionalString(parsed?.currentStateSummary),
    historicalIssuesSummary: normalizeOptionalString(
      parsed?.historicalIssuesSummary
    ),
    hasImprovedSinceLaunch:
      typeof parsed?.hasImprovedSinceLaunch === "boolean"
        ? parsed.hasImprovedSinceLaunch
        : null,
    stabilityTrend: normalizeTrend(parsed?.stabilityTrend),
  };

  // statGemScore / aiError をそのまま通しておく
  if (typeof parsed?.statGemScore === "number") {
    (normalized as any).statGemScore = parsed.statGemScore;
  }

  if (typeof parsed?.aiError === "boolean") {
    normalized.aiError = parsed.aiError;
  }

  const audienceBadges = normalizeAudienceBadges(parsed?.audienceBadges);
  if (audienceBadges.length > 0) {
    normalized.audienceBadges = audienceBadges;
  }

  // ★ ここから追加：ポジ・ネガ側のプレイヤー像
  const audiencePositive = normalizeAudienceSegmentList(
    parsed?.audiencePositive
  );
  if (audiencePositive.length > 0) {
    normalized.audiencePositive = audiencePositive;
  }

  const audienceNeutral = normalizeAudienceSegmentList(parsed?.audienceNeutral);
  if (audienceNeutral.length > 0) {
    normalized.audienceNeutral = audienceNeutral;
  }

  const audienceNegative = normalizeAudienceSegmentList(
    parsed?.audienceNegative
  );
  if (audienceNegative.length > 0) {
    normalized.audienceNegative = audienceNegative;
  }

  const aiTags = normalizeAiTags(parsed?.aiTags);
  if (aiTags.length > 0) {
    normalized.aiTags = aiTags;
  }

  if (typeof parsed?.aiPrimaryGenre === "string") {
    const primary = parsed.aiPrimaryGenre.trim();
    if (primary) {
      normalized.aiPrimaryGenre = primary;
    }
  }

  return normalized;
}

function normalizeAudienceSegmentList(value: unknown): AudienceSegment[] {
  if (!Array.isArray(value)) return [];

  const result: AudienceSegment[] = [];

  for (const item of value) {
    if (!item) continue;

    // 文字列だけ渡ってきた場合は label として扱う
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) continue;

      result.push({
        id: trimmed.toLowerCase().replace(/\s+/g, "_").slice(0, 48),
        label: trimmed,
      });
      continue;
    }

    if (typeof item === "object") {
      const obj = item as any;

      const labelRaw =
        typeof obj.label === "string" && obj.label.trim()
          ? obj.label.trim()
          : typeof obj.id === "string" && obj.id.trim()
          ? obj.id.trim()
          : "";
      if (!labelRaw) continue;

      const idRaw =
        typeof obj.id === "string" && obj.id.trim()
          ? obj.id.trim()
          : labelRaw.toLowerCase().replace(/\s+/g, "_").slice(0, 48);

      const descriptionRaw =
        typeof obj.description === "string" && obj.description.trim()
          ? obj.description.trim()
          : "";

      const subRaw =
        typeof obj.sub === "string" && obj.sub.trim() ? obj.sub.trim() : "";

      const fitScoreRaw =
        typeof obj.fitScore === "number" && Number.isFinite(obj.fitScore)
          ? obj.fitScore
          : undefined;

      const reasonRaw =
        typeof obj.reason === "string" && obj.reason.trim()
          ? obj.reason.trim()
          : "";

      const hitReviewOriginalRaw =
        typeof obj.hitReviewOriginal === "string" &&
        obj.hitReviewOriginal.trim()
          ? obj.hitReviewOriginal.trim()
          : "";

      const hitReviewParaphrasedRaw =
        typeof obj.hitReviewParaphrased === "string" &&
        obj.hitReviewParaphrased.trim()
          ? obj.hitReviewParaphrased.trim()
          : "";

      const missReviewOriginalRaw =
        typeof obj.missReviewOriginal === "string" &&
        obj.missReviewOriginal.trim()
          ? obj.missReviewOriginal.trim()
          : "";

      const missReviewParaphrasedRaw =
        typeof obj.missReviewParaphrased === "string" &&
        obj.missReviewParaphrased.trim()
          ? obj.missReviewParaphrased.trim()
          : "";

      const segment: AudienceSegment = {
        id: idRaw,
        label: labelRaw,
      };

      if (descriptionRaw) segment.description = descriptionRaw;
      if (subRaw) segment.sub = subRaw;
      if (fitScoreRaw !== undefined) segment.fitScore = fitScoreRaw;
      if (reasonRaw) segment.reason = reasonRaw;
      if (hitReviewOriginalRaw)
        segment.hitReviewOriginal = hitReviewOriginalRaw;
      if (hitReviewParaphrasedRaw)
        segment.hitReviewParaphrased = hitReviewParaphrasedRaw;
      if (missReviewOriginalRaw)
        segment.missReviewOriginal = missReviewOriginalRaw;
      if (missReviewParaphrasedRaw)
        segment.missReviewParaphrased = missReviewParaphrasedRaw;

      result.push(segment);
    }
  }

  return result;
}

function clamp01(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * GameData + Analysis から Hidden / Quality / Comeback / Niche / Innovation をざっくり算出する。
 * すべて 0.0〜1.0 に正規化して返す。
 */
function computeScores(
  game: GameData,
  analysis: HiddenGemAnalysis
): HiddenGemScores {
  const totalReviews =
    typeof game.totalReviews === "number" ? game.totalReviews : 0;
  const positiveRatio =
    typeof game.positiveRatio === "number" ? game.positiveRatio : 0;

  // 60〜100% のポジ率を 0〜1 にマッピング（60% 未満は 0 付近）
  const normPositive = clamp01((positiveRatio - 0.6) / 0.4);

  // レビュー数が少ないほど「隠れている」とみなす簡易指標。
  // 100 件あたりを 1.0 近辺、10 万件あたりで 0 に近づくイメージ。
  const logReviews = Math.log10(Math.max(totalReviews, 1)); // 1〜10^5+ → 0〜5+
  const hiddenByReviews = clamp01(1 - logReviews / 5); // 10^5 レビューでほぼ 0

  // Hidden: 「レビュー数が少ない」＋「評価が高い」ほど高くなる
  const hidden = clamp01(hiddenByReviews * 0.7 + normPositive * 0.3);

  // Quality: AI が付けた reviewQualityScore と positiveRatio の平均
  const qualityFromAI =
    typeof analysis.reviewQualityScore === "number"
      ? analysis.reviewQualityScore / 10
      : 0.5;
  const quality = clamp01(qualityFromAI * 0.7 + normPositive * 0.3);

  // Comeback: hasImprovedSinceLaunch + stabilityTrend から算出
  let comeback = 0;
  if (analysis.hasImprovedSinceLaunch === true) {
    if (analysis.stabilityTrend === "Improving") {
      comeback = 1.0;
    } else if (analysis.stabilityTrend === "Stable") {
      comeback = 0.8;
    } else {
      comeback = 0.6;
    }
  } else if (
    analysis.hasImprovedSinceLaunch === null &&
    analysis.stabilityTrend === "Improving"
  ) {
    // 明確な「復活」ではないが、改善傾向はありそうなケース
    comeback = 0.4;
  }
  comeback = clamp01(comeback);

  // Niche: audienceBadges の数と偏りからざっくり計算
  let niche = 0;
  if (
    Array.isArray(analysis.audienceBadges) &&
    analysis.audienceBadges.length > 0
  ) {
    // バッジが付いている時点で「ある程度、人を選ぶタイトル」とみなす
    niche = 0.4 + Math.min(analysis.audienceBadges.length - 1, 3) * 0.1; // 最大 0.7
  }

  niche = clamp01(niche);

  // Innovation: ひとまず保留気味に 0〜0.7 の間で軽く振る。
  // （将来的に「独自性の強さ」を AI から直接受けるなら差し替え）
  let innovation = 0;
  if (Array.isArray(analysis.labels) && analysis.labels.length >= 3) {
    innovation = 0.3;
  }
  if (
    Array.isArray(analysis.labels) &&
    analysis.labels.some(
      (label) =>
        typeof label === "string" &&
        (label.includes("独自") ||
          label.includes("実験") ||
          label.includes("ユニーク") ||
          label.includes("変わった"))
    )
  ) {
    innovation = 0.6;
  }
  innovation = clamp01(innovation);

  return {
    hidden,
    quality,
    comeback,
    niche,
    innovation,
  };
}

/**
 * サーバー側で出せるスコアの中から、そのゲームにとって特徴的な軸を 3 つまで選ぶ。
 * （moodFit はクライアント側で計算するのでここには含めない）
 */
function pickScoreHighlights(scores: HiddenGemScores): string[] {
  const entries: { key: keyof HiddenGemScores; value: number }[] = [
    { key: "hidden", value: scores.hidden },
    { key: "quality", value: scores.quality },
    { key: "comeback", value: scores.comeback },
    { key: "niche", value: scores.niche },
    { key: "innovation", value: scores.innovation },
  ];

  return entries
    .filter((e) => e.value > 0.15) // ほぼ 0 の軸は除外
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((e) => e.key);
}
