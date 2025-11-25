// src/pages/Index.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./landing.css";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

/* ====== ここから: 2つ目のファイルから流用した型 & ロジック ====== */

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
  statGemScore?: number;
  aiError?: boolean;
}

type GemLabel =
  | "Hidden Gem"
  | "Improved Hidden Gem"
  | "Emerging Gem"
  | "Highly rated but not hidden"
  | "Not a hidden gem";

interface RankingGame {
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
  analysis: HiddenGemAnalysis;
  gemLabel: GemLabel;
  isStatisticallyHidden: boolean;
  releaseYear?: number;
  releaseDate?: string;
  screenshots?: {
    full?: string;
    thumbnail?: string;
  }[];
  headerImage?: string | null;
}

/** Hidden Gem 判定ロジック（2つ目のファイルからコピー） */
const isHiddenGemCandidate = (game: RankingGame) => {
  const statScore =
    typeof game.analysis?.statGemScore === "number"
      ? game.analysis.statGemScore
      : null;

  const verdictYes = game.analysis?.hiddenGemVerdict === "Yes";
  const labeledHidden =
    game.gemLabel === "Hidden Gem" ||
    game.gemLabel === "Improved Hidden Gem";
  const statisticallyHidden = game.isStatisticallyHidden === true;

  return (
    statisticallyHidden ||
    labeledHidden ||
    verdictYes ||
    (statScore !== null && statScore >= 8)
  );
};

/** カードに載せるタグ（AIラベル優先） */
const getDisplayTags = (
  game: { analysis?: { labels?: string[] }; tags?: string[] },
  limit?: number,
): string[] => {
  const baseTags =
    (game.analysis?.labels && game.analysis.labels.length > 0
      ? game.analysis.labels
      : game.tags ?? []) || [];

  if (!limit || baseTags.length <= limit) return baseTags;
  return baseTags.slice(0, limit);
};

// 気分スライダーの定義

// メイン3本（既存）
const BASE_VIBE_SLIDERS = [
  {
    id: "Story Weight",
    mainLabel: "Passive ←→ Action",
    leftLabel: "ゆったり",
    rightLabel: "アクション",
  },
  {
    id: "Volume",
    mainLabel: "Short ←→ Long",
    leftLabel: "短め",
    rightLabel: "長め",
  },
  {
    id: "Stress Level",
    mainLabel: "Cozy ←→ Intense",
    leftLabel: "リラックス",
    rightLabel: "緊張・挑戦",
  },
] as const;

// Advanced Filters 用の2本
const ADVANCED_VIBE_SLIDERS = [
  {
    id: "Story Density",
    mainLabel: "Story-Light ←→ Story-Heavy",
    leftLabel: "プレイ重視",
    rightLabel: "ナラティブ",
  },
  {
    id: "Brain Load",
    mainLabel: "Brain-Light ←→ Brain-Heavy",
    leftLabel: "直感プレイ",
    rightLabel: "頭を使う",
  },
] as const;

// 型用に全部まとめた配列
const VIBE_SLIDERS = [
  ...BASE_VIBE_SLIDERS,
  ...ADVANCED_VIBE_SLIDERS,
] as const;

const VIBE_MAX = 4; // 0〜4 の 5 段階

type VibeId = (typeof VIBE_SLIDERS)[number]["id"];
type VibeState = Record<VibeId, number>;


