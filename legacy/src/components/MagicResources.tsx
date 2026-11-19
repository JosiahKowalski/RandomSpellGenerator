import React from "react";
import { CharacterStats } from "../types";
import { Zap, RotateCcw, Minus, Plus } from "lucide-react";

interface MagicResourcesProps {
  stats: CharacterStats;
  onUpdate: (updates: Partial<CharacterStats>) => void;
}

export function MagicResources({ stats, onUpdate }: MagicResourcesProps) {
  const sorceryPointsMax = (stats.sorceryPointsMax || 0) as number;
  const sorceryPointsCurrent = (stats.sorceryPointsCurrent || 0) as number;
  const tidesOfChaosUsed = Boolean(stats.tidesOfChaosUsed);

  const setSlotsCurrent = (lvl: string, val: number) => {
    onUpdate({
      slotsCurrent: {
        ...stats.slotsCurrent,
        [lvl]: Math.min(stats.slotsMax[lvl], Math.max(0, val))
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sorcery Points Tokens */}
        <div className="bg-bento-card border border-bento-border p-4 rounded-2xl shadow-xl flex flex-col justify-center">
          <div className="flex justify-between items-center mb-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1">
              <Zap className="w-3 h-3 text-fuchsia-500" /> Sorcery Points
            </label>
            <span className="text-[10px] px-2 py-0.5 bg-fuchsia-500/10 text-fuchsia-400 rounded-full border border-fuchsia-500/20 font-bold font-mono">
              Max {sorceryPointsMax}
            </span>
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap gap-2 mb-2">
              {Array.from({ length: sorceryPointsMax }).map((_, i) => (
                <button 
                  key={i}
                  title={`Toggle Sorcery Point ${i + 1}`}
                  onClick={() => onUpdate({ sorceryPointsCurrent: i < sorceryPointsCurrent ? i : i + 1 })}
                  className={`w-8 h-8 sm:w-6 sm:h-6 lg:w-5 lg:h-5 rounded-full transition-all duration-500 transform ${
                    i < sorceryPointsCurrent 
                      ? "bg-gradient-to-tr from-fuchsia-600 to-fuchsia-400 shadow-[0_0_10px_rgba(192,38,211,0.6)] scale-100" 
                      : "bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:scale-110 scale-90"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between text-fuchsia-400 font-mono text-xl font-black">
            <span>{sorceryPointsCurrent}</span>
            <div className="flex gap-2">
                <button 
                  onClick={() => onUpdate({ sorceryPointsCurrent: Math.max(0, sorceryPointsCurrent - 1) })}
                  className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors"
                ><Minus className="w-3 h-3" /></button>
                <button 
                  onClick={() => onUpdate({ sorceryPointsCurrent: Math.min(sorceryPointsMax, sorceryPointsCurrent + 1) })}
                  className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors"
                ><Plus className="w-3 h-3" /></button>
            </div>
          </div>
        </div>

        {/* Tides of Chaos */}
        <button
          onClick={() => onUpdate({ tidesOfChaosUsed: !stats.tidesOfChaosUsed })}
          className={`rounded-2xl border transition-all p-4 flex flex-col justify-center items-center group shadow-xl relative overflow-hidden ${
            stats.tidesOfChaosUsed
              ? "bg-indigo-950/10 border-indigo-900/20 opacity-50"
              : "bg-indigo-950/30 border-indigo-500/30 hover:border-indigo-400/50 hover:bg-indigo-900/40"
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          <div className="text-center flex gap-4 items-center">
            <div className={`w-12 h-12 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${
              stats.tidesOfChaosUsed ? "border-slate-800 scale-90" : "border-indigo-400 scale-100 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
            }`}>
              {!stats.tidesOfChaosUsed && <div className="w-5 h-5 bg-indigo-300 rounded-full animate-pulse shadow-[0_0_15px_rgba(129,140,248,0.8)]" />}
              {stats.tidesOfChaosUsed && <RotateCcw className="w-5 h-5 text-slate-600 group-hover:-rotate-90 transition-transform" />}
            </div>
            <div className="text-left">
              <h3 className={`text-xs font-black uppercase tracking-[0.3em] mb-1 transition-colors ${stats.tidesOfChaosUsed ? "text-slate-600" : "text-indigo-300"}`}>
                Tides of Chaos
              </h3>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                {stats.tidesOfChaosUsed ? "Spent" : "Advantage Available"}
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Spell Slots */}
      <div className="bg-bento-card border border-bento-border p-4 rounded-2xl flex flex-col shadow-2xl relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
           <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full" />
        </div>
        
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-3 relative z-10 flex items-center gap-2">
           <Zap className="w-3 h-3 text-indigo-500" />
           Spell Slots Available
        </label>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 relative z-10">
          {(Object.keys(stats.slotsMax) as string[]).sort((a, b) => {
             const ord: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7, "8th": 8, "9th": 9 };
             return (ord[a] || 99) - (ord[b] || 99);
          }).map((level) => {
            const max = stats.slotsMax[level];
            const current = stats.slotsCurrent[level] || 0;
            
            return (
              <div key={level} className="bg-bento-bg/30 border border-slate-800/80 p-2 rounded-xl flex flex-col justify-between gap-1 group hover:bg-slate-800/40 hover:border-slate-700 transition-colors">
                <div className="flex justify-between items-center text-[9px] mb-1">
                   <span className="font-black text-slate-300 uppercase tracking-widest leading-none">{level}</span>
                   <span className="font-mono font-bold text-slate-400 group-hover:text-indigo-300 transition-colors leading-none">
                     <span className={current > 0 ? "text-indigo-400" : "text-slate-600"}>{current}</span>
                     <span className="text-slate-600 mx-px">/</span>
                     <span>{max}</span>
                   </span>
                </div>
                
                <div className="flex gap-1 h-5 sm:h-4 lg:h-3">
                  {Array.from({ length: 4 }).map((_, i) => {
                    if (i >= max) {
                        return <div key={i} className="flex-1 opacity-0 pointer-events-none w-full" />;
                    }
                    const isFilled = i < current;
                    return (
                      <button
                        key={i}
                        onClick={() => setSlotsCurrent(level, isFilled ? i : i + 1)}
                        className={`flex-1 rounded-sm transition-all duration-300 block w-full ${
                          isFilled 
                            ? "bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)]" 
                            : "bg-slate-800 shadow-inner group-hover:bg-slate-700"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
