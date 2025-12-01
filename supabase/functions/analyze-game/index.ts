// Supabase Edge Functions 用の型定義。
// ローカルの TypeScript では解決できずエラーになるためコメントアウト。
// /// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

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
  sub?: string;
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
   * 「現在の状態」に関する分析の信頼度。
   * early/recent どちらにも十分なレビューがある場合は "high"。
   */
  currentStateReliability?: "high" | "medium" | "low" | null;

  /**
   * 「過去の問題」に関する分析の信頼度。
   */
  historicalIssuesReliability?: "high" | "medium" | "low" | null;

  /**
   * 気分スライダー用の3軸ベクトル。
   * 0.0〜1.0 の数値を期待するが、欠損時は null / 未定義も許可。
   */
  vibes?: VibeVector | null;

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
  aiError?: boolean;
}

interface VibeVector {
  /** 0.0〜1.0 静的〜アクション寄り */
  active: number;
  /** 0.0〜1.0 癒し〜緊張・挑戦 */
  stress: number;
  /** 0.0〜1.0 短時間〜長時間 */
  volume: number;
}

interface AudienceBadge {
  id: string; // 例: "story_focus"
  label: string; // 日本語ラベル。UIにそのまま出す想定
}

// Limits to keep review input safely within token constraints
const MAX_REVIEWS = 15;
const MAX_REVIEW_CHARS = 450;
const MAX_TOTAL_REVIEW_CHARS = 9000;

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
    currentStateReliability?: "high" | "medium" | "low";
    historicalIssuesReliability?: "high" | "medium" | "low";
  }
): HiddenGemAnalysis {
  const title = opts?.title ?? "this game";
  const currentRel = opts?.currentStateReliability ?? null;
  const historicalRel = opts?.historicalIssuesReliability ?? null;

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
    currentStateReliability: currentRel,
    historicalIssuesReliability: historicalRel,

    // ★ 追加
    vibes: {
      active: 0.5,
      stress: 0.5,
      volume: 0.5,
    },
    audienceBadges: [],

    aiError: true,
  };
}

const RECENT_REVIEW_LIMIT = 40;
const HISTORICAL_REVIEW_LIMIT = 40;

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

1. **プレイヤー像（audiencePositive / audienceNegative）は、このゲーム“固有の特徴”に基づいて記述すること。**
   - ジャンル名の言い換え（例: デッキ構築好き、ローグライク好き）は禁止。
   - 「このゲームだから刺さる／刺さらない」という体験ベースの像を作る。
   - レビュー本文から固有の特徴（features）を抽出し、それに基づいてプレイヤー像を構築する。

2. **レビュー本文から繰り返し語られる“具体的キーワード”を必ず利用する。**
   - 例：テンポ、配置読み、攻撃パターン、爆発力、視界管理、学習曲線、リソース負荷、UI構造、安定性、更新パッチなど。

3. **プレイヤー像は“体験の好み”で記述する。**
   - 例：ピーク瞬間の爆発感を求める人、リスク管理の緊張感を好む人、探索テンポの緩急を楽しむ人など。

4. **同ジャンルの代表作との差分を反映する。**
   - Slay the Spire、Monster Train 等と比較し、どこが特に評価／批判されているかを反映する。

5. **抽象表現・一般論を禁止する。**
   - NG例：コアゲーマー向け、人を選ぶ、戦略好き。
   - 必ず「このゲームならではの挙動・感情・負荷」に言及する。

6. **pros / cons はゲームが主語。**
   - ゲームシステム、テンポ、UI、安定性、難易度、更新状況など客観的要素のみを書く。
   - プレイヤー像は pros/cons に書かない。

7. **audiencePositive / audienceNegative の reason は pros/cons + features を受けて作る。**
   - その特徴を好む人／つらく感じる人に変換する。
   - 主語はプレイヤー（〜な人）にする。

───────────────────────────────
【FEATURE EXTRACTION（STRICT）】
───────────────────────────────

