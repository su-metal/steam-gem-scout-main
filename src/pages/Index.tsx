// src/pages/Index.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./landing.css";


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


// 気分スライダーの定義

// メイン3本（既存）
type MoodSliderId =
  | "operation"
  | "session"
  | "tension"
  | "story"
  | "brain";

type MoodState = Record<MoodSliderId, number>;

type SliderConfig = {
  key: MoodSliderId;
  title: string;
  mainLabel: string;
  leftLabel: string;
  rightLabel: string;
};

const VIBE_MAX = 4; // 0〜4 の 5 軸

const BASE_VIBE_SLIDERS: SliderConfig[] = [
  {
    key: "operation",
    title: "操作量",
    mainLabel: "Passive ↔ Active",
    leftLabel: "リラックス",
    rightLabel: "アクティブ",
  },
  {
    key: "session",
    title: "セッション長",
    mainLabel: "Short ↔ Long",
    leftLabel: "短時間",
    rightLabel: "長時間",
  },
  {
    key: "tension",
    title: "テンション",
    mainLabel: "Cozy ↔ Intense",
    leftLabel: "まったり",
    rightLabel: "高テンション",
  },
];

const ADVANCED_VIBE_SLIDERS: SliderConfig[] = [
  {
    key: "story",
    title: "ストーリー濃度",
    mainLabel: "Story-Light ↔ Story-Heavy",
    leftLabel: "プレイ重視",
    rightLabel: "物語重視",
  },
  {
    key: "brain",
    title: "思考負荷",
    mainLabel: "Simple ↔ Deep",
    leftLabel: "シンプル",
    rightLabel: "じっくり",
  },
];

const VIBE_SLIDERS: SliderConfig[] = [
  ...BASE_VIBE_SLIDERS,
  ...ADVANCED_VIBE_SLIDERS,
];

const DEFAULT_MOOD: MoodState = {
  operation: 2,
  session: 2,
  tension: 2,
  story: 2,
  brain: 2,
};


const Index: React.FC = () => {
  const navigate = useNavigate();

  const [vibes, setVibes] = useState<MoodState>(() => ({ ...DEFAULT_MOOD }));

  const goToSearchWithMood = () =>
    navigate("/search", { state: { userMood: vibes } });

  // Advanced Filters の開閉
  const [showAdvancedVibes, setShowAdvancedVibes] = useState(false);


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
                onClick={goToSearchWithMood}
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
                  onClick={goToSearchWithMood}
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
                      <div className="slider-item" key={slider.key}>
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
                          value={vibes[slider.key]}
                          onChange={(e) =>
                            setVibes((prev) => ({
                              ...prev,
                              [slider.key]: Number(e.target.value),
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
                                (idx === vibes[slider.key] ? " is-active" : "") +
                                (idx < vibes[slider.key] ? " is-filled" : "")
                              }
                              onClick={() =>
                                setVibes((prev) => ({
                                  ...prev,
                                  [slider.key]: idx,
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
                        <div className="slider-item" key={slider.key}>
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
                            value={vibes[slider.key]}
                            onChange={(e) =>
                              setVibes((prev) => ({
                                ...prev,
                                [slider.key]: Number(e.target.value),
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
                                  (idx === vibes[slider.key] ? " is-active" : "") +
                                  (idx < vibes[slider.key] ? " is-filled" : "")
                                }
                                onClick={() =>
                                  setVibes((prev) => ({
                                    ...prev,
                                    [slider.key]: idx,
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
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                className="btn-main"
                onClick={goToSearchWithMood}
              >
                この気分で探す
              </button>
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

