import React from "react";
import { CharacterStats } from "../types";
import { ABILITIES, SKILLS } from "../constants";

interface SavingThrowsAndSkillsProps {
  stats: CharacterStats;
  onUpdate: (updates: Partial<CharacterStats>) => void;
}

export function SavingThrowsAndSkills({ stats, onUpdate }: SavingThrowsAndSkillsProps) {
  const getModValue = (score: number) => Math.floor((score - 10) / 2);
  
  const toggleProficiency = (key: string) => {
    const next = stats.proficiencies.includes(key)
      ? stats.proficiencies.filter(p => p !== key)
      : [...stats.proficiencies, key];
    onUpdate({ proficiencies: next });
  };

  const renderCheckItem = (key: string, label: string, baseAbilityKey: string) => {
    const isProficient = stats.proficiencies.includes(key);
    const abilityScore = (stats[baseAbilityKey as keyof CharacterStats] || 10) as number;
    const baseMod = getModValue(abilityScore);
    const totalMod = baseMod + (isProficient ? (stats.proficiencyBonus || 0) as number : 0);
    const displayMod = totalMod >= 0 ? `+${totalMod}` : totalMod;

    return (
      <div key={key} className="flex items-center gap-2 group cursor-pointer" onClick={() => toggleProficiency(key)}>
        <div className={`w-3 h-3 rounded-full border border-slate-600 transition-all ${isProficient ? "bg-indigo-500 border-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.4)]" : "bg-transparent group-hover:bg-slate-800"}`} />
        <span className="text-[10px] font-mono text-slate-500 w-6 text-center">{displayMod}</span>
        <span className={`text-[10px] font-bold uppercase tracking-tight transition-colors ${isProficient ? "text-white" : "text-slate-500 group-hover:text-slate-400"}`}>
          {label}
          {baseAbilityKey && <span className="ml-1 opacity-40 font-normal">({baseAbilityKey.slice(0,3)})</span>}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Saving Throws */}
      <div className="bg-bento-card border border-bento-border rounded-xl p-4 shadow-lg">
        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 pb-2 border-b border-slate-800">Saving Throws</h4>
        <div className="space-y-2">
          {ABILITIES.map(a => renderCheckItem(`save_${a.key}`, a.label, a.key))}
        </div>
      </div>

      {/* Skills */}
      <div className="bg-bento-card border border-bento-border rounded-xl p-4 shadow-lg">
        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 pb-2 border-b border-slate-800">Skills</h4>
        <div className="space-y-2">
          {SKILLS.map(s => renderCheckItem(s.key, s.label, s.ability))}
        </div>
      </div>

      {/* Passive Perception */}
      <div className="bg-bento-card border border-bento-border rounded-xl p-4 shadow-lg flex flex-col items-center justify-center">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Passive Wis</span>
        <div className="text-[8px] italic text-slate-600 mb-2 leading-none">(Perception)</div>
        <input 
          type="number"
          value={stats.passivePerception ?? 10}
          onChange={(e) => onUpdate({ passivePerception: e.target.value === "" ? "" : parseInt(e.target.value) })}
          onBlur={() => { if (!stats.passivePerception && stats.passivePerception !== 0) onUpdate({ passivePerception: 10 }) }}
          className="bg-transparent border-none p-0 text-3xl font-black text-white w-full text-center focus:ring-0 appearance-none"
        />
      </div>
    </div>
  );
}
