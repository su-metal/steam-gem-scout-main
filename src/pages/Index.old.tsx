// src/pages/Index.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

/* ====== 気分スライダー定義 ====== */

type MoodSliderId = "operation" | "session" | "tension" | "story" | "brain";

type MoodState = Record<MoodSliderId, number>;

type SliderConfig = {
  key: MoodSliderId;
  title: string;
  mainLabel: string;
  leftLabel: string;
  rightLabel: string;
};

const VIBE_MAX = 4; // 0〜4 の 5 段階

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

const DEFAULT_MOOD: MoodState = {
  operation: 2,
  session: 2,
  tension: 2,
  story: 2,
  brain: 2,
};

const HERO_FLOAT_KEYFRAMES = `
.hero-visual {
  position: relative;
}

/* 本体パッド（Index - コピー (2) ＋ landing.css 準拠） */
.pad-shell {
  position: relative;
  width: 100%;
  max-width: 360px;
  aspect-ratio: 4 / 3;
  margin-left: auto;
  border-radius: 40px;
  background: radial-gradient(
    circle at 20% 10%,
    #ffffff 0,
    #f4f4ff 18%,
    #d6d6ff 48%,
    #8a4fff 100%
  );
  box-shadow: 0 28px 40px rgba(0, 0, 0, 0.65), 0 0 0 6px #050509;
  padding: 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transform: rotate(-6deg);
  animation: float 4s ease-in-out infinite;
}

/* パッドのふわふわアニメーション */
@keyframes float {
  0% {
    transform: translateY(0) rotate(-6deg);
  }
  50% {
    transform: translateY(-8px) rotate(-7.5deg);
  }
  100% {
    transform: translateY(0) rotate(-6deg);
  }
}

.pad-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.pad-chip {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background-image: linear-gradient(135deg, #8a4fff, #ff47b6);
  box-shadow: 0 0 0 4px rgba(5, 5, 9, 0.2);
}

.pad-pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(5, 5, 9, 0.06);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #050509;
}

.pad-pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #00e5ff;
  box-shadow: 0 0 0 5px rgba(0, 229, 255, 0.35);
}

/* 画面グリッド（6枚のタイル） */
.pad-screen {
  margin-top: 12px;
  flex: 1;
  border-radius: 18px;
  background: #050509;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.pad-game-tile {
  border-radius: 10px;
  padding: 6px;
  background: radial-gradient(
    circle at 0 0,
    #ff47b6 0,
    #1c1c2e 48%,
    #050509 100%
  );
  position: relative;
  overflow: hidden;
  border: 2px solid #050509;
  color: #f9f9ff;
}

.pad-game-title {
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
}

.pad-game-tag {
  font-size: 7px;
  color: #f3f3ff;
  opacity: 0.82;
}

.pad-game-score {
  position: absolute;
  right: 4px;
  bottom: 4px;
  font-size: 8px;
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(5, 5, 9, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.35);
}

/* 下部のスティック＋丸ボタン */
.pad-controls {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pad-stick {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, #ffffff, #d2d2ff);
  box-shadow: inset -4px -6px 10px rgba(0, 0, 0, 0.25),
    0 8px 14px rgba(0, 0, 0, 0.35);
}

.pad-buttons {
  display: flex;
  gap: 8px;
}

.pad-btn {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #050509;
  border: 2px solid #050509;
  box-shadow: 0 0 0 2px #ffffff;
}

/* 吹き出し（テキストは静止：アニメーションなし） */
.hero-floating-tag {
  position: absolute;
  right: 0;
  top: 8%;
  transform: translateX(18%);
  padding: 10px 14px;
  border-radius: 18px;
  background: rgba(5, 5, 9, 0.9);
  border: 2px solid #ffffff;
  font-size: 11px;
  max-width: 180px;
  box-shadow: 5px 5px 0 #050509;
}

/* モバイル時の配置（landing.css と同じ挙動） */
@media (max-width: 800px) {
  .pad-shell {
    margin: 12px auto 0;
    transform: rotate(-3deg);
  }
  .hero-floating-tag {
    position: static;
    transform: none;
    margin-top: 10px;
  }
}
`;



