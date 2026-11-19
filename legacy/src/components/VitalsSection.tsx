import React from "react";
import { CharacterStats } from "../types";
import { Shield, Timer, FastForward, Heart, Skull, Star } from "lucide-react";
import { DiceRoller } from "./DiceRoller";

interface VitalsSectionProps {
  stats: CharacterStats;
  onUpdate: (updates: Partial<CharacterStats>) => void;
}

export function VitalsSection({ stats, onUpdate }: VitalsSectionProps) {
  const renderDeathSave = (type: 'successes' | 'failures', count: number) => {
    return (
      <div className="flex gap-1.5">
        {[1, 2, 3].map(i => (
          <div 
            key={i}
            className={`w-3.5 h-3.5 rounded-full border border-slate-700 transition-all cursor-pointer ${
              i <= count 
                ? (type === 'successes' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]") 
                : "hover:bg-slate-800"
            }`}
            onClick={() => {
              const newValue = i === count ? i - 1 : i;
              onUpdate({ deathSaves: { ...stats.deathSaves, [type]: newValue } });
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
      {/* Armor Class */}
      <div className="bg-bento-card border border-bento-border rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden group shadow-xl">
        <Shield className="absolute -right-4 -bottom-4 w-16 h-16 text-slate-800 opacity-50 group-hover:scale-110 transition-transform" />
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 relative">Armor Class</span>
        <input 
          type="number"
          value={stats.armorClass}
          onChange={(e) => onUpdate({ armorClass: e.target.value === "" ? "" : parseInt(e.target.value) })}
          onBlur={() => { if (stats.armorClass === "") onUpdate({ armorClass: 10 }) }}
          className="bg-transparent border-none p-0 text-3xl font-black text-white w-full text-center focus:ring-0 appearance-none relative"
        />
        <button
          onClick={() => {
            const nextMageArmor = !stats.mageArmor;
            const dexMod = stats.dexterity === "" ? 0 : Math.floor((stats.dexterity - 10) / 2);
            onUpdate({ 
              mageArmor: nextMageArmor,
              armorClass: nextMageArmor ? 13 + dexMod : 10 + dexMod 
            });
          }}
          className={`relative z-10 -ml-1 mt-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-colors ${
            stats.mageArmor 
              ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/50' 
              : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-400'
          }`}
        >
          Mage Armor
        </button>
      </div>

      {/* Initiative */}
      <div className="bg-bento-card border border-bento-border rounded-2xl p-4 flex flex-col items-center justify-center relative shadow-xl">
        <Timer className="w-4 h-4 text-indigo-400 mb-1" />
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Initiative</span>
        <input 
          type="number"
          value={stats.initiative}
          onChange={(e) => onUpdate({ initiative: e.target.value === "" ? "" : parseInt(e.target.value) })}
          onBlur={() => { if (stats.initiative === "") onUpdate({ initiative: 0 }) }}
          className="bg-transparent border-none p-0 text-2xl font-black text-white w-full text-center focus:ring-0 appearance-none"
        />
      </div>

      {/* Speed */}
      <div className="bg-bento-card border border-bento-border rounded-2xl p-4 flex flex-col items-center justify-center relative shadow-xl">
        <FastForward className="w-4 h-4 text-fuchsia-400 mb-1" />
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Speed</span>
        <input 
          type="text"
          value={stats.speed}
          onChange={(e) => onUpdate({ speed: e.target.value })}
          className="bg-transparent border-none p-0 text-xl font-black text-white w-full text-center focus:ring-0"
        />
      </div>

      {/* Hit Points */}
      <div className="col-span-3 lg:col-span-3 bg-bento-card border border-bento-border rounded-2xl p-4 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-500" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hit Points</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 font-mono">MAX</span>
            <input 
              type="number"
              value={stats.hpMax}
              onChange={(e) => onUpdate({ hpMax: e.target.value === "" ? "" : parseInt(e.target.value) })}
              onBlur={() => { if (stats.hpMax === "") onUpdate({ hpMax: 0 }) }}
              className="bg-bento-bg border border-bento-border rounded px-2 py-0.5 text-xs font-bold text-white w-14 focus:ring-0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
             <label className="text-[8px] font-bold text-slate-500 uppercase italic">Current</label>
             <input 
              type="number"
              value={stats.hpCurrent}
              onChange={(e) => onUpdate({ hpCurrent: e.target.value === "" ? "" : parseInt(e.target.value) })}
              onBlur={() => { if (stats.hpCurrent === "") onUpdate({ hpCurrent: 0 }) }}
              className="w-full bg-bento-bg border border-bento-border rounded-xl px-4 py-3 text-2xl font-black text-emerald-400 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
             <label className="text-[8px] font-bold text-slate-500 uppercase italic">Temporary</label>
             <input 
              type="number"
              value={stats.hpTemp}
              onChange={(e) => onUpdate({ hpTemp: e.target.value === "" ? "" : parseInt(e.target.value) })}
              onBlur={() => { if (stats.hpTemp === "") onUpdate({ hpTemp: 0 }) }}
              className="w-full bg-bento-bg border border-bento-border rounded-xl px-4 py-3 text-2xl font-black text-indigo-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Health Bar (Visual only) */}
        <div className="mt-4 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
           <div 
             className="h-full bg-gradient-to-r from-red-600 to-emerald-500 transition-all duration-500"
             style={{ width: `${Math.min(100, ((stats.hpCurrent || 0) as number / (stats.hpMax || 1) as number) * 100)}%` }}
           />
        </div>
      </div>

      {/* Hit Dice & Death Saves */}
      <div className="col-span-3 lg:col-span-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bento-card border border-bento-border rounded-2xl p-4 flex items-center justify-between shadow-xl">
           <div>
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Hit Dice</span>
              <div className="flex items-center gap-2">
                 <input 
                   type="number"
                   value={stats.hitDiceCurrent}
                   onChange={(e) => onUpdate({ hitDiceCurrent: e.target.value === "" ? "" : parseInt(e.target.value) })}
                   onBlur={() => { if (stats.hitDiceCurrent === "") onUpdate({ hitDiceCurrent: 0 }) }}
                   className="bg-bento-bg border border-bento-border rounded px-2 py-1 text-sm font-bold text-white w-12 focus:ring-0"
                 />
                 <span className="text-slate-600 font-mono">/</span>
                 <input 
                   type="text"
                   value={stats.hitDiceMax}
                   onChange={(e) => onUpdate({ hitDiceMax: e.target.value })}
                   placeholder="1d6"
                   className="bg-transparent border-none p-0 text-sm font-mono text-slate-400 w-16 focus:ring-0"
                 />
              </div>
           </div>
           
           <div className="border-l border-slate-800 pl-6 space-y-3">
              <div className="flex items-center justify-between gap-4">
                 <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Successes</span>
                 {renderDeathSave('successes', stats.deathSaves.successes)}
              </div>
              <div className="flex items-center justify-between gap-4">
                 <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">Failures</span>
                 {renderDeathSave('failures', stats.deathSaves.failures)}
              </div>
           </div>
        </div>

        {/* Support & Combat Focus */}
        <div className="bg-bento-card border border-bento-border rounded-2xl p-4 shadow-xl flex gap-4">
            {/* Inspiration Toggle */}
            <div className="flex-1 border-r border-slate-800 pr-4 flex flex-col justify-center items-center">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Inspiration</span>
                <button
                    onClick={() => onUpdate({ inspiration: !stats.inspiration })}
                    className={`w-12 h-12 rounded-full border-2 transition-all flex items-center justify-center cursor-pointer ${
                        stats.inspiration
                            ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                            : "bg-slate-800 border-slate-700 text-slate-600 hover:border-slate-500 hover:text-slate-400 hover:bg-slate-700"
                    }`}
                    title="Toggle Inspiration"
                >
                    <Star className={`w-5 h-5 ${stats.inspiration ? "fill-current" : ""}`} />
                </button>
            </div>

            {/* Quick Roller */}
            <DiceRoller />
        </div>
      </div>
    </div>
  );
}
