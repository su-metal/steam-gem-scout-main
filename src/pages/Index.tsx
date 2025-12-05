// src/pages/Index.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wind,
  Zap,
  BookOpen,
  Crosshair,
  Timer,
  ArrowRight,
  Gamepad2,
} from "lucide-react";

// --- Types & Data ---

type VibeType = 'Chill' | 'Focus' | 'Story' | 'Speed' | 'Short';

interface VibeData {
  id: VibeType;
  title: string;
  subtitle: string;
  tags: string[];
  colors: {
    primary: string;    // Main Pop Color
    secondary: string;  // Gradient/Accent
    shadow: string;     // Glow color
  };
  icon: any;
  stats: { label: string; value: number }[];
}

const VIBES: VibeData[] = [
  {
    id: "Chill",
    title: "Zen Mode",
    subtitle: "Relax & Build",
    tags: ["Sim", "Atmospheric", "Cozy"],
    colors: {
      primary: "#00ffa3",
      secondary: "#00b8ff",
      shadow: "#00ffa3",
    },
    icon: Wind,
    // カードに表示するのは「気分が伝わる3本」だけ
    stats: [
      { label: "CHILL", value: 100 },       // このプリセットそのもの
      { label: "VIBES", value: 90 },        // 「らしさ」全体
      { label: "RELAX", value: 90 },        // 体験イメージ（ゆったり度）
    ],
  },
  {
    id: "Focus",
    title: "Tactical",
    subtitle: "Strategy & Think",
    tags: ["RTS", "Puzzle", "4X"],
    colors: {
      primary: "#0099ff",
      secondary: "#5e00ff",
      shadow: "#0099ff",
    },
    icon: Crosshair,
    stats: [
      { label: "FOCUS", value: 100 },
      { label: "VIBES", value: 95 },
      { label: "STRATEGY", value: 95 },     // 頭を使う・考える度合い
    ],
  },
  {
    id: "Story",
    title: "Narrative",
    subtitle: "Deep Immersion",
    tags: ["RPG", "Lore", "Adventure"],
    colors: {
      primary: "#cc00ff",
      secondary: "#ff0066",
      shadow: "#cc00ff",
    },
    icon: BookOpen,
    stats: [
      { label: "STORY", value: 100 },
      { label: "VIBES", value: 100 },
      { label: "NARRATIVE", value: 95 },    // 物語への没入度
    ],
  },
  {
    id: "Speed",
    title: "Adrenaline",
    subtitle: "Fast & Furious",
    tags: ["FPS", "Racing", "Action"],
    colors: {
      primary: "#ff0055",
      secondary: "#ff5e00",
      shadow: "#ff0055",
    },
    icon: Zap,
    stats: [
      { label: "SPEED", value: 100 },
      { label: "VIBES", value: 95 },
      { label: "INTENSITY", value: 100 },   // テンション・スピード感
    ],
  },
  {
    id: "Short",
    title: "Quick Run",
    subtitle: "Jump In & Out",
    tags: ["Roguelike", "Arcade", "Indie"],
    colors: {
      primary: "#ffcc00",
      secondary: "#ff6600",
      shadow: "#ffcc00",
    },
    icon: Timer,
    stats: [
      { label: "SHORT", value: 100 },
      { label: "VIBES", value: 90 },
      { label: "PICK-UP", value: 95 },      // さっと遊べる気軽さ
    ],
  },
];


// --- Experience Classes per Vibe ---

type ExperienceClassOption = {
  id: string;
  label: string;
};

