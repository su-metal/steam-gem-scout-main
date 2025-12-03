import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VibeData } from './types';
import { ArrowRight, PlayCircle } from 'lucide-react';

interface VibeOverlayProps {
  currentVibe: VibeData | null;
}

const VibeOverlay: React.FC<VibeOverlayProps> = ({ currentVibe }) => {
  if (!currentVibe) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center p-6 pb-32 md:pb-6 md:justify-end">
      {/* Using AnimatePresence to crossfade content when vibe changes */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentVibe.id}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative max-w-lg w-full"
        >
          {/* Main Glass Card */}
          <div className="
            backdrop-blur-xl 
            bg-white/5 
            border border-white/10 
            rounded-3xl 
            p-6 md:p-8 
            shadow-[0_8px_32px_rgba(0,0,0,0.5)]
            pointer-events-auto
          ">
            {/* Header with decorative line */}
            <div className="flex items-center gap-3 mb-2">
              <div 
                className="w-2 h-8 rounded-full shadow-[0_0_10px_currentColor]" 
                style={{ backgroundColor: currentVibe.color, color: currentVibe.color }}
              />
              <h2 className="text-4xl md:text-5xl font-display font-bold text-white tracking-tight">
                {currentVibe.label}
              </h2>
            </div>
            
            {/* Description */}
            <p className="text-gray-300 text-lg leading-relaxed mb-6 font-light">
              {currentVibe.description}
            </p>

            {/* Tags Row */}
            <div className="flex flex-wrap gap-2 mb-8">
              {currentVibe.tags.map((tag, i) => (
                <span 
                  key={tag} 
                  className="px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider bg-white/5 border border-white/10 text-gray-300"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Action Button */}
            <button className="
              group
              w-full 
              py-4 
              rounded-xl 
              bg-white 
              text-black 
              font-bold 
              text-lg
              tracking-wide
              flex items-center justify-center gap-3
              hover:bg-gray-100 
              transition-all
              shadow-[0_0_20px_rgba(255,255,255,0.3)]
            ">
              <span>EXPLORE {currentVibe.label}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default VibeOverlay;
