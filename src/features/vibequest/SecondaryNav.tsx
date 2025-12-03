import React from 'react';
import { SUB_VIBES } from './constants';
import { Compass } from 'lucide-react';

const SecondaryNav: React.FC = () => {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 pb-8 pt-12 bg-gradient-to-t from-[#030305] via-[#030305]/80 to-transparent pointer-events-none">
      <div className="container mx-auto px-6 pointer-events-auto">
        <div className="flex items-center gap-2 mb-4 opacity-60">
          <Compass className="w-4 h-4 text-purple-400" />
          <span className="text-xs uppercase tracking-[0.2em] font-bold text-white">Explore Deeper</span>
        </div>
        
        {/* Horizontal Scroll Area */}
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide mask-fade-sides">
          {SUB_VIBES.map((sub) => (
            <button
              key={sub.id}
              className="
                flex-shrink-0 
                px-5 py-2.5 
                rounded-full 
                bg-white/5 
                border border-white/5 
                hover:border-purple-500/50 
                hover:bg-white/10 
                transition-all 
                duration-300
                group
              "
            >
              <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">
                {sub.label}
              </span>
            </button>
          ))}
          
          <button className="flex-shrink-0 px-5 py-2.5 text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors">
            View All Categories →
          </button>
        </div>
      </div>
      
      {/* Gradient Mask CSS injection directly here for simplicity */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default SecondaryNav;