const EXPERIENCE_CLASSES: Record<VibeType, ExperienceClassOption[]> = {
  Chill: [
    { id: "cozy-life", label: "Cozy Life & Crafting" },
    { id: "gentle-exploration", label: "Gentle Exploration" },
    { id: "light-puzzle", label: "Light Puzzle" },
    { id: "relaxed-building", label: "Relaxed Building / Townmaking" },
    { id: "any", label: "Any" },
  ],
  Focus: [
    { id: "tactics", label: "Turn-Based Tactics" },
    { id: "rts", label: "Real-Time Strategy" },
    { id: "deckbuilding", label: "Deckbuilding Strategy" },
    { id: "grand-strategy", label: "Grand Strategy" },
    { id: "hard-puzzle", label: "Hard Puzzle / Logic" },
    { id: "any", label: "Any" },
  ],
  Story: [
    { id: "story-driven", label: "Story-Driven" },
    { id: "character-drama", label: "Character Drama" },
    { id: "mystery-investigation", label: "Mystery & Investigation" },
    { id: "emotional-journey", label: "Emotional Journey" },
    { id: "any", label: "Any" },
  ],
  Speed: [
    { id: "action-combat", label: "Action Combat" },
    { id: "precision-shooter", label: "Precision Shooter" },
    { id: "rhythm-music", label: "Rhythm / Music Action" },
    { id: "sports-arena", label: "Competitive Sports & Arena" },
    { id: "high-intensity-rogue", label: "High-Intensity Roguelike" },
    { id: "any", label: "Any" },
  ],
  Short: [
    { id: "run-rogue", label: "Run-Based Roguelike" },
    { id: "arcade-action", label: "Arcade Action" },
    { id: "arcade-shooter", label: "Arcade Shooter" },
    { id: "short-puzzle", label: "Short Puzzle" },
    { id: "mini-games", label: "Mini Games" },
    { id: "any", label: "Any" },
  ],
};


// --- Utilities ---

const wrap = (min: number, max: number, v: number) => {
  const rangeSize = max - min;
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

/**
 * 画面幅ベースで「モバイルかどうか」を判定するフック
 * max-width: 768px をモバイル扱い
 */
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 768px)");

    // 初期値
    setIsMobile(mq.matches);

    // 変更イベント
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    mq.addEventListener("change", handleChange);
    return () => {
      mq.removeEventListener("change", handleChange);
    };
  }, []);

  return isMobile;
};


// --- Animations ---

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

// BIG BOUNCY ANIMATION RESTORED
const swipeVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 800 : -800, // Large distance for fly-in
    y: 0,
    opacity: 0,
    scale: 0.2, // Start very small
    rotate: direction > 0 ? 90 : -90, // Big rotation
  }),
  center: {
    zIndex: 1,
    x: 0,
    y: 0,
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      x: { type: "spring", stiffness: 350, damping: 25 }, // Bouncy spring
      opacity: { duration: 0.2 },
      scale: { type: "spring", stiffness: 350, damping: 25 },
      rotate: { type: "spring", stiffness: 350, damping: 25 }
    }
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 800 : -800, // Fly out far
    opacity: 0,
    scale: 0.2,
    rotate: direction < 0 ? -90 : 90, // Big rotation on exit
    transition: {
      x: { type: "spring", stiffness: 350, damping: 25 },
      opacity: { duration: 0.2 },
      scale: { duration: 0.3 }
    }
  })
};



// --- Components ---

