import React from "react";
import { CharacterStats } from "../types";

interface IdentitySectionProps {
  stats: CharacterStats;
  onUpdate: (updates: Partial<CharacterStats>) => void;
}

export function IdentitySection({ stats, onUpdate }: IdentitySectionProps) {
  return (
    <div className="bg-bento-card border border-bento-border rounded-2xl p-6 shadow-xl relative overflow-hidden">
      {/* Visual Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl -mr-16 -mt-16 rounded-full" />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
        <div className="md:col-span-1 border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 md:pr-6">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Character Name</label>
          <input
            type="text"
            value={stats.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Enter Name..."
            className="w-full bg-transparent border-none p-0 text-2xl font-black text-white focus:ring-0 placeholder:text-slate-800"
          />
        </div>

        <div className="md:col-span-2 grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Class & Level</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={stats.class}
                onChange={(e) => onUpdate({ class: e.target.value })}
                className="w-20 bg-transparent border-none p-0 text-sm font-bold text-slate-300 focus:ring-0"
              />
              <input
                type="number"
                value={stats.level}
                min="1"
                max="20"
                onChange={(e) => onUpdate({ level: e.target.value === "" ? "" : parseInt(e.target.value) })}
                onBlur={() => { if (stats.level === "") onUpdate({ level: 1 }) }}
                className="w-12 bg-transparent border-none p-0 text-sm font-bold text-slate-300 focus:ring-0"
              />
            </div>
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Background</label>
            <input
              type="text"
              value={stats.background}
              onChange={(e) => onUpdate({ background: e.target.value })}
              className="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-300 focus:ring-0"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Race</label>
            <input
              type="text"
              value={stats.race}
              onChange={(e) => onUpdate({ race: e.target.value })}
              className="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-300 focus:ring-0"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Alignment</label>
            <input
              type="text"
              value={stats.alignment}
              onChange={(e) => onUpdate({ alignment: e.target.value })}
              className="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-300 focus:ring-0"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Experience Points</label>
            <input
              type="text"
              value={stats.xp}
              onChange={(e) => onUpdate({ xp: e.target.value })}
              className="w-full bg-transparent border-none p-0 text-sm font-mono text-fuchsia-400 focus:ring-0 font-bold"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