const Index: React.FC = () => {
  const navigate = useNavigate();

  const [vibes, setVibes] = useState<VibeState>(() => {
    const initial: Partial<VibeState> = {};
    VIBE_SLIDERS.forEach((v) => {
      // 0〜4 の真ん中（2）からスタート
      initial[v.id] = Math.round(VIBE_MAX / 2);
    });
    return initial as VibeState;
  });

  // Advanced Filters の開閉
  const [showAdvancedVibes, setShowAdvancedVibes] = useState(false);


  // 「今週の隠れた名作 TOP 6」に表示するゲーム
  const [weeklyGems, setWeeklyGems] = useState<RankingGame[]>([]);
  const [loadingWeekly, setLoadingWeekly] = useState(false);

  useEffect(() => {
    fetchWeeklyGems();
  }, []);

  /**
   * search-games から Hidden Gem 候補を取り、スコア上位からランダム 6 本を選ぶ
   * 優先順: 直近 7 日 → 直近 30 日 → 全期間
   */
  const fetchWeeklyGems = async () => {
    setLoadingWeekly(true);

    try {
      const fetchForPeriod = async (recentDays: string | null) => {
        const { data, error } = await supabase.functions.invoke(
          "search-games",
          {
            body: {
              genre: "",
              recentDays: recentDays ?? "",
              sort: "recommended", // Gem Score ソート
              minReviews: 0,
              minPlaytime: 0,
            },
          },
        );

        if (error) {
          console.error("Error fetching games for period", recentDays, error);
          return { hidden: [] as RankingGame[], all: [] as RankingGame[] };
        }

        const list = (data as RankingGame[]) || [];
        const hidden = list.filter(isHiddenGemCandidate);
        return { hidden, all: list };
      };

      let results: RankingGame[] = [];
      let fallback: RankingGame[] = [];

      // ① 直近 7 日
      let { hidden, all } = await fetchForPeriod("7");
      if (hidden.length > 0) results = hidden;
      if (all.length > 0) fallback = all;

      // ② 7 日で 0 件 → 30 日
      if (results.length === 0) {
        ({ hidden, all } = await fetchForPeriod("30"));
        if (hidden.length > 0) {
          results = hidden;
        } else if (all.length > 0 && fallback.length === 0) {
          fallback = all;
        }
      }

      // ③ 30 日でも 0 件 → 全期間
      if (results.length === 0) {
        ({ hidden, all } = await fetchForPeriod(null));
        if (hidden.length > 0) {
          results = hidden;
        } else if (all.length > 0) {
          fallback = all;
        }
      }

      if (results.length === 0 && fallback.length > 0) {
        // Hidden Gem が一切ない場合は「高評価ゲーム」から選ぶ
        results = fallback;
      }

      // Gem Score ソート済みの上位 24 本を「上位プール」として扱う
      const topPool = results.slice(0, 24);

      if (topPool.length === 0) {
        setWeeklyGems([]);
        toast.info("Hidden Gem候補が見つかりませんでした。");
        return;
      }

      // 上位プールをシャッフルして、先頭 6 本を今週の TOP6 とする
      const shuffled = [...topPool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      setWeeklyGems(shuffled.slice(0, 6));
    } catch (error) {
      console.error("Exception while fetching weekly gems:", error);
      toast.error("今週のHidden Gemsの取得に失敗しました。");
    } finally {
      setLoadingWeekly(false);
    }
  };

  return (
    <div className="page">
      {/* Header */}
      <header>
        <div className="container">
          <nav className="nav">
            <div className="logo">
              <div className="logo-badge">G</div>
              <span>Hidden Gems</span>
            </div>
            <div className="nav-links">
              <a href="#features">Features</a>
              <a href="#gems">Gems</a>
              <a href="#reviews">Voices</a>
              <a href="#faq">FAQ</a>
              <button
                type="button"
                className="nav-cta"
                onClick={() => navigate("/search")}
              >
                Appを試す
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="hero">
          <div className="hero-bg-orbit" />
          <div className="container hero-inner">
            <div>
              <div className="badge-top">
                <div className="badge-dot" />
                <span>FOR STEAM PLAYERS / 隠れた名作ハンター向け</span>
              </div>
              <h1 className="hero-title">
                Find Your Next <span className="highlight">Steam Gem</span>.
              </h1>
              <p className="hero-sub">
                無限に流れてくるセール情報とレビューの海。<br />
                <strong>「本当に自分に刺さる」隠れた神ゲー</strong>
                だけを、AIがSteamレビューからピックアップします。
              </p>
              <div className="hero-cta-row">
                <button
                  type="button"
                  className="btn-main"
                  onClick={() => navigate("/search")}
                >
                  今すぐ隠れた名作を探す
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => navigate("/rankings?mode=today-hidden")}
                >
                  <span className="icon">▶</span>
                  60秒で分かるアプリ紹介
                </button>
              </div>
              <p className="hero-small-note">
                Steamログイン不要の
                <span>お試しモード</span> から使えます。
              </p>
            </div>

            <div className="hero-visual">
              <div className="pad-shell">
                <div className="pad-top-row">
                  <div className="pad-chip" />
                  <div className="pad-pill">
                    <div className="pad-pill-dot" />
                    <span>AI Gem Detector</span>
                  </div>
                </div>
                <div className="pad-screen">
                  <div className="pad-game-tile">
                    <div className="pad-game-title">Pixel Haunt</div>
                    <div className="pad-game-tag">Story / Atmosphere</div>
                    <div className="pad-game-score">★ 9.1</div>
                  </div>
                  <div className="pad-game-tile">
                    <div className="pad-game-title">Neon Courier</div>
                    <div className="pad-game-tag">Action / Roguelite</div>
                    <div className="pad-game-score">★ 8.7</div>
                  </div>
                  <div className="pad-game-tile">
                    <div className="pad-game-title">Quiet Nights</div>
                    <div className="pad-game-tag">Chill / Relax</div>
                    <div className="pad-game-score">★ 9.4</div>
                  </div>
                  <div className="pad-game-tile">
                    <div className="pad-game-title">Deck & Dice</div>
                    <div className="pad-game-tag">Deckbuilder</div>
                    <div className="pad-game-score">★ 8.9</div>
                  </div>
                  <div className="pad-game-tile">
                    <div className="pad-game-title">Sky Threads</div>
                    <div className="pad-game-tag">Adventure</div>
                    <div className="pad-game-score">★ 9.0</div>
                  </div>
                  <div className="pad-game-tile">
                    <div className="pad-game-title">Metro Bloom</div>
                    <div className="pad-game-tag">Puzzle</div>
                    <div className="pad-game-score">★ 8.5</div>
                  </div>
                </div>
                <div className="pad-controls">
                  <div className="pad-stick" />
                  <div className="pad-buttons">
                    <div className="pad-btn" />
                    <div className="pad-btn" />
                    <div className="pad-btn" />
                  </div>
                </div>
              </div>
              <div className="hero-floating-tag">
                🔍 「レビューは微妙なのに自分は刺さる」
                <br />
                そんな“ズレた名作”も拾ってくれるのが、このアプリ。
              </div>
            </div>
          </div>
        </section>

        {/* 今日の気分スライダー（index(1).html 準拠） */}
        <section id="vibe" className="vibe-section">
          <div className="container">
            <div className="section-label">VIBE MATCH</div>
            <h2 className="section-title">スライダーを動かすだけで、今の“気分”に合う一本を。</h2>
            <p className="section-sub">
              難しい条件入力は不要です。ストーリー重視か、アクション重視か、今日はまったりしたいのか──
              3つのVibeスライダーを動かすだけで、AIが数千本のレビューから候補を絞り込みます。
            </p>

            <div className="vibe-card">
              <div className="vibe-layout">
                {/* 左カラム：説明＋メイン3本 */}
                <div className="vibe-main">
                  <div className="vibe-explain">
                    <strong>今日の気分を3つだけ調整</strong>
                    <br />
                    <br />
                    右に寄せれば寄せるほど、その要素が強いゲームを優先。
                    実際のアプリでは、この入力をもとにAIがレビュー本文の「温度感」「ワード傾向」を解析してスコアリングします。
                  </div>

                  <div className="vibe-sliders">
                    {BASE_VIBE_SLIDERS.map((slider) => (
                      <div className="slider-item" key={slider.id}>
                        <div className="slider-label-row">
                          <span className="key">{slider.mainLabel}</span>
                          <span>
                            {slider.leftLabel} ←→ {slider.rightLabel}
                          </span>
                        </div>

                        <input
                          type="range"
                          min={0}
                          max={VIBE_MAX}
                          step={1}
                          value={vibes[slider.id]}
                          onChange={(e) =>
                            setVibes((prev) => ({
                              ...prev,
                              [slider.id]: Number(e.target.value),
                            }))
                          }
                        />

                        <div className="slider-dots" aria-hidden="true">
                          {Array.from({ length: VIBE_MAX + 1 }).map((_, idx) => (
                            <button
                              type="button"
                              key={idx}
                              className={
                                "slider-dot" +
                                (idx === vibes[slider.id] ? " is-active" : "") +
                                (idx < vibes[slider.id] ? " is-filled" : "")
                              }
                              onClick={() =>
                                setVibes((prev) => ({
                                  ...prev,
                                  [slider.id]: idx,
                                }))
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="vibe-advanced-toggle"
                    onClick={() => setShowAdvancedVibes((v) => !v)}
                  >
                    {showAdvancedVibes
                      ? "詳細な気分調整を閉じる"
                      : "詳細な気分調整（＋2軸）"}
                  </button>
                </div>

                {/* 右カラム：Advanced Filters の小さなサブカード */}
                <div
                  className={
                    "vibe-advanced-panel" + (showAdvancedVibes ? " is-open" : "")
                  }
                >
                  <div className="vibe-advanced-header">
                    <span className="chip">Advanced Filters</span>
                    <p>
                      ストーリーの濃さと「頭をどれくらい使うか」を細かく調整できます。
                      デフォルトのままでも十分ですが、こだわり派の方はこちらで微調整してください。
                    </p>
                  </div>

                  {showAdvancedVibes && (
                    <div className="vibe-advanced-sliders">
                      {ADVANCED_VIBE_SLIDERS.map((slider) => (
                        <div className="slider-item" key={slider.id}>
                          <div className="slider-label-row">
                            <span className="key">{slider.mainLabel}</span>
                            <span>
                              {slider.leftLabel} ←→ {slider.rightLabel}
                            </span>
                          </div>

                          <input
                            type="range"
                            min={0}
                            max={VIBE_MAX}
                            step={1}
                            value={vibes[slider.id]}
                            onChange={(e) =>
                              setVibes((prev) => ({
                                ...prev,
                                [slider.id]: Number(e.target.value),
                              }))
                            }
                          />

                          <div className="slider-dots" aria-hidden="true">
                            {Array.from({ length: VIBE_MAX + 1 }).map((_, idx) => (
                              <button
                                type="button"
                                key={idx}
                                className={
                                  "slider-dot" +
                                  (idx === vibes[slider.id] ? " is-active" : "") +
                                  (idx < vibes[slider.id] ? " is-filled" : "")
                                }
                                onClick={() =>
                                  setVibes((prev) => ({
                                    ...prev,
                                    [slider.id]: idx,
                                  }))
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>



        {/* Gems list */}
        {/* Gems list（ここからが「今週の隠れた名作 TOP 6」の動的化部分） */}
        <section id="gems">
          <div className="container">
            <p className="section-label">this week’s picks</p>
            <h2 className="section-title">今週の隠れた名作 TOP 6</h2>
            <p className="section-sub">
              ここに並ぶのは、Steam全体では「評価数が少ない」のに、
              <br />
              コアプレイヤーから異常な熱量で推されているタイトルたちです（※デモ用ダミー）。
            </p>

            {loadingWeekly && weeklyGems.length === 0 && (
              <p className="section-sub" style={{ marginTop: 16 }}>
                Hidden Gems を読み込み中です…
              </p>
            )}

            {!loadingWeekly && weeklyGems.length === 0 && (
              <p className="section-sub" style={{ marginTop: 16 }}>
                現在「今週の隠れた名作」として表示できるタイトルがありません。
              </p>
            )}

            {weeklyGems.length > 0 && (
              <div className="gems-grid">
                {weeklyGems.map((game, index) => {
                  const tags = getDisplayTags(game, 3);
                  const statScore =
                    typeof game.analysis?.statGemScore === "number"
                      ? game.analysis.statGemScore
                      : null;
                  const summary =
                    game.analysis?.summary ||
                    "Steamレビューから抽出されたHidden Gem候補です。";

                  // ★ カバー画像URL
                  // 1. search-games 経由で渡ってきた headerImage を優先
                  // 2. なければ従来通り appId から header.jpg を組み立ててフォールバック
                  const headerUrl =
                    game.headerImage && game.headerImage.trim() !== ""
                      ? game.headerImage
                      : `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`;


                  // ★ GameDetail への遷移ハンドラ
                  const openDetail = () =>
                    navigate(`/game/${game.appId}`, {
                      state: {
                        gameData: game,
                        analysisData: game.analysis,
                      },
                    });

                  return (
                    <article
                      className="gem-card"
                      key={game.appId}
                      onClick={openDetail} // カード全体クリックで遷移
                    >
                      <div className="gem-tag-rank">#{index + 1}</div>

                      {/* カバー画像サムネ */}
                      <div
                        className="gem-thumb"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail();
                        }}
                      >
                        <img src={headerUrl} alt={game.title} loading="lazy" />
                      </div>

                      <div className="gem-body">
                        <div className="gem-title-row">
                          <h3 className="gem-title">{game.title}</h3>
                          {statScore !== null && (
                            <div className="gem-score">
                              AI GEM {statScore.toFixed(1)}
                            </div>
                          )}
                        </div>

                        {tags.length > 0 && (
                          <div className="gem-tags">
                            {tags.map((tag) => (
                              <span className="gem-tag" key={tag}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="gem-desc">{summary}</p>

                        <div className="gem-footer">
                          {/* 左側：Hidden Gem バッジ（ラベルがあればそれを表示） */}
                          <div className="gem-badge">
                            <span className="dot" />
                            <span>{game.gemLabel ?? "Hidden Gem"}</span>
                          </div>

                          {/* 右側：詳細リンク */}
                          <button
                            type="button"
                            className="gem-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail();
                            }}
                          >
                            詳細を見る <span className="icon">↗</span>
                          </button>
                        </div>

                      </div>
                    </article>
                  );
                })}
              </div>
            )}


          </div>
        </section>

        {/* Features */}
        <section id="features">
          <div className="container">
            <p className="section-label">features</p>
            <h2 className="section-title">隠れた神ゲーを掘り当てる3つの仕組み</h2>
            <p className="section-sub">
              全員が同じ「おすすめ」を見る時代は終わり。
              <br />
              あなたのプレイスタイルとレビューの“行間”から、まだバズっていない名作だけを抽出します。
            </p>

            <div className="features-grid">
              <article className="feature-card">
                <div className="feature-tag">
                  <div className="feature-tag-dot" />
                  <span>01 / AI REVIEW MINING</span>
                </div>
                <h3 className="feature-title">
                  AIが膨大なSteamレビューを解析
                </h3>
                <p className="feature-text">
                  単純な★評価ではなく、レビュー本文の「熱量」「不満ポイント」「プレイ時間」などをAIが分析。
                  <br />
                  <strong>“コア層だけに刺さっているタイトル”</strong>
                  を浮かび上がらせます。
                </p>
                <div className="feature-emoji">🧠</div>
              </article>

              <article className="feature-card">
                <div className="feature-tag">
                  <div className="feature-tag-dot" />
                  <span>02 / VIBE SLIDER</span>
                </div>
                <h3 className="feature-title">気分で決める「Vibeスライダー」</h3>
                <p className="feature-text">
                  Action / Story / Chill / Horror / Solo / Co-op …。
                  <br />
                  スライダーを動かすだけで、
                  <strong>今の気分に合う“空気感”のゲーム</strong>を瞬時に提案します。
                </p>
                <div className="feature-emoji">🎚️</div>
              </article>

              <article className="feature-card">
                <div className="feature-tag">
                  <div className="feature-tag-dot" />
                  <span>03 / GEM LIST</span>
                </div>
                <h3 className="feature-title">フレンドと共有できる「Gemリスト」</h3>
                <p className="feature-text">
                  見つけた隠れた名作は、カテゴリ別に「Gemリスト」として保存。
                  <br />
                  URLひとつでフレンドにシェアして、
                  <strong>自分だけのレコメンドページ</strong>として使えます。
                </p>
                <div className="feature-emoji">💎</div>
              </article>
            </div>
          </div>
        </section>

        {/* Reviews */}
        <section id="reviews">
          <div className="container">
            <p className="section-label">voices</p>
            <h2 className="section-title">ヘビープレイヤーのホンネ</h2>
            <p className="section-sub">
              実際に「Hidden Gems for Steam」のコンセプトに近いツールを求めている、
              海外プレイヤーの声をイメージしたサンプルです。
            </p>
            <div className="reviews-strip">
              <article className="review-card">
                <div className="review-header">
                  <div className="avatar">S</div>
                  <div>
                    <div className="review-name">solo_queue</div>
                    <div className="review-meta">ソロ専 / 3,000h+</div>
                  </div>
                </div>
                <p className="review-text">
                  Steamのおすすめは「みんなが好きそうなゲーム」ばかりで、
                  自分の好みからほんの少しズレてる。もっとニッチなやつが知りたい。
                </p>
                <div className="review-game">
                  欲しいのは「平均点じゃない」名作。
                </div>
              </article>

              <article className="review-card">
                <div className="review-header">
                  <div className="avatar">A</div>
                  <div>
                    <div className="review-name">alt_f4</div>
                    <div className="review-meta">インディー好き / 1,200h</div>
                  </div>
                </div>
                <p className="review-text">
                  バンドルやセールで買ったゲームが多すぎて、何から遊べばいいか分からない。
                  「今の気分」に合わせて1〜2本だけ提案してくれるツールがほしい。
                </p>
                <div className="review-game">“Vibe”ベースで探したい。</div>
              </article>

              <article className="review-card">
                <div className="review-header">
                  <div className="avatar">M</div>
                  <div>
                    <div className="review-name">meta_mage</div>
                    <div className="review-meta">レビュー投稿勢</div>
                  </div>
                </div>
                <p className="review-text">
                  「やってみたら神ゲーだったのに、レビュー件数が少なすぎて誰にも届いてない」
                  っていうタイトルを救いたい。AIでそういうのだけ拾ってほしい。
                </p>
                <div className="review-game">
                  埋もれてる名作を可視化したい。
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* FAQ + Final CTA */}
        <section id="faq">
          <div className="container">
            <p className="section-label">faq</p>
            <h2 className="section-title">よくある質問</h2>
            <p className="section-sub">
              実際のプロダクト化を想定したときに出てきそうな質問を、モックとして載せています。
            </p>

            <div className="faq-list">
              <details className="faq-item">
                <summary>
                  <span className="faq-q">
                    Steamアカウントのログインは必要ですか？
                  </span>
                  <span className="faq-icon">➤</span>
                </summary>
                <div className="faq-a">
                  ベータ版では、ログイン不要の「お試しモード」と、プレイ履歴を使う「パーソナライズモード」の2種類を想定しています。
                  モック段階ではUIのみで、実際のログイン連携は含まれていません。
                </div>
              </details>

              <details className="faq-item">
                <summary>
                  <span className="faq-q">
                    公式のSteamクライアントとは違うんですか？
                  </span>
                  <span className="faq-icon">➤</span>
                </summary>
                <div className="faq-a">
                  公式クライアントの「おすすめ」は、全体の人気や類似タイトルに基づくことが多いです。
                  <br />
                  このアプリは、レビュー本文の“行間”とニッチな好みをもとに、
                  <strong>「まだあまり知られていない名作」</strong>
                  にフォーカスする点が違いです。
                </div>
              </details>

              <details className="faq-item">
                <summary>
                  <span className="faq-q">
                    マルチプレイが好きなのですが、絞り込みはできますか？
                  </span>
                  <span className="faq-icon">➤</span>
                </summary>
                <div className="faq-a">
                  「ソロ / 協力 / 対戦」などのプレイスタイルは、Vibeスライダーとは別にフィルターとして用意する想定です。
                  PTメンバーの好みを合算した「パーティー向けレコメンド」も拡張アイデアとして考えられます。
                </div>
              </details>

              <details className="faq-item">
                <summary>
                  <span className="faq-q">料金はかかりますか？</span>
                  <span className="faq-icon">➤</span>
                </summary>
                <div className="faq-a">
                  基本機能は無料、詳細なフィルタリングやGemリストの公開・カスタムなどを含む「Proプラン」をサブスクで提供するモデルを想定しています。
                  このページはそのためのLPモックです。
                </div>
              </details>
            </div>

            <div style={{ height: 24 }} />

            <div className="cta-final">
              <div>
                <div className="cta-final-title">START DIGGING GEMS.</div>
                <p className="cta-final-sub">
                  もしこのコンセプトが実装されたら、あなたはどんなゲームを真っ先に探しますか？
                  <br />
                  「とりあえず積みゲーを整理したい」「次の神ゲーを一本だけ見つけたい」——そんなときに使うツールを目指しています。
                </p>
              </div>
              <div className="cta-final-actions">
                <button
                  type="button"
                  className="btn-main"
                  onClick={() => navigate("/search")}
                >
                  ベータ版に参加したい
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => navigate("/wishlist")}
                >
                  プロジェクトの続報を受け取る
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        Hidden Gems for Steam – Concept Mock Page. <br />
        これはデザイン・構成のモックであり、Valve / Steam とは無関係の非公式コンセプトです。
      </footer>
    </div>
  );
};

export default Index;
