import React from "react";
import { CharacterStats } from "../types";

interface BioSectionProps {
  stats: CharacterStats;
  onUpdate: (updates: Partial<CharacterStats>) => void;
}

export function BioSection({ stats, onUpdate }: BioSectionProps) {
  const fields = [
    { key: "personalityTraits", label: "Personality Traits" },
    { key: "ideals", label: "Ideals" },
    { key: "bonds", label: "Bonds" },
    { key: "flaws", label: "Flaws" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Roleplay Hooks */}
      <div className="space-y-4">
        <div className="bg-bento-card border border-bento-border rounded-xl p-5 shadow-xl grid gap-5">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{field.label}</label>
              <textarea
                value={stats[field.key as keyof CharacterStats] as string}
                onChange={(e) => onUpdate({ [field.key]: e.target.value })}
                rows={2}
                className="w-full bg-bento-bg/50 border border-bento-border rounded-lg p-3 text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 transition-all resize-none italic"
              />
            </div>
          ))}
        </div>
        
        <div className="bg-bento-card border border-bento-border rounded-xl p-5 shadow-xl">
           <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Backstory</label>
           <textarea
              value={stats.backstory}
              onChange={(e) => onUpdate({ backstory: e.target.value })}
              rows={6}
              className="w-full bg-bento-bg/50 border border-bento-border rounded-lg p-3 text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
              placeholder="The origins of your wild magic..."
           />
        </div>
      </div>

      {/* Features & Traits */}
      <div className="bg-bento-card border border-bento-border rounded-xl p-5 shadow-xl h-full flex flex-col">
        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Features & Traits</label>
        <textarea
          value={stats.features}
          onChange={(e) => onUpdate({ features: e.target.value })}
          className="flex-1 w-full bg-bento-bg/50 border border-bento-border rounded-lg p-3 text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
          placeholder="Class features, racial traits, etc..."
        />
      </div>
    </div>
  );
}