レビュー本文から “ゲーム固有の特徴（features）” を内部的に抽出し、  
audience と representative reviews の根拠として必ず利用する。

抽出する内部構造（JSONとして出力しない）：

- feature_label: 短い特徴名（※必ず自然な日本語で書くこと）
- description: その特徴を説明する1文
- sentiment: "positive" | "mixed" | "negative"
- support_count: その特徴に触れているレビューの概算件数
- is_generic: true（他ゲームでもあり得る一般的特徴） / false（固有特徴）

● 以下は is_generic = true として扱う（優先度低）：
  - BGMが良い、グラフィックがきれい、操作性が良い等の一般的褒め言葉  
  → audience・代表レビューの根拠としては使わない。

● audience と代表レビューは is_generic=false の特徴を最優先する。

───────────────────────────────
【FEATURE LABEL LANGUAGE POLICY】
───────────────────────────────

feature_label および feature の説明文・reason 内で登場する名称は、  
**必ず自然な日本語に翻訳した形で表現すること。**

- 元レビューやゲーム内で英語の語が使われていても、そのまま使用してはならない。
- CamelCase 名・内部コード名・開発側のテクニカル名称をそのまま使うことは禁止。
- 例：uniquePuzzleMechanics → 「独特な投擲ギミック」  
       deepExploration → 「奥深い探索要素」  
       unclearLevelSystem → 「分かりづらい成長システム」

- feature_label は **日本語話者が直感的に理解できる呼び名** に必ず置き換える。
- 文中の主語・用語・ラベルはすべて “一般の日本人プレイヤーが理解できる自然な日本語” として再構成する。
- 元レビューの言語構造・語順・綴りを参照しない。  
  完全に日本語として自然な説明文を新しく書き起こすこと。

※ 英語で始まる feature_label や技術名らしき名称が理由文に残ることは絶対に許可しない。

───────────────────────────────
【REASON STRUCTURE（STRICT）】
───────────────────────────────

audiencePositive / audienceNegative の reason は必ず **3文構成** にする：

1. feature_label を明示し、その特徴がどのように現れるかを説明する  
2. その特徴によって生じるプレイ体験・挙動・感覚を述べる  
3. その体験を好む／つらく感じるプレイヤー像を具体的に記述する

例（Positive）：
- 「序盤の読み合いが強いテンポ設計が特徴で、行動を先読みする面白さがある。  
　この駆け引きが常に続くため、考えて動くタイプのプレイヤーには特に合う。」

例（Negative）：
- 「UI階層が深く目的の項目に辿り着くのに時間がかかる構造になっている。  
　テンポよく遊びたいプレイヤーには負荷が大きく、ストレスになりやすい。」

● 説明文（description / reason）は、専門的すぎず、硬くなりすぎない自然な日本語で記述すること。
   - 情報の精度は保ちつつ、読み手が負担を感じない柔らかい語感を使う。
   - 「自然と〜が進む」「少しずつ整っていく」「〜しやすい」など穏やかな表現を積極的に使う。
   - 説明が事務的・機械的にならないようにする。

● reason（刺さった理由 / 刺さらなかった理由）は、柔らかい文体で以下の3文構成を維持する：
   1. 特徴（feature）がどう現れるかを自然な文で説明する  
   2. その特徴が生む体験・感覚を柔らかい語調で描写する  
   3. その体験がどんなプレイヤーに合うかを自然に言い切る

● 文体の方向性：
   - 「〜である。」は禁止  
   - 「〜できる。」「〜しやすい」「〜が心地よい」など自然な語感を優先  
   - 過度にカジュアルにしない（常体で統一）  
   - 硬い技術書のような文章は避ける

───────────────────────────────
【PREFERENCE ABSTRACTION RULE（STRICT）】
───────────────────────────────

レビューに登場する具体的なギミック・行動・操作を  
そのまま「プレイヤーの嗜好」として書いてはならない。

● 禁止例  
- 光の当て方を考えるのが好きな人  
- 投擲ギミックを使うのが好きな人  
- この魔法の仕組みが好きな人  
（※これらは実在しない嗜好のため禁止）

