from pathlib import Path
path = Path('src/components/SearchResultCard.tsx')
text = path.read_text(encoding='utf-8')
start = text.index('  const cardMatchScore')
replacement = '''  const cardMatchScore = normalizedMoodScore != null ? Math.round(normalizedMoodScore * 100) : 0;

  return (
    <Card
      className= group relative flex flex-col w-full h-full cursor-pointer bg-transparent border-none shadow-none rounded-none p-2 transition-all duration-300
      onClick={handleClick}
    >
      <div className=relative z-10 flex flex-col h-full>
        <div className=absolute inset-0 rounded-lg bg-[#09090b] />
        <div className=absolute -inset- [1px] rounded-lg bg-gradient-to-b from-cyan-500/50 via-purple-500/50 to-pink-500/50 opacity-20 group-hover:opacity-100 blur-[2px] transition-opacity duration-300 group-hover:duration-200 />
        <div className=absolute -inset- [2px] rounded-lg bg-cyan-400/20 blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-500 />

        <div className=relative z-20 flex flex-col h-full bg-[#050505] rounded-lg overflow-hidden ring-1 ring-white/10 group-hover:ring-transparent transition-all>
          <div className=h-6 bg-[#0c0c0c] border-b border-white/5 flex items-center justify-between px-3>
            <div className=flex items-center gap-1.5>
              <div className=w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse />
              <span className=text-[8px] font-mono text-emerald-500 uppercase tracking-widest>Sys.Ready</span>
            </div>
            <div className=flex gap-0.5>
              <div className=w-8 h-1 bg-white/10 rounded-full group-hover:bg-cyan-500/50 transition-colors />
              <div className=w-2 h-1 bg-white/10 rounded-full group-hover:bg-purple-500/50 transition-colors />
            </div>
          </div>

          <div className=relative aspect-[21/9] overflow-hidden group>
            <div className=absolute inset-0 z-0>
              <img
                src={headerImageUrl}
                alt={title}
                className=w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-200 mix-blend-normal
              />
              <img
                src={headerImageUrl}
                className=absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-40 mix-blend-screen translate-x-1 transition-all duration-100
                style={{ filter: 'hue-rotate(90deg)' }}
                alt="
              />
              <img
                src={headerImageUrl}
                className=absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-40 mix-blend-screen -translate-x-1 transition-all duration-100
                style={{ filter: 'hue-rotate(-90deg)' }}
                alt="
              />
            </div>
            <div className=absolute inset-0 bg-scanlines opacity-30 pointer-events-none />
            <div className=absolute inset-0 bg-white opacity-0 group-hover:animate-flash pointer-events-none />

            <div className=absolute top-0 right-0 p-2>
              <div className=bg-black/60 backdrop-blur border border-cyan-500/30 flex items-center gap-2 px-2 py-1 transform skew-x-[-10deg]>
                <Activity size={12} className=text-cyan-400 />
                <span className=text-xs font-black text-white transform skew-x-[10deg]>{cardMatchScore}%</span>
              </div>
            </div>

            {hasDiscount && (
              <div className=absolute bottom-0 right-0>
                <div className=bg-pink-600/90 text-white text-[10px] font-bold px-3 py-1 clip-path-slant-left>
                  SAVINGS: {discountPercentDisplay}%
                </div>
              </div>
            )}
          </div>

          <div className=flex-1 p-4 bg-gradient-to-b from-[#050505] to-[#0a0a0a] relative>
            <div
              className=absolute inset-0 opacity-10
              style={{
                backgroundImage:
                  'linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />
            <div className=relative z-10>
              <div className=flex justify-between items-start mb-2>
                <h3 className=text-sm font-bold text-white uppercase tracking-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-purple-400 transition-all duration-300 max-w-[80%] line-clamp-1>
                  {title}
                </h3>
                <Terminal size={12} className=text-slate-600 group-hover:text-cyan-400 transition-colors />
              </div>

              <p className=text-[10px] text-slate-400 font-mono leading-relaxed line-clamp-2 mb-3 h-8>
                {safeSummary}
              </p>

              <div className=flex flex-wrap gap-1.5 mb-6>
                {displayTags.slice(0, 3).map((tag, i) => (
                  <span
                    key={${tag}-}
                    className=text-[8px] font-mono text-slate-400 border border-white/5 px-1.5 py-0.5 group-hover:border-cyan-500/30 group-hover:text-cyan-200 transition-colors bg-black/40
                  >
                    {tag.toUpperCase()}
                  </span>
                ))}
              </div>

              <div className=flex items-center justify-between border-t border-white/5 pt-3 group-hover:border-white/10 transition-colors>
                <div className=flex flex-col>
                  <span className=text-[8px] text-slate-500 font-mono mb-0.5>CREDITS_REQ</span>
                  <div className=flex items-baseline gap-2>
                    <span className=text-lg font-bold text-white group-hover:text-cyan-300 transition-colors font-mono>
                      {priceDisplay}
                    </span>
                    {hasDiscount && (
                      <span className=text-[10px] text-slate-600 line-through font-mono>
                        {priceOriginalDisplay}
                      </span>
                    )}
                  </div>
                </div>

                <div className=relative>
                  <div className=w-8 h-8 flex items-center justify-center border border-white/10 bg-white/5 group-hover:bg-cyan-500 group-hover:border-cyan-400 group-hover:text-black transition-all>
                    <ArrowUpRight size={16} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className=absolute top-6 left-0 w-1 h-3 bg-cyan-500/0 group-hover:bg-cyan-500 transition-colors duration-300 />
          <div className=absolute top-6 right-0 w-1 h-3 bg-cyan-500/0 group-hover:bg-purple-500 transition-colors duration-300 />
          <div className=absolute bottom-0 left-0 w-3 h-1 bg-cyan-500/0 group-hover:bg-cyan-500 transition-colors duration-300 />
          <div className=absolute bottom-0 right-0 w-3 h-1 bg-cyan-500/0 group-hover:bg-purple-500 transition-colors duration-300 />
        </div>
      </div>
      <style>{
        .bg-scanlines {
          background: repeating-linear-gradient(
            to bottom,
            transparent 0%,
            transparent 50%,
            rgba(0, 0, 0, 0.4) 50%,
            rgba(0, 0, 0, 0.4) 100%
          );
          background-size: 100% 4px;
        }
        .clip-path-slant-left {
          clip-path: polygon(10px 0, 100% 0, 100% 100%, 0% 100%);
        }
        @keyframes flash {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.1; }
        }
        .animate-flash {
          animation: flash 0.2s ease-out;
        }
      }</style>
    </Card>
  );
'''
path.write_text(text[:start] + replacement, encoding='utf-8')
