import React from "react";
import { CharacterStats } from "../types";
import { ABILITIES } from "../constants";

interface AbilityScoresProps {
  stats: CharacterStats;
  onUpdate: (updates: Partial<CharacterStats>) => void;
}

export function AbilityScores({ stats, onUpdate }: AbilityScoresProps) {
  const getMod = (score: number | "") => {
    if (score === "") return "+0";
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : mod.toString();
  };

  return (
    <div className="flex flex-col gap-2">
      {ABILITIES.map((ability) => {
        const score = stats[ability.key as keyof CharacterStats] as number | "";
        
        return (
          <div 
            key={ability.key}
            className="bg-bento-card border border-bento-border rounded-xl p-3 flex flex-col items-center justify-between group hover:border-indigo-500/30 transition-all shadow-lg"
          >
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {ability.label}
            </div>
            
            <div className="text-2xl font-black text-white leading-none mb-1">
              {getMod(score)}
            </div>

            <div className="w-full mt-1 bg-bento-bg rounded-lg border border-bento-border overflow-hidden">
              <input
                type="number"
                value={score}
                onChange={(e) => onUpdate({ [ability.key]: e.target.value === "" ? "" : parseInt(e.target.value) })}
                onBlur={() => { if (score === "") onUpdate({ [ability.key]: 10 }) }}
                className="w-full bg-transparent border-none p-1 text-center text-xs font-bold text-slate-400 focus:ring-0 appearance-none"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