● 必須ルール  
具体的メカニクスは、必ず **より上位の抽象的な嗜好カテゴリ** に変換する。

例：  
- 「光を当てて仕掛けを動かすギミック」  
　→ 抽象化：「環境を利用して解くタイプのパズルが好きな人」  
- 「投擲で仕掛けが連動する構造」  
　→ 抽象化：「発想の転換で道を切り開く謎解きが好きな人」  
- 「魔法の組み合わせで解く仕掛け」  
　→ 抽象化：「複数要素を組み合わせて解法を探すのが楽しい人」

● プレイヤー像（audiencePositive / audienceNegative）は  
“システムそのもの” ではなく **体験の本質（嗜好カテゴリ）** に基づいて記述すること。

───────────────────────────────
【FEATURE–AUDIENCE LAYER SEPARATION RULE（STRICT）】
───────────────────────────────

“feature（ゲーム側の特徴）” と  
“audience（プレイヤー側の嗜好）” を混同してはならない。

● feature はゲーム内の具体的ギミック・挙動・メカニクスをそのまま描写してよい。
  例：光源を投げて仕掛けを起動するギミックがある、環境と連動する装置が多い。

● audience（label / description / reason）は、feature をそのまま用いてはならず、
  必ず **プレイヤーの本質的嗜好カテゴリに抽象化した表現** に変換する。

  - feature（具体）  
      光源を使って装置を起動する仕組みがある  
      投擲でトリガーを作動させる

  - audience（抽象）  
      発想の転換で解くタイプの謎解きが好きな人  
      環境を読み解くパズルが好きな人  
      手順を組み立てる思考型の進行が好きな人

● audience に具体的メカニクス（光の当て方、投擲ギミック等）を直接書くことは禁止。
● audience は “そのギミックによって生まれる体験の型” のみを書く。

これにより：

- feature → 具体的ゲーム説明  
- audience → 嗜好の抽象カテゴリ

が明確に分離される。


───────────────────────────────
【LABEL ABSTRACTION RULE（STRICT）】
───────────────────────────────

audiencePositive / audienceNegative の "label"（タイトル）は、  
レビューに登場する具体的なギミック名・操作名・行動名を  
そのまま書くことを禁止する。

● 禁止例  
- 光源を駆使した謎解きを楽しむ人  
- 投擲ギミックを楽しむ人  
- 〇〇ギミックを活用するのが好きな人  
（※これらはプレイヤーの実在する嗜好ではないため禁止）

● 必須ルール  
label は、本文（description / reason）で扱われた特徴を  
**プレイヤーの本質的嗜好に抽象化した短い日本語** にすること。

例：  
- 「光を当てて仕掛けを動かすギミック」  
　→ label：「環境を使って解くパズルが好きな人」  
- 「投げた光で装置を作動させる仕組み」  
　→ label：「発想の転換で進む謎解きが好きな人」  
- 「魔法を組み合わせて道を作るギミック」  
　→ label：「仕組みを理解して攻略するタイプの人」

● label では、ギミック名称・内部コード・具体操作は  
一切使ってはならず、必ず抽象嗜好カテゴリで表現する。


───────────────────────────────
【PLAYER MATCH PRIORITY POLICY】
───────────────────────────────

本アプリは「刺さるゲームを見つける」ことを主目的とするため、
audiencePositive（刺さる理由）を最も重視する。
audienceNegative（刺さらなかった理由）は補助的情報として扱い、
否定のためではなく “相性のミスマッチを避けるための注意点” として簡潔かつ価値のある内容のみ抽出する。

───────────────────────────────
【A. 出力件数】
───────────────────────────────

- audiencePositive：**4〜5件**
  - 質が担保できる場合は最大5件まで出してよい。
  - 無理に水増しせず、ゲーム固有の特徴に基づく高品質なプレイヤー像のみ生成する。

