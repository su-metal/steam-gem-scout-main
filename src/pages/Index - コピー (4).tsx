// src/pages/Index.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import Header from "@/features/vibequest/Header";
import SecondaryNav from "@/features/vibequest/SecondaryNav";
import VibeGlobe from "@/features/vibequest/VibeGlobe";
import VibeOverlay from "@/features/vibequest/VibeOverlay";
import { VIBES } from "@/features/vibequest/constants";
import type { VibeData } from "@/features/vibequest/types";

const Index: React.FC = () => {
  const navigate = useNavigate();

  // 3D グローブ用：現在アクティブな Vibe
  const [currentVibe, setCurrentVibe] = useState<VibeData>(VIBES[0]);

  const handleVibeChange = (vibe: VibeData) => {
    setCurrentVibe((prev) => (prev.id === vibe.id ? prev : vibe));
  };

  // 現時点では、選択した Vibe をそのまま /search に渡すシンプルな挙動にしています
  const goToSearchWithCurrentVibe = () => {
    navigate("/search", {
      state: {
        selectedVibe: currentVibe.id,
      },
    });
  };

  return (
    <div className="relative min-h-screen bg-[#030305] text-white overflow-hidden">
      {/* フルスクリーンの地球儀（背景） */}
      <div className="absolute inset-0 z-0">
        <VibeGlobe
          currentVibe={currentVibe}
          onVibeChange={handleVibeChange}
        />
      </div>
      {/* 背景のぼかしライト */}

      <div className="pointer-events-none absolute -top-32 left-1/3 w-80 h-80 bg-purple-500/20 blur-[110px] rounded-full z-5" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 w-96 h-80 bg-sky-500/15 blur-[130px] rounded-full z-5" />


      {/* 画面全体を縦に積む */}
      <main className="relative z-10 min-h-screen flex flex-col pointer-events-none">

        {/* ヘッダー（VIBEQUEST ロゴ＋Search/Menu） */}
        <Header />

        {/* PC / タブレット向けの簡単なヒーローテキスト（モバイルでは非表示） */}
        <section className="relative hidden sm:block w-full max-w-5xl mx-auto mt-16 sm:mt-20 px-4">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400 mb-3">
              PICK YOUR VIBE
            </p>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Find your
              <span className="ml-2 bg-gradient-to-r from-indigo-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
                Steam Vibe
              </span>
            </h1>
            <p className="mt-3 text-sm text-slate-300 max-w-lg mx-auto">
              地球儀を回して、今の気分に近い Vibe を選びます。
              そのまま検索画面でおすすめタイトルを絞り込めます。
            </p>
          </div>
        </section>


        {/* 下部寄せ：現在の Vibe 詳細カード（さらに下に寄せる） */}
        <div className="mt-16 md:mt-24 mb-10 flex justify-center px-4">
          <VibeOverlay currentVibe={currentVibe} />
        </div>

        {/* さらに下：Sub Vibes （Explore Deeper） */}
        <div className="pb-8">
          <SecondaryNav />
        </div>
      </main>
    </div>
  );
};

export default Index;
