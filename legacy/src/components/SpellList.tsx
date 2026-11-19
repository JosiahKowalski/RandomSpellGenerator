import React from "react";
import { Spell } from "../types";
import { SpellCard } from "./SpellCard";
import { Sparkles, History, Layers } from "lucide-react";

interface SpellListProps {
  spells: Spell[];
  onReroll: (index: number) => void;
  onTogglePermanent: (spellName: string) => void;
}

export const SpellList: React.FC<SpellListProps> = ({ spells, onReroll, onTogglePermanent }) => {
  const levels = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
  
  const groupedSpells = spells.reduce((acc, spell) => {
    const lvl = spell.level;
    if (!acc[lvl]) acc[lvl] = [];
    acc[lvl].push(spell);
    return acc;
  }, {} as Record<string, Spell[]>);

  if (spells.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-slate-800/50 rounded-3xl opacity-50">
        <Sparkles className="w-16 h-16 text-slate-800 mb-6 animate-pulse" />
        <h3 className="text-xl font-black text-slate-400 uppercase tracking-tighter">Spellbook Empty</h3>
        <p className="text-slate-600 max-w-sm mt-2 text-sm font-medium">
          The weave is silent. Perform a shuffle or upload data to detect active spells.
        </p>
      </div>
    );
  }

  return (
    <div id="spellbook-matrix" className="space-y-12">
      {levels.map(level => {
        const levelSpells = groupedSpells[level];
        if (!levelSpells || levelSpells.length === 0) return null;

        return (
          <section key={level} className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
               <div className="h-px flex-1 bg-slate-800/50" />
               <div className="flex items-center gap-3 bg-bento-bg px-4 py-1.5 rounded-full border border-slate-800">
                 <div className={`w-2 h-2 rounded-full ${level === "Cantrip" ? "bg-slate-500" : "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"}`} />
                 <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    {level} Level Spells
                 </h2>
               </div>
               <div className="h-px flex-1 bg-slate-800/50" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {levelSpells.map((spell) => {
                const originalIndex = spells.indexOf(spell);
                return (
                  <SpellCard
                    key={`${spell.name}-${originalIndex}`}
                    spell={spell}
                    isDaily={!spell.isPermanent}
                    onReroll={() => onReroll(originalIndex)}
                    onTogglePermanent={() => onTogglePermanent(spell.name)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};