const FloatingParticles = ({ color }: { color: string }) => {
  const isMobile = useIsMobile();

  // モバイル時は粒をかなり減らす（例: 5個）
  const particleCount = isMobile ? 5 : 15;

  // 再レンダーごとにランダム生成し直さないよう useMemo で固定
  const particles = useMemo(
    () =>
      Array.from({ length: particleCount }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 20 + 5,
        duration: Math.random() * 10 + 10,
        type: i % 3,
      })),
    [particleCount]
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute opacity-20 mix-blend-screen"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: color,
            borderRadius: p.type === 0 ? "50%" : p.type === 1 ? "4px" : "0",
            clipPath:
              p.type === 2
                ? "polygon(50% 0%, 0% 100%, 100% 100%)"
                : "none",
          }}
          animate={{
            y: [0, -100, 0],
            rotate: [0, 180, 360],
            scale: [1, 1.5, 1],
            opacity: [0.1, 0.4, 0.1],
          }}
          transition={{ duration: p.duration, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
};


const Background = ({ activeVibe }: { activeVibe: VibeData }) => {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#0f0c29] transition-colors duration-500">
      <motion.div
        className="absolute inset-0 opacity-40"
        animate={{ background: `radial-gradient(circle at 50% 50%, ${activeVibe.colors.primary}40 0%, ${activeVibe.colors.secondary}20 50%, transparent 100%)` }}
        transition={{ duration: 0.8 }}
      />
      <motion.div
        className="absolute top-[-20%] left-[-10%] w-[80vw] h-[80vw] rounded-full opacity-30 blur-[100px]"
        animate={{ backgroundColor: activeVibe.colors.primary, x: [0, 50, 0], y: [0, 30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-20%] right-[-10%] w-[70vw] h-[70vw] rounded-full opacity-30 blur-[80px]"
        animate={{ backgroundColor: activeVibe.colors.secondary, x: [0, -40, 0], y: [0, -40, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `radial-gradient(white 1px, transparent 1px)`, backgroundSize: '30px 30px' }} />
      <FloatingParticles color={activeVibe.colors.primary} />
    </div>
  );
};

const StatBar = ({ label, value, color }: { label: string, value: number, color: string }) => {
  return (
    <div className="flex flex-col w-full gap-1">
      <div className="flex justify-between items-end text-xs font-bold text-white opacity-80 font-space">
        <span className="uppercase tracking-wider">{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden bg-black/30 rounded-full border border-white/5">
        <motion.div
          className="h-full relative rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
        >
          <div className="absolute right-0 top-0 bottom-0 w-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.4)_50%,transparent_100%)] opacity-50" />
        </motion.div>
      </div>
    </div>
  );
};

const MainCard = ({
  vibe,
  isActive,
  experienceClassLabel,
  ...props
}: {
  vibe: VibeData;
  isActive: boolean;
  experienceClassLabel?: string;
  [key: string]: any;
}) => {

  return (
    <motion.div
      {...props}
      className={`${props.className || 'relative'} cursor-grab active:cursor-grabbing group ${isActive ? 'z-30' : 'z-10'}`}
      whileHover={isActive ? { scale: 1.02 } : { scale: 0.9 }}
      whileTap={{ scale: 0.98 }}
    >
      <div
        className="w-[340px] h-[480px] md:w-[420px] md:h-[520px] overflow-hidden relative transition-all duration-300 pointer-events-none flex flex-col items-center text-center p-8 bg-[#191923]/70 backdrop-blur-xl border-[3px] rounded-[3rem]"
        style={{
          borderColor: isActive ? vibe.colors.primary : 'rgba(255,255,255,0.1)',
          boxShadow: isActive ? `0 20px 60px -20px ${vibe.colors.primary}60` : 'none',
        }}
      >
        {/* Card Background Decor */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent opacity-50" />

        {/* Card Content */}
        <div className="relative z-10 w-full h-full flex flex-col items-center text-white">

          {/* Icon */}
          <div className="mt-2 mb-4 relative">
            <motion.div
              className="absolute inset-[-20px] rounded-full opacity-40 blur-xl"
              style={{ background: vibe.colors.primary }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center relative shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${vibe.colors.primary}, ${vibe.colors.secondary})`,
                boxShadow: `0 10px 20px -5px ${vibe.colors.shadow}80`
              }}
            >
              <vibe.icon className="w-12 h-12 text-white drop-shadow-md" />
            </div>
          </div>

          {/* Titles + Experience Focus pill */}
          <div className="mb-6 w-full font-space flex flex-col items-center gap-3">
            <h2 className="text-4xl font-bold">
              {vibe.title}
            </h2>

            <div
              className="inline-block px-3 py-1 font-bold uppercase tracking-widest text-xs bg-white/10 border border-white/10 rounded-full"
              style={{ color: vibe.colors.primary }}
            >
              {vibe.subtitle}
            </div>

            {experienceClassLabel && (
              <motion.div
                key={experienceClassLabel} // ラベルが変わるたびにリマウントしてアニメ再生
                initial={{
                  scale: 0.9,
                  opacity: 0,
                  boxShadow: "0 0 0 0 rgba(0,0,0,0)",
                }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  boxShadow: `0 0 18px ${vibe.colors.primary}66`,
                }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 border border-white/15 text-[11px] uppercase tracking-[0.18em] text-white/70"
              >
                <motion.span
                  className="w-1.5 h-1.5 rounded-full"
                  initial={{
                    scale: 1,
                    boxShadow: `0 0 0 0 ${vibe.colors.primary}55`,
                  }}
                  animate={{
                    scale: 1.4,
                    boxShadow: `0 0 0 8px ${vibe.colors.primary}00`,
                  }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  style={{ backgroundColor: vibe.colors.primary }}
                />
                <span>{experienceClassLabel}</span>
              </motion.div>
            )}

          </div>


          {/* Stats */}
          <div
            className={`w-full space-y-2 px-1.5 transition-all duration-300 ${isActive ? "opacity-100 translate-y-0 delay-100" : "opacity-0 translate-y-4"
              }`}
          >
            {vibe.stats.map((stat, i) => (
              <StatBar key={i} label={stat.label} value={stat.value} color={vibe.colors.primary} />
            ))}
          </div>

          {/* Tags */}
          <div className="mt-auto flex flex-wrap justify-center gap-2 font-inter">
            {vibe.tags.map(tag => (
              <span
                key={tag}
                className="text-[10px] px-3 py-1.5 font-bold tracking-wide bg-black/40 rounded-full text-white/80 border border-white/5"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const ExperienceClassSelector = ({
  activeVibe,
  selectedId,
  onSelect,
}: {
  activeVibe: VibeData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  const options = EXPERIENCE_CLASSES[activeVibe.id];

  const effectiveSelectedId =
    selectedId && options.some((o) => o.id === selectedId)
      ? selectedId
      : options[0].id;

  return (
    <div className="relative z-30 w-full max-w-md px-6 mt-6">
      <div className="w-full rounded-full bg-[#040618]/95 border border-white/15 px-4 py-2.5 flex flex-col gap-2 backdrop-blur-xl shadow-[0_14px_40px_rgba(0,0,0,0.7)]">
        {/* ヘッダー行 */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] tracking-[0.26em] uppercase text-white/75">
            EXPERIENCE FOCUS
          </span>
          <span className="text-[10px] text-white/55 truncate">
            Choose how you want this {activeVibe.title.toLowerCase()}
          </span>
        </div>

        {/* グリッド（横スクロールなし） */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          {options.map((opt) => {
            const isActive = opt.id === effectiveSelectedId;
            const isGhost = opt.id === "any";

            return (
              <motion.button
                key={opt.id}
                type="button"
                onClick={() => onSelect(opt.id)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className={[
                  "w-full inline-flex items-center justify-center px-3 py-2 rounded-full text-[11px] font-bold",
                  "whitespace-nowrap overflow-hidden text-ellipsis border transition-all duration-200",
                  isActive
                    ? "text-white shadow-lg"
                    : "bg-black/40 border-white/15 text-white/60 hover:bg-white/10 hover:text-white",
                  isGhost && !isActive ? "border-dashed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  isActive
                    ? {
                      background: `radial-gradient(circle at 0% 0%, ${activeVibe.colors.primary}33, rgba(3,6,23,0.96))`,
                      borderColor: activeVibe.colors.primary,
                      color: "#fff",
                      boxShadow: `0 0 18px ${activeVibe.colors.primary}99`,
                    }
                    : isGhost
                      ? {
                        borderColor: "rgba(190,200,245,0.9)",
                        color: "rgba(215,225,255,0.98)",
                        backgroundColor: "transparent",
                      }
                      : undefined
                }
              >
                <span className="truncate">{opt.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
};



const Dock = ({
  vibes,
  activeVibeId,
  onSelect
}: {
  vibes: VibeData[];
  activeVibeId: VibeType;
  onSelect: (vibe: VibeData) => void;
}) => {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="flex items-center justify-between p-2 transition-all duration-500 bg-[#1a1a2e]/90 border border-white/10 backdrop-blur-2xl rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]">
        {vibes.map((vibe) => {
          const isActive = activeVibeId === vibe.id;
          return (
            <button
              key={vibe.id}
              onClick={() => onSelect(vibe)}
              className="relative w-12 h-12 flex items-center justify-center transition-all duration-300 group"
            >
              {isActive && (
                <motion.div
                  layoutId="dock-active"
                  className="absolute inset-0 bg-white/10 border border-white/20 rounded-full"
                  transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
                />
              )}
              <vibe.icon
                className={`w-6 h-6 relative z-10 transition-all duration-300 ${isActive ? 'scale-110' : 'text-white/40'}`}
                style={{
                  color: isActive ? vibe.colors.primary : undefined,
                  filter: isActive ? `drop-shadow(0 0 8px ${vibe.colors.primary})` : 'none'
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// --- Main App ---

const Index: React.FC = () => {
  const [[page, direction], setPage] = useState<[number, number]>([0, 0]);

  // ★ Experience Class の選択状態（null = まだ未選択）
  const [selectedExperienceClass, setSelectedExperienceClass] =
    useState<string | null>(null);


  // 後述の navigate 用
  const navigate = useNavigate();


  const vibeIndex = wrap(0, VIBES.length, page);
  const activeVibe = VIBES[vibeIndex];

  const optionsForActive = EXPERIENCE_CLASSES[activeVibe.id];
  const effectiveExperienceId =
    selectedExperienceClass &&
      optionsForActive.some((o) => o.id === selectedExperienceClass)
      ? selectedExperienceClass
      : optionsForActive[0].id;

  const activeExperienceLabel =
    optionsForActive.find((o) => o.id === effectiveExperienceId)?.label ?? "";


  const prevIndex = wrap(0, VIBES.length, page - 1);
  const nextIndex = wrap(0, VIBES.length, page + 1);
  const prev = VIBES[prevIndex];
  const next = VIBES[nextIndex];

  const paginate = (newDirection: number) => {
    setPage([page + newDirection, newDirection]);
  };

  const setVibeById = (vibe: VibeData) => {
    const targetIndex = VIBES.findIndex((v) => v.id === vibe.id);
    const currentIndex = vibeIndex;
    let diff = targetIndex - currentIndex;
    if (diff > VIBES.length / 2) diff -= VIBES.length;
    if (diff < -VIBES.length / 2) diff += VIBES.length;
    setPage([page + diff, diff > 0 ? 1 : -1]);
  };



  return (
    <div className="min-h-screen relative flex flex-col font-inter selection:bg-white/30 overflow-hidden text-white">
      <Background activeVibe={activeVibe} />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-6 md:px-12 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="w-10 h-10 flex items-center justify-center transition-all duration-300 rounded-2xl bg-white/10 backdrop-blur-md border-2 border-white/20 shadow-[0_4px_0_rgba(0,0,0,0.2)] text-white">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <span className="text-2xl font-bold tracking-tight drop-shadow-md font-space text-white">
            VIBE
          </span>
        </div>
      </header>

      <main className="mt-6 flex-grow flex flex-col items-center justify-center relative z-10 px-4 pt-10 pb-32">
        <div className="relative flex items-center justify-center w-full max-w-6xl h-[520px] shrink-0 touch-pan-y md:touch-none">
          {/* Back Cards (Static Visuals) */}
          <div className="absolute left-[5%] xl:left-[20%] hidden md:block opacity-40 scale-90 pointer-events-none z-0">
            <MainCard vibe={prev} isActive={false} />
          </div>
          <div className="absolute right-[5%] xl:right-[20%] hidden md:block opacity-40 scale-90 pointer-events-none z-0">
            <MainCard vibe={next} isActive={false} />
          </div>


          {/* Active Card Container */}
          <div className="z-20 w-[340px] md:w-[420px] h-[480px] md:h-[520px] relative perspective-1000">

            <AnimatePresence initial={false} custom={direction}>
              <MainCard
                key={page}
                vibe={activeVibe}
                isActive={true}
                experienceClassLabel={activeExperienceLabel}
                custom={direction}
                variants={swipeVariants}
                initial="enter"
                animate="center"
                exit="exit"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.6}
                onDragEnd={(e, { offset, velocity }) => {
                  const swipe = swipePower(offset.x, velocity.x);
                  if (swipe < -swipeConfidenceThreshold) paginate(1);
                  else if (swipe > swipeConfidenceThreshold) paginate(-1);
                }}
                className="absolute inset-0"
              />
            </AnimatePresence>
          </div>
        </div>

        <ExperienceClassSelector
          activeVibe={activeVibe}
          selectedId={effectiveExperienceId}
          onSelect={setSelectedExperienceClass}
        />

        {/* CTA Button */}
        <motion.div
          className="mt-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          key={activeVibe.id}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() =>
              navigate("/search", {
                state: {
                  primaryVibePreset: activeVibe.id,
                  subVibes: [],
                  experienceClass: selectedExperienceClass ?? "any",
                },
              })
            }
            className="group relative px-12 py-5 font-black text-xl overflow-hidden transition-all bg-black/30 text-white/50 border border-white/5 rounded-full hover:bg-white/10 hover:text-white font-space"
            style={{
              boxShadow: `0 10px 40px -10px ${activeVibe.colors.primary}90`
            }}
          >
            <div className="relative z-10 flex items-center gap-3">
              <span className="uppercase tracking-widest text-white">Lets Go</span>
              <div className="bg-black text-white p-1 rounded-full">
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: `linear-gradient(90deg, ${activeVibe.colors.primary}, ${activeVibe.colors.secondary})` }} />
          </motion.button>
        </motion.div>

      </main>

      <Dock
        vibes={VIBES}
        activeVibeId={activeVibe.id}
        onSelect={setVibeById}
      />
    </div>
  );
};

export default Index;
