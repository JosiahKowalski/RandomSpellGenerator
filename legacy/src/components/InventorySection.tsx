import React from "react";
import { CharacterStats } from "../types";
import { Coins, Package } from "lucide-react";

interface InventorySectionProps {
  stats: CharacterStats;
  onUpdate: (updates: Partial<CharacterStats>) => void;
}

export function InventorySection({ stats, onUpdate }: InventorySectionProps) {
  const coins = [
    { key: "cp", label: "CP", color: "text-orange-400" },
    { key: "sp", label: "SP", color: "text-slate-300" },
    { key: "ep", label: "EP", color: "text-emerald-400" },
    { key: "gp", label: "GP", color: "text-yellow-500" },
    { key: "pp", label: "PP", color: "text-indigo-400" },
  ];

  const handleCoinChange = (key: string, val: string) => {
    onUpdate({
      currency: {
        ...stats.currency,
        [key]: val === "" ? "" : parseInt(val)
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Coinage */}
      <div className="lg:col-span-3 bg-bento-card border border-bento-border rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex items-center gap-2 mb-2">
           <Coins className="w-4 h-4 text-yellow-500" />
           <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Coinage</span>
        </div>
        
        <div className="space-y-3">
          {coins.map((coin) => (
            <div key={coin.key} className="flex items-center justify-between gap-4 group">
               <span className={`text-xs font-black p-1 w-8 text-center rounded border border-slate-800 bg-slate-900 ${coin.color}`}>
                  {coin.label}
               </span>
               <input
                 type="number"
                 value={stats.currency[coin.key as keyof typeof stats.currency]}
                 onChange={(e) => handleCoinChange(coin.key, e.target.value)}
                 onBlur={() => { if (stats.currency[coin.key as keyof typeof stats.currency] === "") handleCoinChange(coin.key, "0") }}
                 className="flex-1 bg-bento-bg/50 border border-bento-border rounded-lg p-2 text-sm font-mono text-white text-right focus:ring-1 focus:ring-indigo-500 transition-all appearance-none outline-none"
               />
            </div>
          ))}
        </div>
      </div>

      {/* Equipment List */}
      <div className="lg:col-span-6 bg-bento-card border border-bento-border rounded-xl p-5 shadow-xl flex flex-col">
        <div className="flex items-center gap-2 mb-3">
           <Package className="w-4 h-4 text-indigo-400" />
           <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Equipment & Belongings</span>
        </div>
        <textarea
          value={stats.equipment}
          onChange={(e) => onUpdate({ equipment: e.target.value })}
          className="flex-1 w-full bg-bento-bg/50 border border-bento-border rounded-lg p-3 text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
          placeholder="Backpack, rations, torches..."
        />
      </div>

      {/* Proficiencies */}
      <div className="lg:col-span-3 bg-bento-card border border-bento-border rounded-xl p-5 shadow-xl">
         <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-3">Other Proficiencies</span>
         <textarea
          value={stats.otherProficiencies}
          onChange={(e) => onUpdate({ otherProficiencies: e.target.value })}
          rows={10}
          className="w-full bg-bento-bg/50 border border-bento-border rounded-lg p-3 text-[10px] text-slate-400 focus:ring-1 focus:ring-indigo-500 transition-all resize-none font-mono"
          placeholder="Languages, Tools, Armor, Weapons..."
        />
      </div>
    </div>
  );
}
