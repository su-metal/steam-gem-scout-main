import React from 'react';
import { Search, Menu } from 'lucide-react';

const Header = () => {
  return (
    <header className="absolute top-0 left-0 w-full z-30 px-6 py-6 flex justify-between items-center pointer-events-none">
      {/* Logo */}
      <div className="pointer-events-auto cursor-pointer">
        <span className="font-display font-bold text-2xl tracking-tighter text-white">
          VIBE<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">QUEST</span>
        </span>
      </div>

      {/* Nav Controls */}
      <div className="flex items-center gap-4 pointer-events-auto">
        <button className="p-3 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-md transition-colors border border-white/5 group">
          <Search className="w-5 h-5 text-gray-300 group-hover:text-white" />
        </button>
        <button className="p-3 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-md transition-colors border border-white/5 group">
          <Menu className="w-5 h-5 text-gray-300 group-hover:text-white" />
        </button>
      </div>
    </header>
  );
};

export default Header;