- audienceNegative：**2〜4件**
  - 無理に欠点を捻出する必要はない。
  - 顕著な欠点はもちろん、プレイヤーが実際に言及している“価値のある細かな不満”も拾ってよい。
  - ただし以下のような不満は除外する：
      ● 抽象的・一般的な不満（例：つまらない、人を選ぶ）
      ● ゲーム外の不満（例：価格が高い、期待と違う）
      ● 個人環境依存が強い不満
  - 拾うべき不満は以下を優先する：
      ● 明確に複数レビューで繰り返されているポイント
      ● ゲームのコア体験に影響する具体的欠点
      ● 軽微でもプレイの流れや快適さに影響する不満
      ● 特定のプレイヤータイプに特有の“つまずきポイント”
  - 質が担保できない場合は無理に4件埋めず、2〜3件でよい。


───────────────────────────────
【代表レビュー（hit/miss）— 一人称ルール（STRICT）】
───────────────────────────────

代表レビューは **レビュワー本人が書いたような“一人称・主観”**で記述する。

● 文体ルール（必須）
- 「〜だと感じた」「〜で困った」「〜が気に入った」「〜に驚いた」など主観文  
- 第三者視点の説明禁止  
  - NG：高評価が多い／意見が分かれている／レビューでは〜と言われる  
- 引用符禁止（「」 “”）  
- 原文コピペ禁止  
- 必ず日本語で自然な文章に再構成する  
- 1〜2文で簡潔に  
- feature_label と内容が整合すること（特に重要）

● 出力ルール
- audiencePositive → hitReviewOriginal + hitReviewParaphrased の2件を埋める（miss系は空）  
- audienceNegative → missReviewOriginal + missReviewParaphrased の2件を埋める（hit系は空）  
- 2件は必ず別内容にする（重複禁止）
- hitReviewOriginal / missReviewOriginal は、レビュワー本人が書いたような自然な日本語の一人称文にする。
- hitReviewParaphrased / missReviewParaphrased も **必ず日本語のみで**記述する。
  - Paraphrased は「内容を変えた日本語の別表現」であり、翻訳元の言語に寄せてはいけない。
  - Original と Paraphrased はどちらも日本語で、トーンは自然で柔らかく、表現だけ変えること。
- 2つのレビューは必ず別内容にし、同義文の言い換えだけで済ませない。
- いずれのレビューも引用符禁止、ユーザー名禁止、原文コピペ禁止。
※ hitReviewParaphrased / missReviewParaphrased は、元レビューの言語に影響されない。
   「日本語として自然な一人称の要約文」を新しく書き起こすこと。


   ───────────────────────────────
【NEGATIVE CARD REVIEW REQUIREMENT（更新版）】
───────────────────────────────

audienceNegative が1件以上出力される場合、  
各ネガティブカードには **最低1件の missReviewOriginal を必ず付与すること。**

- 代表レビューが0件の状態は絶対に許可しない。
- missReviewParaphrased と合わせて2件生成できる場合は、2件を必ず埋める。
- レビュー量が不足しており、2件分の根拠を捻出できない場合のみ、
  missReviewOriginal（1件）＋ missReviewParaphrased（空 or null）を許可する。
- 1件しか出力しない場合も、その1件は必ず実際の不満・つまずきに基づき、
  自然な日本語の一人称表現で書くこと。
- 2件生成する場合は必ず別内容にし、重複は不可。
───────────────────────────────
【Current State / Historical Issues】
───────────────────────────────

- 最近のレビュー傾向を最重要視して currentStateSummary を作成  
- 過去の問題点は historicalIssuesSummary に分離  
- hasImprovedSinceLaunch / stabilityTrend はレビューの時系列から判断  
- currentStateReliability / historicalIssuesReliability を適切に判定

───────────────────────────────
【aiTags / aiPrimaryGenre】
───────────────────────────────

