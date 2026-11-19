import React, { useMemo, useState } from "react";
import { Spell, GeneratorSettings } from "../types";
import { CLASSES_LIST, SCHOOLS_OF_MAGIC } from "../constants";
import { Upload, X, Filter, Settings2, Trash2, Skull, Database, ChevronUp, ChevronDown } from "lucide-react";
import Papa from "papaparse";
import { parseSpellsCSV, filterSpellPool } from "../lib/spells";

interface GeneratorTabProps {
  settings: GeneratorSettings;
  onUpdateSettings: (settings: GeneratorSettings) => void;
  onUploadCSV: (spells: Spell[]) => void;
  spellCount: number;
  onClearDatabase: () => void;
  database: Spell[];
}

export const GeneratorTab: React.FC<GeneratorTabProps> = ({ 
  settings, 
  onUpdateSettings, 
  onUploadCSV,
  spellCount,
  onClearDatabase,
  database
}) => {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const csvText = await file.text();
      const spells = parseSpellsCSV(csvText);
      onUploadCSV(spells);
    } catch (err) {
      console.error("Failed to read CSV:", err);
    } finally {
      e.target.value = "";
    }
  };

  const toggleClass = (cls: string) => {
    const next = settings.classes.includes(cls)
      ? settings.classes.filter(c => c !== cls)
      : [...settings.classes, cls];
    onUpdateSettings({ ...settings, classes: next });
  };

  const toggleSchool = (sch: string) => {
    const next = settings.schools.includes(sch)
      ? settings.schools.filter(s => s !== sch)
      : [...settings.schools, sch];
    onUpdateSettings({ ...settings, schools: next });
  };

  const [sortColumn, setSortColumn] = useState<"name" | "level" | "school">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const filteredSpells = useMemo(() => {
    const list = filterSpellPool(database, settings);
    return list.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      let comp = 0;
      if (sortColumn === "level") {
         const getLvl = (val: any) => {
             const str = String(val).toLowerCase();
             if (str === "cantrip") return 0;
             return parseInt(str.replace(/\D/g, '')) || 0;
         };
         comp = getLvl(aVal) - getLvl(bVal);
      } else {
         comp = String(aVal).localeCompare(String(bVal));
      }
      
      return sortDirection === "asc" ? comp : -comp;
    });
  }, [database, settings, sortColumn, sortDirection]);

  const handleSort = (col: "name" | "level" | "school") => {
    if (sortColumn === col) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ col }: { col: "name" | "level" | "school" }) => {
    if (sortColumn !== col) return null;
    return sortDirection === "asc" ? <ChevronUp className="inline w-3 h-3 ml-1" /> : <ChevronDown className="inline w-3 h-3 ml-1" />;
  };

  return (
    <div id="generator-tab" className="space-y-6">
      {/* CSV Upload - Bento Block */}
      <section className="bg-bento-card border border-bento-border rounded-2xl p-6 shadow-xl relative overflow-hidden group">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Upload className="w-4 h-4 text-indigo-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Core Repository</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Spell Database</h2>
            <p className="text-slate-400 text-sm mt-1 max-w-md">
              Inject knowledge into the shuffle engine using a 5eTools formatted CSV.
            </p>
          </div>
          
          {spellCount > 0 && (
            <div className="flex items-center gap-4 bg-bento-bg/50 p-2 pl-4 rounded-xl border border-bento-border">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Loaded Spells</span>
                <span className="text-sm font-mono text-indigo-400 font-bold">{spellCount}</span>
              </div>
              <button 
                onClick={onClearDatabase}
                className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                title="Wipe Database"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
          />
          <div className="relative z-10 border-2 border-dashed border-slate-800 group-hover:border-indigo-500/50 rounded-2xl p-12 flex flex-col items-center justify-center transition-all bg-black/20 overflow-hidden">
            <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Upload className="w-12 h-12 text-slate-700 group-hover:text-indigo-400 mb-4 transition-transform group-hover:-translate-y-1 duration-500" />
            <p className="text-slate-500 font-bold group-hover:text-slate-200 text-center">
              Drop Spells.csv here or <span className="text-indigo-400">browse disk</span>
            </p>
            <p className="text-[10px] text-slate-600 mt-2 font-mono uppercase tracking-[0.2em]">Validated Matrix Entry</p>
          </div>
        </div>
      </section>

      {/* Engine Settings - Bento Grid Partition */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Logic Grid */}
        <div className="md:col-span-8 bg-bento-card border border-bento-border rounded-2xl p-6 shadow-xl space-y-8">
           <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-white flex items-center gap-3">
                <Settings2 className="w-5 h-5 text-fuchsia-500" /> Engine Logic
              </h2>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Classes */}
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Filter className="w-3 h-3" /> Class Affinity</span>
                  <button 
                    onClick={() => onUpdateSettings({ ...settings, excludeClasses: !settings.excludeClasses })}
                    className={`ml-2 px-2 py-0.5 rounded text-[8px] border transition-all ${
                      settings.excludeClasses 
                        ? "bg-red-900/40 text-red-400 border-red-500/50 hover:bg-red-900/60" 
                        : "bg-emerald-900/40 text-emerald-400 border-emerald-500/50 hover:bg-emerald-900/60"
                    }`}
                  >
                    {settings.excludeClasses ? "Mode: EXCLUDE" : "Mode: INCLUDE"}
                  </button>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CLASSES_LIST.map(cls => (
                    <button
                      key={cls}
                      onClick={() => toggleClass(cls)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border uppercase tracking-tighter ${
                        settings.classes.includes(cls)
                          ? "bg-fuchsia-600 border-fuchsia-500 text-white shadow-lg shadow-fuchsia-900/40"
                          : "bg-slate-800/40 border-slate-700/50 text-slate-500 hover:border-fuchsia-500/30"
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              </div>

              {/* Schools */}
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Filter className="w-3 h-3" /> Schools of Magic</span>
                  <button 
                    onClick={() => onUpdateSettings({ ...settings, excludeSchools: !settings.excludeSchools })}
                    className={`ml-2 px-2 py-0.5 rounded text-[8px] border transition-all ${
                      settings.excludeSchools 
                        ? "bg-red-900/40 text-red-400 border-red-500/50 hover:bg-red-900/60" 
                        : "bg-emerald-900/40 text-emerald-400 border-emerald-500/50 hover:bg-emerald-900/60"
                    }`}
                  >
                    {settings.excludeSchools ? "Mode: EXCLUDE" : "Mode: INCLUDE"}
                  </button>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SCHOOLS_OF_MAGIC.map(sch => (
                    <button
                      key={sch}
                      onClick={() => toggleSchool(sch)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border uppercase tracking-tighter ${
                        settings.schools.includes(sch)
                          ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40"
                          : "bg-slate-800/40 border-slate-700/50 text-slate-500 hover:border-indigo-500/30"
                      }`}
                    >
                      {sch}
                    </button>
                  ))}
                </div>
              </div>
           </div>
        </div>

        {/* Quantities - Vertical Bento Side */}
        <div className="md:col-span-4 flex flex-col gap-4">
           <div className="bg-bento-card border border-bento-border rounded-2xl p-6 shadow-xl flex-1 flex flex-col justify-center">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 block">Daily Cantrips</label>
              <div className="flex items-center gap-4">
                 <input 
                    type="number" 
                    value={settings.dailyCantrips}
                    onChange={(e) => onUpdateSettings({ ...settings, dailyCantrips: e.target.value === "" ? "" : parseInt(e.target.value) })}
                    onBlur={() => { if (settings.dailyCantrips === "") onUpdateSettings({ ...settings, dailyCantrips: 1 }) }}
                    className="bg-bento-bg border border-bento-border rounded-xl px-4 py-3 text-xl font-bold text-white w-full text-center focus:ring-1 focus:ring-fuchsia-500 transition-all outline-none"
                 />
              </div>
           </div>

           <div className="bg-bento-card border border-bento-border rounded-2xl p-6 shadow-xl flex-1 flex flex-col justify-center">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 block">Spells Per Level</label>
              <div className="flex items-center gap-4">
                 <input 
                    type="number" 
                    value={settings.dailyLeveledSpells}
                    onChange={(e) => onUpdateSettings({ ...settings, dailyLeveledSpells: e.target.value === "" ? "" : parseInt(e.target.value) })}
                    onBlur={() => { if (settings.dailyLeveledSpells === "") onUpdateSettings({ ...settings, dailyLeveledSpells: 1 }) }}
                    className="bg-bento-bg border border-bento-border rounded-xl px-4 py-3 text-xl font-bold text-white w-full text-center focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
                 />
              </div>
              <p className="text-[9px] text-slate-600 font-medium mt-2 italic text-center">Across all active slots.</p>
           </div>
        </div>

        {/* Full Width Toggles */}
        <div className="md:col-span-12 bg-bento-card border border-bento-border rounded-2xl p-5 shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-slate-800 rounded-xl">
                  <Skull className="w-5 h-5 text-slate-500" />
               </div>
               <div>
                  <h4 className="text-sm font-bold text-white">Exclude Weapon Components</h4>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Filter spells requiring costly or custom weapons</p>
               </div>
            </div>

            <div className="flex items-center gap-8">
               <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Exclude Weapons</span>
                  <button 
                    onClick={() => onUpdateSettings({ ...settings, excludeWeaponComponents: !settings.excludeWeaponComponents })}
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 ${settings.excludeWeaponComponents ? "bg-fuchsia-600 shadow-[0_0_12px_rgba(192,38,211,0.4)]" : "bg-slate-700"}`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.excludeWeaponComponents ? "translate-x-6" : ""}`} />
                  </button>
               </div>
            </div>
        </div>

        {/* Filtered Spells Preview */}
        <div className="md:col-span-12 bg-bento-card border border-bento-border rounded-2xl p-6 shadow-xl">
           <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black text-white flex items-center gap-3">
                <Database className="w-5 h-5 text-indigo-500" /> Matching Spells
              </h2>
              <div className="bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-lg">
                <span className="text-indigo-400 font-bold font-mono">{filteredSpells.length}</span>
                <span className="text-slate-500 text-[10px] uppercase font-black tracking-widest ml-2">Available</span>
              </div>
           </div>

           <div className="max-h-64 overflow-y-auto pr-2 custom-scrollbar">
             {filteredSpells.length > 0 ? (
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="border-b border-white/5">
                     <th onClick={() => handleSort("name")} className="py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer hover:text-slate-300">Name <SortIcon col="name" /></th>
                     <th onClick={() => handleSort("level")} className="py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden sm:table-cell cursor-pointer hover:text-slate-300">Level <SortIcon col="level" /></th>
                     <th onClick={() => handleSort("school")} className="py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden md:table-cell cursor-pointer hover:text-slate-300">School <SortIcon col="school" /></th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                   {filteredSpells.map((s, i) => (
                     <tr key={i} className="hover:bg-white/5 transition-colors">
                       <td className="py-2 text-sm text-slate-300 font-medium">{s.name}</td>
                       <td className="py-2 text-xs text-slate-400 hidden sm:table-cell">{s.level}</td>
                       <td className="py-2 text-xs text-slate-400 hidden md:table-cell">{s.school}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             ) : (
               <div className="text-center py-8 text-slate-500 text-sm font-medium italic">
                 No spells match your current logic constraints.
               </div>
             )}
           </div>
        </div>
      </section>
    </div>
  );
};
