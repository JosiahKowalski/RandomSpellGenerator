import React, { useState, useRef, useEffect } from "react";
import { CharacterStats } from "../types";
import { Plus, Trash2, Search, Loader2 } from "lucide-react";
import { useOpen5eSearch, Open5eResult } from "../hooks/useOpen5e";

interface AttacksTableProps {
  stats: CharacterStats;
  onUpdate: (updates: Partial<CharacterStats>) => void;
}

function AttackRow({ 
  attack, 
  index, 
  onUpdateAttack, 
  onRemove 
}: { 
  attack: { name: string, bonus: string, damage: string }, 
  index: number, 
  onUpdateAttack: (index: number, updates: Partial<{ name: string, bonus: string, damage: string }>) => void, 
  onRemove: (index: number) => void 
}) {
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Use custom Open5e query for "all" types weapons & spells
  const { results, loading } = useOpen5eSearch(attack.name, "all");

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (r: Open5eResult) => {
    const updates: any = { name: r.name };
    if (r.damage_dice) {
      updates.damage = `${r.damage_dice} ${r.damage_type || ''}`.trim();
    }
    onUpdateAttack(index, updates);
    setFocused(false);
  };

  return (
    <div className="grid grid-cols-[1fr_80px_1fr_30px] gap-2 items-center bg-slate-800/50 rounded border border-slate-700/50 p-1 group">
      <div className="relative" ref={containerRef}>
        <input
          value={attack.name}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            onUpdateAttack(index, { name: e.target.value });
            setFocused(true);
          }}
          placeholder="Weapon/Spell"
          className="bg-transparent border-none text-xs font-medium text-slate-300 w-full focus:ring-1 focus:ring-indigo-500 px-1 py-1 rounded"
        />
        
        {/* Dropdown Suggestions */}
        {focused && attack.name.length >= 2 && (
          <div className="absolute z-[999] top-full left-0 mt-2 w-full min-w-[240px] bg-slate-950/95 border border-slate-700/50 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] max-h-72 overflow-y-auto overflow-x-hidden backdrop-blur-2xl ring-1 ring-white/10 animation-in fade-in slide-in-from-top-2 duration-200">
            {loading && (
              <div className="p-4 text-[10px] text-slate-400 flex items-center justify-center gap-2 uppercase font-black tracking-[0.2em] animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-indigo-500" /> Searching...
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="p-4 text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] text-center">No matches</div>
            )}
            {!loading && results.map((r, i) => (
              <button
                key={i}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-3 hover:bg-white/5 text-xs border-b border-white/5 last:border-none transition-all group/item flex flex-col gap-0.5"
              >
                <div className="font-black text-slate-100 group-hover/item:text-indigo-400 transition-colors uppercase tracking-tight">{r.name}</div>
                {r.damage_dice ? (
                  <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5 uppercase">
                    <span className="bg-slate-800 px-1 rounded text-[8px] text-slate-400">Weapon</span>
                    {r.damage_dice} {r.damage_type}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <span className="bg-indigo-500/20 text-indigo-400 px-1 rounded text-[8px]">Spell</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        value={attack.bonus}
        onChange={(e) => onUpdateAttack(index, { bonus: e.target.value })}
        placeholder="+0"
        className="bg-slate-900/50 border-none text-xs font-bold text-center text-slate-200 w-full rounded focus:ring-1 focus:ring-indigo-500 px-1 py-1"
      />
      <input
        value={attack.damage}
        onChange={(e) => onUpdateAttack(index, { damage: e.target.value })}
        placeholder="1d8 slsh"
        className="bg-transparent border-none text-xs text-slate-300 w-full focus:ring-1 focus:ring-indigo-500 px-1 py-1 rounded"
      />
      <button 
        onClick={() => onRemove(index)}
        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all flex items-center justify-center rounded"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export function AttacksTable({ stats, onUpdate }: AttacksTableProps) {
  const attacks = stats.attacks || [];

  const updateAttack = (index: number, updates: Partial<{ name: string, bonus: string, damage: string }>) => {
    const newAttacks = [...attacks];
    newAttacks[index] = { ...newAttacks[index], ...updates };
    onUpdate({ attacks: newAttacks });
  };

  const removeAttack = (index: number) => {
    const newAttacks = attacks.filter((_, i) => i !== index);
    onUpdate({ attacks: newAttacks });
  };

  const addAttack = () => {
    onUpdate({ attacks: [...attacks, { name: "", bonus: "", damage: "" }] });
  };

  return (
    <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6 shadow-xl relative z-50 backdrop-blur-xl">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="m14.5 9-6-6"/><path d="m5 10 3 3-5 5 1 4 4 1 5-5 3 3"/><path d="m17 7 4-1-1-4-4 1"/><path d="M12 12 5 19"/></svg>
      </div>

      <div className="flex items-center justify-between mb-4 relative z-10">
        <h3 className="text-xs font-black tracking-[0.2em] uppercase text-indigo-400">Attacks & Spellcasting</h3>
        <button 
          onClick={addAttack}
          className="bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 p-1 rounded transition-colors flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider"
        >
          <Plus className="w-3 h-3" /> Add Attack
        </button>
      </div>

      <div className="relative z-10">
        <div className="grid grid-cols-[1fr_80px_1fr_30px] gap-2 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2">
          <div>Name</div>
          <div className="text-center">ATK Bonus</div>
          <div>Damage/Type</div>
          <div></div>
        </div>

        <div className="flex flex-col gap-2">
          {attacks.map((attack, index) => (
            <AttackRow 
              key={index} 
              attack={attack} 
              index={index} 
              onUpdateAttack={updateAttack} 
              onRemove={removeAttack} 
            />
          ))}
          {attacks.length === 0 && (
             <div className="text-center p-4 text-xs font-medium text-slate-500 italic">No attacks listed.</div>
          )}
        </div>
      </div>
    </div>
  );
}