- Steamで一般的に使われる **英語タグのみ**  
- 文禁止（例："fast-paced roguelike" → NG）  
- 類義語・重複禁止  
- 5〜10個程度  
- aiPrimaryGenre は1つだけ（代表ジャンル）

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
  "currentStateReliability": "high" | "medium" | "low" | null,
  "historicalIssuesReliability": "high" | "medium" | "low" | null,
  "aiTags": ["Roguelike", "Souls-like", "Deckbuilder", ...] | [],
  "aiPrimaryGenre": "Roguelike" | null,
  "vibes": {
    "active": number,
    "stress": number,
    "volume": number
  },
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
      const timeoutMs = 60000; // or 60000
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
        const jsonMatch =
          typeof content === "string"
            ? content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
            : null;
        const jsonStr =
          jsonMatch && jsonMatch[1]
            ? jsonMatch[1]
            : typeof content === "string"
            ? content
            : JSON.stringify(content);

        const parsed = JSON.parse(jsonStr.trim());
        analysis = normalizeAnalysisPayload(parsed);

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

function normalizeVibes(raw: any): VibeVector | null {
  if (!raw || typeof raw !== "object") return null;

  const toNumber = (v: any): number | null => {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const clamp01 = (v: number): number => {
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  };

  const active = toNumber((raw as any).active);
  const stress = toNumber((raw as any).stress);
  const volume = toNumber((raw as any).volume);

  // 3つとも無い場合は「そもそも未設定」
  if (active === null && stress === null && volume === null) {
    return null;
  }

  return {
    active: active !== null ? clamp01(active) : 0.5,
    stress: stress !== null ? clamp01(stress) : 0.5,
    volume: volume !== null ? clamp01(volume) : 0.5,
  };
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

    // 大文字小文字をそのまま残しつつ、重複チェック用に lower を使う
    result.push(trimmed);
  }

  // 重複除去 & 10件まで
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
const VALID_RELIABILITIES = new Set(["high", "medium", "low"]);

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

function normalizeReliability(
  value: unknown
): "high" | "medium" | "low" | null {
  return typeof value === "string" && VALID_RELIABILITIES.has(value)
    ? (value as "high" | "medium" | "low")
    : null;
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
    currentStateReliability: normalizeReliability(
      parsed?.currentStateReliability
    ),
    historicalIssuesReliability: normalizeReliability(
      parsed?.historicalIssuesReliability
    ),
  };

  // statGemScore / aiError をそのまま通しておく
  if (typeof parsed?.statGemScore === "number") {
    (normalized as any).statGemScore = parsed.statGemScore;
  }

  if (typeof parsed?.aiError === "boolean") {
    normalized.aiError = parsed.aiError;
  }

  // ★ 追加: vibes / audienceBadges を正規化して取り込む
  const vibes = normalizeVibes(parsed?.vibes);
  if (vibes) {
    normalized.vibes = vibes;
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

  const audienceNegative = normalizeAudienceSegmentList(
    parsed?.audienceNegative
  );
  if (audienceNegative.length > 0) {
    normalized.audienceNegative = audienceNegative;
  }

  // ★ ここから aiTags / aiPrimaryGenre
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

  // Niche: audienceBadges や vibes の「とがり具合」からざっくり計算
  let niche = 0;
  if (
    Array.isArray(analysis.audienceBadges) &&
    analysis.audienceBadges.length > 0
  ) {
    // バッジが付いている時点で「ある程度、人を選ぶタイトル」とみなす
    niche = 0.4 + Math.min(analysis.audienceBadges.length - 1, 3) * 0.1; // 最大 0.7
  }

  if (analysis.vibes) {
    const v = analysis.vibes;
    const vals = [v.active, v.stress, v.volume];
    const avg = vals.reduce((s, x) => s + x, 0) / vals.length;
    const sqAvg = vals.reduce((s, x) => s + x * x, 0) / vals.length;
    const variance = Math.max(sqAvg - avg * avg, 0);
    const stddev = Math.sqrt(variance);
    // 振れ幅が大きいほど「尖っている」とみなす（最大 1.0）
    const extremeness = clamp01(stddev * 2);
    niche = Math.max(niche, extremeness);
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