const Index: React.FC = () => {
  const navigate = useNavigate();
  const [vibes, setVibes] = useState<MoodState>(() => ({ ...DEFAULT_MOOD }));
  const [showAdvancedVibes, setShowAdvancedVibes] = useState(false);

  const goToSearchWithMood = () =>
    navigate("/search", { state: { userMood: vibes } });

  // 追加：Vibeセクションへスクロールするだけのハンドラ
  const scrollToVibeSection = () => {
    const el = document.getElementById("vibe");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#181830_0,_#050509_55%,_#050509_100%)] text-slate-50 flex flex-col">
      {/* ヒーロー用ふわふわアニメーション */}
      <style>{HERO_FLOAT_KEYFRAMES}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em]">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-950 bg-gradient-to-tr from-fuchsia-500 to-sky-400 text-base shadow-[0_18px_40px_rgba(0,0,0,0.6)]">
              G
            </div>
            <span className="translate-y-[1px] text-xs md:text-sm">
              Hidden Gems
            </span>
          </div>
          <nav className="hidden items-center gap-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300 md:flex">
            <a href="#features" className="hover:text-slate-50">
              Features
            </a>
            <a href="#gems" className="hover:text-slate-50">
              Gems
            </a>
            <a href="#reviews" className="hover:text-slate-50">
              Voices
            </a>
            <a href="#faq" className="hover:text-slate-50">
              FAQ
            </a>
            <button
              type="button"
              onClick={goToSearchWithMood}
              className="rounded-full border-2 border-slate-950 bg-gradient-to-r from-sky-400 to-pink-500 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-950 shadow-[4px_4px_0_#020617] transition-transform hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#020617]"
            >
              Appを試す
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden py-10 md:py-14">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
            <div className="h-full w-full bg-[radial-gradient(circle_at_10%_0%,rgba(129,140,248,0.5),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(56,189,248,0.45),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(244,114,182,0.4),transparent_60%)] blur-xl" />
          </div>

          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:px-6 md:items-center">
            {/* Left copy */}
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-300">
                <span className="h-2 w-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-sky-400 shadow-[0_0_0_6px_rgba(244,114,182,0.25)]" />
                <span>FOR STEAM PLAYERS / 隠れた名作ハンター向け</span>
              </div>

              <h1 className="text-3xl font-black uppercase leading-tight tracking-[0.08em] md:text-4xl">
                Find Your Next{" "}
                <span className="bg-gradient-to-r from-fuchsia-400 via-pink-500 to-sky-400 bg-clip-text text-transparent">
                  Steam Gem
                </span>
                .
              </h1>

              <p className="max-w-md text-sm text-slate-300">
                何を遊ぶか迷ったら、まずは今の“気分”から。
                <br />
                3つのVibeスライダーを動かすだけで、AIが数千本のSteamタイトルから
                <span className="font-semibold text-slate-50">
                  「今日の自分に刺さる一本」
                </span>
                を見つけてきます。
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={scrollToVibeSection}
                  className="h-11 rounded-full border-2 border-slate-950 bg-gradient-to-r from-fuchsia-500 via-pink-500 to-amber-400 px-6 text-xs font-bold uppercase tracking-[0.18em] text-slate-950 shadow-[6px_6px_0_#020617] hover:-translate-y-0.5 hover:shadow-[8px_8px_0_#020617]"
                >
                  気分スライダーで始める
                </Button>
                <button
                  type="button"
                  onClick={() => navigate("/rankings?mode=today-hidden")}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-white/25 bg-slate-950/60 px-4 text-[11px] font-medium tracking-[0.16em] text-slate-200 shadow-[0_12px_30px_rgba(15,23,42,0.9)] transition hover:border-white/60 hover:bg-slate-900/80 hover:text-slate-50"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100/10 text-xs">
                    ▶
                  </span>
                  <span>60秒で分かるアプリ紹介</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-400">
                Steamログイン不要。
                まずは下の
                <span className="text-sky-300"> 気分スライダーで今の気分をセット</span>
                してから、「この気分で探す」で検索に進めます。
              </p>

            </div>

            {/* Right visual（Index - コピー (2) ＋ landing.css 準拠） */}
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

        {/* Vibe Match section（キャンバス反映版） */}
        <section
          id="vibe"
          className="border-t border-white/5 bg-slate-950/90 py-12"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 md:px-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.2em] text-fuchsia-300">
                VIBE MATCH
              </p>
              <h2 className="text-2xl font-semibold md:text-3xl">
                スライダーを動かすだけで、今の
                <span className="text-fuchsia-300">“気分”</span>に合う一本を。
              </h2>
              <p className="max-w-2xl text-sm text-slate-300 md:text-base">
                難しい条件入力は不要です。ストーリー重視か、アクション重視か、今日はまったりしたいのか──
                3つのVibeスライダーを動かすだけで、AIが数千本のレビューから候補を絞り込みます。
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/70 shadow-[0_0_80px_rgba(168,85,247,0.18)]">
              <div className="flex flex-col gap-8 p-6 md:p-8 lg:flex-row">
                {/* 左：メイン3本スライダー */}
                <div className="flex-1 space-y-6">
                  <p className="text-xs font-semibold tracking-wide text-slate-400">
                    今日の気分を3つの質問で調整
                  </p>

                  {BASE_VIBE_SLIDERS.map((slider) => (
                    <MoodSlider
                      key={slider.key}
                      label={slider.mainLabel}
                      caption={`${slider.leftLabel} ←→ ${slider.rightLabel}`}
                      value={vibes[slider.key]}
                      onChange={(val) =>
                        setVibes((prev) => ({ ...prev, [slider.key]: val }))
                      }
                    />
                  ))}

                  {/* 詳細 2軸：3本のすぐ下に出す */}
                  {showAdvancedVibes && (
                    <div className="mt-2 space-y-4">
                      {ADVANCED_VIBE_SLIDERS.map((slider) => (
                        <MoodSlider
                          key={slider.key}
                          label={slider.mainLabel}
                          caption={`${slider.leftLabel} ←→ ${slider.rightLabel}`}
                          value={vibes[slider.key]}
                          onChange={(val) =>
                            setVibes((prev) => ({
                              ...prev,
                              [slider.key]: val,
                            }))
                          }
                        />
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowAdvancedVibes((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-slate-300 underline underline-offset-4 hover:text-slate-50"
                  >
                    {showAdvancedVibes
                      ? "詳細な気分調整を閉じる"
                      : "詳細な気分調整（＋2軸）"}
                  </button>
                </div>

                {/* 右：サマリー + CTA + Advanced */}
                <div className="flex w-full flex-col justify-between gap-4 rounded-2xl bg-slate-950/70 p-5 md:max-w-xs lg:max-w-sm">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold tracking-[0.18em] text-fuchsia-300">
                      TODAY&apos;S VIBE
                    </p>
                    <h3 className="text-lg font-semibold">
                      今の設定から見つかるゲームの傾向
                    </h3>
                    <p className="text-xs text-slate-300">
                      アクション強め・プレイ時間やや長め・ややまったり寄り。
                      ストーリーとゲームプレイのバランスが良い、じっくり遊べる良作が中心に並びます。
                    </p>

                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-fuchsia-500/15 px-3 py-1 text-fuchsia-200">
                        高評価だけど知られていない
                      </span>
                      <span className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-200">
                        ストーリー重視
                      </span>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200">
                        1〜2時間で様子見OK
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    <Button
                      type="button"
                      onClick={goToSearchWithMood}
                      className="h-12 w-full rounded-full bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 text-sm font-semibold shadow-[0_0_40px_rgba(236,72,153,0.35)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_0_60px_rgba(236,72,153,0.5)]"
                    >
                      この気分で探す
                    </Button>
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      Steamログイン不要。ボタンを押すと、この気分にマッチしたタイトルだけを優先して並び替えます。
                    </p>
                  </div>

                  <div className="mt-2 space-y-3 border-t border-slate-800 pt-3">
                    <div className="space-y-2 text-[11px] text-slate-300">
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                        <span className="h-2 w-2 rounded-full bg-sky-400" />
                        Advanced Filters
                      </span>
                      <p>
                        ストーリーの濃さと「頭をどれくらい使うか」を細かく調整できます。
                        デフォルトのままでも十分ですが、こだわり派の方はこちらで微調整してください。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-slate-950/95 py-6 text-center text-[11px] text-slate-400">
        Hidden Gems for Steam – Concept Mock Page.
        <br />
        これはデザイン・構成のモックであり、Valve / Steam とは無関係の非公式コンセプトです。
      </footer>
    </div>
  );
};

type MoodSliderProps = {
  label: string;
  caption: string;
  value: number; // 0〜4
  onChange: (value: number) => void;
};

// 0〜4（VIBE_MAX）を 0〜100 のUIスライダーにマッピング
const MoodSlider: React.FC<MoodSliderProps> = ({
  label,
  caption,
  value,
  onChange,
}) => {
  const uiValue = Math.round((value / VIBE_MAX) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium text-slate-200">
        <span>{label}</span>
        <span className="text-[11px] font-normal text-slate-400">
          {caption}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Slider
          value={[uiValue]}
          max={100}
          step={25}
          className="flex-1"
          onValueChange={(vals) => {
            const raw = vals[0] ?? 0;
            const next = Math.round((raw / 100) * VIBE_MAX);
            onChange(next);
          }}
        />
        <span className="w-10 text-right text-xs text-slate-300">
          {value}/{VIBE_MAX}
        </span>
      </div>
    </div>
  );
};

export default Index;
