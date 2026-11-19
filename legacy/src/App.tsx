import React, { useState, useEffect } from "react";
import { CharacterStats, Spell, GeneratorSettings } from "./types";
import { SORCERER_LEVEL_TABLE } from "./constants";
import { IdentitySection } from "./components/IdentitySection";
import { AbilityScores } from "./components/AbilityScores";
import { SavingThrowsAndSkills } from "./components/SavingThrowsAndSkills";
import { VitalsSection } from "./components/VitalsSection";
import { MagicResources } from "./components/MagicResources";
import { BioSection } from "./components/BioSection";
import { InventorySection } from "./components/InventorySection";
import { WildMagicSection } from "./components/WildMagicSection";
import { SpellList } from "./components/SpellList";
import { AttacksTable } from "./components/AttacksTable";
import { ChatBox } from "./components/ChatBox";
import { GeneratorTab } from "./components/GeneratorTab";
import { filterSpellPool, getRandomSpells } from "./lib/spells";
import { 
  Sparkles, 
  Settings2, 
  LayoutDashboard, 
  RotateCcw,
  Zap,
  Skull,
  User,
  Wand2,
  Backpack,
  Scroll,
  Download,
  Upload as UploadIcon,
  X,
  CloudUpload,
  CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { parseSpellsCSV } from "./lib/spells";
import Papa from "papaparse";
import { auth, db, handleFirestoreError, OperationType } from "./lib/firebase";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { FileText } from "lucide-react";
import { exportToDndSheetPdf } from "./lib/exportPdf";

const STORAGE_KEY = "wild_magic_sorcerer_full_data";

const DEFAULT_STATS: CharacterStats = {
  name: "Alaric Stormborn",
  class: "Sorcerer",
  level: 1,
  background: "Hermit",
  playerName: "",
  race: "Wild Elf",
  alignment: "Chaotic Neutral",
  xp: "0",
  
  charisma: 16,
  strength: 10,
  dexterity: 14,
  constitution: 14,
  intelligence: 10,
  wisdom: 12,

  proficiencies: ["save_constitution", "save_charisma", "arcana", "persuasion"],
  inspiration: false,
  
  hpMax: 8,
  hpCurrent: 8,
  hpTemp: 0,
  hitDiceMax: "1d6",
  hitDiceCurrent: 1,
  
  armorClass: 12,
  mageArmor: false,
  initiative: 2,
  speed: "30 ft",

  deathSaves: { successes: 0, failures: 0 },

  personalityTraits: "I am deaf to the world, but the magic screams.",
  ideals: "Chaos. The weave is a river, not a clock.",
  bonds: "I search for the catalyst of my first surge.",
  flaws: "I am unpredictable when under pressure.",
  features: "Wild Magic Surge, Tides of Chaos",
  backstory: "Born in a lightning storm on the astral plane...",

  attacks: [
    { name: "Dagger", bonus: "+4", damage: "1d4+2 piercing" },
    { name: "Fire Bolt", bonus: "+5", damage: "1d10 fire" }
  ],
  equipment: "Dagger, Arcane Focus (Crystal), Component Pouch, Explorer's Pack",
  currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 },
  otherProficiencies: "Common, Elvish, Sylvan, Herbalism Kit",

  proficiencyBonus: 2,
  spellSaveDC: 13,
  spellAttackBonus: 5,
  sorceryPointsMax: 0,
  sorceryPointsCurrent: 0,
  tidesOfChaosUsed: false,
  slotsMax: {},
  slotsCurrent: {},
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "generator" | "character">("dashboard");
  const [character, setCharacter] = useState<CharacterStats>(DEFAULT_STATS);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  
  // Spells
  const [database, setDatabase] = useState<Spell[]>([]);
  const [activeSpells, setActiveSpells] = useState<Spell[]>([]);
  const [permanentSpellNames, setPermanentSpellNames] = useState<string[]>([]);
  const [spellSearchTerm, setSpellSearchTerm] = useState("");
  const [showSpellSearch, setShowSpellSearch] = useState(false);
  
  const searchResults = React.useMemo(() => {
     if (spellSearchTerm.length < 2) return [];
     const query = spellSearchTerm.toLowerCase();
     return database
        .filter(s => s.name.toLowerCase().includes(query) && !permanentSpellNames.includes(s.name))
        .slice(0, 8);
  }, [spellSearchTerm, database, permanentSpellNames]);
  
  // Generator Settings
  const [settings, setSettings] = useState<GeneratorSettings>({
    classes: ["Sorcerer"],
    schools: [],
    excludeClasses: false,
    excludeSchools: false,
    excludeWeaponComponents: true,
    dailyCantrips: 1,
    dailyLeveledSpells: 2,
  });

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.character) setCharacter(data.character);
            if (data.database && data.database.length > 0) setDatabase(data.database);
            if (data.activeSpells) setActiveSpells(data.activeSpells);
            if (data.permanentSpellNames) setPermanentSpellNames(data.permanentSpellNames);
            if (data.settings) setSettings(data.settings);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        } finally {
          setIsDataLoaded(true);
        }
      } else {
        setIsDataLoaded(true);
      }
    });
    return unsub;
  }, []);

  // Derived calculations
  useEffect(() => {
    const levelData = SORCERER_LEVEL_TABLE.find(l => l.level === character.level) || SORCERER_LEVEL_TABLE[0];
    const chaVal = typeof character.charisma === "number" ? character.charisma : 10;
    const dexVal = typeof character.dexterity === "number" ? character.dexterity : 10;
    const chaMod = Math.floor((chaVal - 10) / 2);
    
    setCharacter(prev => ({
      ...prev,
      proficiencyBonus: levelData.prof,
      spellSaveDC: 8 + levelData.prof + chaMod,
      spellAttackBonus: levelData.prof + chaMod,
      sorceryPointsMax: levelData.points,
      slotsMax: levelData.slots,
      initiative: Math.floor((dexVal - 10) / 2)
    }));
  }, [character.level, character.charisma, character.dexterity]);

  // Load from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.character) setCharacter(data.character);
        setDatabase(data.database || []);
        setActiveSpells(data.activeSpells || []);
        setPermanentSpellNames(data.permanentSpellNames || []);
        if (data.settings) setSettings(data.settings);
      } catch (e) {
        console.error("Failed to load saved state", e);
      }
    }

    if (!saved || (JSON.parse(saved).database || []).length === 0) {
      fetch("/spells.csv").then(res => res.text()).then(text => {
            try {
                const parsed = parseSpellsCSV(text);
                if (parsed.length > 0) setDatabase(parsed);
            } catch(err) { console.error(err); }
        }).catch(console.error);
    }
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    if (!isDataLoaded) return;
    
    const data = {
      character,
      database,
      activeSpells,
      permanentSpellNames,
      settings,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [character, database, activeSpells, permanentSpellNames, settings, isDataLoaded]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const syncToCloud = async () => {
    if (!authUser) return;
    setIsSyncing(true);
    try {
      const data = {
        character,
        database,
        activeSpells,
        permanentSpellNames,
        settings,
      };
      const docRef = doc(db, "users", authUser.uid);
      await setDoc(docRef, data, { merge: true });
      setLastSyncTime(new Date());
    } catch (err) {
       console.error("Error syncing to cloud:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateCharacter = (updates: Partial<CharacterStats>) => {
    setCharacter(prev => ({ ...prev, ...updates }));
  };

  const handleExport = () => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return;
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${character.name.replace(/\s+/g, '_') || "character"}-wild-magic.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.character) setCharacter(data.character);
        if (data.database) setDatabase(data.database);
        if (data.activeSpells) setActiveSpells(data.activeSpells);
        if (data.permanentSpellNames) setPermanentSpellNames(data.permanentSpellNames);
        if (data.settings) setSettings(data.settings);
    } catch (err) {
        console.error(err);
        alert("Failed to parse character JSON.");
    } finally {
        e.target.value = "";
    }
  };

  const handleShuffle = () => {
    if (database.length === 0) {
      alert("Please upload a spell database first in the Generator tab!");
      setActiveTab("generator");
      return;
    }

    const filteredPool = filterSpellPool(database, settings);
    const newSpells: Spell[] = [];

    const currentPermanents = database
      .filter(s => permanentSpellNames.includes(s.name))
      .map(s => ({ ...s, isPermanent: true }));
    
    newSpells.push(...currentPermanents);

    const levels = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
    
    levels.forEach(lvl => {
      const isLeveled = lvl !== "Cantrip";
      const maxForLevel = isLeveled ? character.slotsMax[lvl] : 4;
      
      if (maxForLevel > 0) {
        const rawToRoll = isLeveled ? settings.dailyLeveledSpells : settings.dailyCantrips;
        const toRoll = typeof rawToRoll === "number" ? rawToRoll : 0;
        
        if (toRoll > 0) {
          const availablePool = filteredPool.filter(s => !permanentSpellNames.includes(s.name));
          const rolled = getRandomSpells(availablePool, toRoll, lvl);
          newSpells.push(...rolled);
        }
      }
    });

    setActiveSpells(newSpells);
  };

  const handleRerollSingle = (index: number) => {
    const spell = activeSpells[index];
    const filteredPool = filterSpellPool(database, settings);
    const activeNames = activeSpells.map(s => s.name);
    const availablePool = filteredPool.filter(s => !activeNames.includes(s.name));
    const [newSpell] = getRandomSpells(availablePool, 1, spell.level);
    
    if (newSpell) {
      const next = [...activeSpells];
      next[index] = newSpell;
      setActiveSpells(next);
    }
  };

  const togglePermanent = (spellName: string) => {
    setPermanentSpellNames(prev => {
      const exists = prev.includes(spellName);
      if (exists) return prev.filter(n => n !== spellName);
      return [...prev, spellName];
    });

    setActiveSpells(prev => prev.map(s => 
      s.name === spellName 
        ? { ...s, isPermanent: !s.isPermanent }
        : s
    ));
  };

  return (
    <div className="min-h-screen bg-bento-bg text-slate-200 font-sans selection:bg-indigo-500/30">
      <div className="max-w-[1700px] mx-auto p-4 md:p-6 space-y-6">
        {/* Navigation / Header */}
        <header className="bg-bento-card border border-bento-border rounded-2xl p-4 flex flex-col lg:flex-row items-center justify-between shadow-xl gap-6">
          <div className="flex flex-col sm:flex-row items-center justify-between w-full lg:w-auto gap-4">
             <div className="flex items-center gap-4 self-start sm:self-auto w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-fuchsia-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-xl font-black tracking-tight text-white leading-tight truncate max-w-[150px] sm:max-w-none">
                      {character.name || "Unnamed Sorcerer"}
                    </h1>
                    <p className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">
                      {character.race} {character.class} · Lv. {character.level}
                    </p>
                  </div>
                </div>

                {/* Mobile Extra Sync Controls - Top Right on smallest screens */}
                <div className="sm:hidden flex items-center gap-1.5 shrink-0">
                  <button onClick={() => exportToDndSheetPdf(character, activeSpells, setIsExportingPdf)} disabled={isExportingPdf} className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white" title="Export PDF">
                    <FileText className="w-4 h-4" />
                  </button>
                  {authUser ? (
                      <div className="flex items-center gap-1.5">
                         <button onClick={syncToCloud} disabled={isSyncing} className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-900/40">
                            <CloudUpload className="w-4 h-4" />
                         </button>
                         <button onClick={handleLogout} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white" title="Disconnect">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                         </button>
                      </div>
                   ) : (
                      <button onClick={handleLogin} className="px-2.5 py-2 text-[8px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-900/40">
                         Login
                      </button>
                   )}
                </div>
             </div>

             {/* Tablet / Small Desktop controls (Sync, Import/Export) */}
             <div className="hidden sm:flex xl:hidden items-center gap-2">
                 <button onClick={() => exportToDndSheetPdf(character, activeSpells, setIsExportingPdf)} disabled={isExportingPdf} className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white" title="Export PDF">
                   <FileText className="w-4 h-4" />
                 </button>
                 <button onClick={handleExport} className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white" title="Export JSON"><Download className="w-4 h-4" /></button>
                 <div className="relative">
                    <input type="file" accept=".json" onChange={handleImport} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    <button className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white pointer-events-none"><UploadIcon className="w-4 h-4" /></button>
                 </div>
                 
                 {authUser ? (
                    <div className="flex items-center gap-2">
                       <button onClick={syncToCloud} disabled={isSyncing} className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-900/40">
                          <CloudUpload className="w-4 h-4" />
                       </button>
                       <button onClick={handleLogout} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white" title="Disconnect">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                       </button>
                    </div>
                 ) : (
                    <button onClick={handleLogin} className="px-3 py-2 text-[9px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-900/40">
                       Login
                    </button>
                 )}
             </div>
          </div>

          <nav className="w-full lg:w-auto flex items-center bg-bento-bg p-1.5 rounded-2xl border border-bento-border shadow-inner">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex-1 flex justify-center items-center gap-1.5 sm:gap-2 px-2 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === "dashboard" ? "bg-slate-800 text-white shadow-xl" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" /> Hub
            </button>
            <button
              onClick={() => setActiveTab("character")}
              className={`flex-1 flex justify-center items-center gap-1.5 sm:gap-2 px-2 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === "character" ? "bg-slate-800 text-white shadow-xl" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <User className="w-4 h-4" /> Sheet
            </button>
            <button
              onClick={() => setActiveTab("generator")}
              className={`flex-1 flex justify-center items-center gap-1.5 sm:gap-2 px-2 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === "generator" ? "bg-slate-800 text-white shadow-xl" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Settings2 className="w-4 h-4" /> Matrix
            </button>
          </nav>

          <div className="hidden xl:flex items-center gap-8">
            <div className="text-center group">
              <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Proficiency</p>
              <p className="text-2xl font-mono text-fuchsia-400 font-black">+{character.proficiencyBonus}</p>
            </div>
            <div className="text-center group">
              <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Spell DC</p>
              <p className="text-2xl font-mono text-fuchsia-400 font-black">{character.spellSaveDC}</p>
            </div>
            <div className="text-center group">
              <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Attack</p>
              <p className="text-2xl font-mono text-fuchsia-400 font-black">+{character.spellAttackBonus}</p>
            </div>
            <div className="w-px h-8 bg-bento-border hidden lg:block" />
            <div className="flex items-center gap-2">
               <button 
                 onClick={() => exportToDndSheetPdf(character, activeSpells, setIsExportingPdf)}
                 disabled={isExportingPdf}
                 className="p-2.5 bg-indigo-600/20 rounded-xl border border-indigo-500/30 text-indigo-400 hover:text-indigo-300 hover:border-indigo-500/50 hover:bg-indigo-600/30 transition-all font-black uppercase tracking-widest text-[9px] flex items-center gap-2"
                 title="Export D&D PDF Sheet"
               >
                 <FileText className="w-3.5 h-3.5" />
                 {isExportingPdf ? "Generating..." : "Get PDF"}
               </button>
               <button 
                 onClick={handleExport}
                 className="p-2.5 bg-bento-bg rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
                 title="Export State JSON"
               >
                 <Download className="w-4 h-4" />
               </button>
               <div className="relative" title="Import State JSON">
                  <input type="file" accept=".json" onChange={handleImport} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <button className="p-2.5 bg-bento-bg rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition-all pointer-events-none">
                    <UploadIcon className="w-4 h-4" />
                  </button>
               </div>
               
               <div className="w-px h-8 bg-bento-border hidden lg:block mx-1" />
               {authUser ? (
                 <div className="flex items-center gap-3">
                   <div className="flex flex-col text-right">
                     {lastSyncTime ? (
                         <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Synced {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </span>
                     ) : (
                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Local Only</span>
                     )}
                     <span className="text-[10px] text-slate-500 max-w-[100px] truncate">{authUser.email}</span>
                   </div>
                   <button
                     onClick={syncToCloud}
                     disabled={isSyncing}
                     className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/40 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     <CloudUpload className="w-3.5 h-3.5" />
                     {isSyncing ? "Saving..." : "Save Cloud"}
                   </button>
                   <div className="w-px h-8 bg-bento-border hidden lg:block mx-1" />
                   <button 
                     onClick={handleLogout}
                     className="px-4 py-2 bg-slate-800 hover:bg-slate-700/50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                   >
                     Disconnect
                   </button>
                 </div>
               ) : (
                 <button 
                   onClick={handleLogin}
                   className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/40"
                 >
                   Login to Sync
                 </button>
               )}
            </div>
          </div>
        </header>

        <main className="pb-24">
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-12 gap-6"
              >
                {/* Mobile Extra Stats */}
                <div className="col-span-12 xl:hidden grid grid-cols-3 gap-4">
                  <div className="bg-bento-card border border-bento-border rounded-xl p-3 flex flex-col items-center justify-center shadow-xl">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Proficiency</span>
                    <span className="text-xl font-mono font-black text-fuchsia-400">+{character.proficiencyBonus}</span>
                  </div>
                  <div className="bg-bento-card border border-bento-border rounded-xl p-3 flex flex-col items-center justify-center shadow-xl">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Spell DC</span>
                    <span className="text-xl font-mono font-black text-fuchsia-400">{character.spellSaveDC}</span>
                  </div>
                  <div className="bg-bento-card border border-bento-border rounded-xl p-3 flex flex-col items-center justify-center shadow-xl">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Attack</span>
                    <span className="text-xl font-mono font-black text-fuchsia-400">+{character.spellAttackBonus}</span>
                  </div>
                </div>

                {/* Hub Row 1: Vitals & Core Resources */}
                <div className="col-span-12">
                   <VitalsSection stats={character} onUpdate={updateCharacter} />
                </div>

                <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
                  <WildMagicSection onSurge={() => updateCharacter({ tidesOfChaosUsed: false })} />
                  
                  <AttacksTable stats={character} onUpdate={updateCharacter} />

                  <MagicResources stats={character} onUpdate={updateCharacter} />

                  <div className="bg-bento-card border border-bento-border rounded-2xl p-3 flex flex-row items-center justify-between shadow-xl">
                    <div>
                      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Rest</h3>
                      <p className="text-[9px] text-slate-600 italic font-medium mt-1">Restores HP, Hit Dice, <br/>Spell Slots, & SP.</p>
                    </div>
                    <button 
                      onClick={() => {
                        updateCharacter({
                          sorceryPointsCurrent: character.sorceryPointsMax,
                          tidesOfChaosUsed: false,
                          slotsCurrent: { ...character.slotsMax },
                          hpCurrent: character.hpMax,
                          hitDiceCurrent: parseInt(character.hitDiceMax) || character.level
                        });
                      }}
                      className="px-4 py-3 rounded-xl border border-slate-800 bg-slate-800 shadow-xl hover:bg-slate-700 text-white transition-all text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 group"
                    >
                       <RotateCcw className="w-3 h-3 group-hover:-rotate-90 transition-transform duration-500" />
                       Long Rest
                    </button>
                  </div>
                </div>

                {/* Hub Row 2: Spell Book */}
                <div className="col-span-12 lg:col-span-8 bg-bento-card border border-bento-border rounded-3xl p-8 shadow-2xl space-y-8 relative">
                  <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
                     <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/5 blur-[100px] -mr-32 -mt-32 rounded-full" />
                  </div>
                  
                  <div className="flex flex-col gap-6 bg-bento-bg/40 p-6 rounded-2xl border border-slate-800 relative z-40">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                      <div>
                        <h2 className="text-2xl font-black uppercase tracking-tighter text-white flex items-center gap-3">
                          <Wand2 className="w-6 h-6 text-fuchsia-500" /> Spell Book
                        </h2>
                        <p className="text-[11px] text-slate-500 uppercase tracking-[0.2em] font-mono mt-1">Daily Spell Preparation</p>
                      </div>
                      <button 
                        onClick={handleShuffle}
                        className="w-full sm:w-auto px-10 py-4 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-xl shadow-fuchsia-900/40 transition-all hover:-translate-y-1 active:translate-y-0 text-sm font-black uppercase tracking-widest flex items-center justify-center gap-4 shrink-0"
                      >
                         <Zap className="w-5 h-5 fill-current" />
                         Engage Shuffle
                      </button>
                    </div>

                    <div className="relative mt-2">
                       <input 
                          type="text" 
                          placeholder="Search database to add permanent spell..."
                          value={spellSearchTerm}
                          onChange={(e) => {
                             setSpellSearchTerm(e.target.value);
                             setShowSpellSearch(true);
                          }}
                          onFocus={() => setShowSpellSearch(true)}
                          onBlur={() => setTimeout(() => setShowSpellSearch(false), 200)}
                          className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500 shadow-inner transition-all hover:bg-slate-900"
                       />
                       {showSpellSearch && searchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl z-50">
                             {searchResults.map(s => (
                                <button
                                   key={s.name}
                                   onClick={() => {
                                      setPermanentSpellNames(prev => [...prev, s.name]);
                                      setActiveSpells(prev => {
                                         const exists = prev.find(p => p.name === s.name);
                                         if (exists) return prev.map(p => p.name === s.name ? { ...p, isPermanent: true } : p);
                                         return [...prev, { ...s, isPermanent: true }];
                                      });
                                      setSpellSearchTerm("");
                                      setShowSpellSearch(false);
                                   }}
                                   className="w-full text-left px-4 py-3 hover:bg-slate-700 border-b border-white/5 last:border-0 flex justify-between items-center transition-colors"
                                >
                                   <span className="font-bold text-white text-sm">{s.name}</span>
                                   <span className="text-xs text-slate-400 font-mono">{s.level} | {s.classes.split(',')[0]}</span>
                                </button>
                             ))}
                          </div>
                       )}
                       {showSpellSearch && spellSearchTerm.length >= 2 && searchResults.length === 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-2xl text-center text-slate-400 text-sm italic z-50">
                             No matching spells found.
                          </div>
                       )}
                    </div>
                  </div>

                  <SpellList 
                    spells={activeSpells} 
                    onReroll={handleRerollSingle}
                    onTogglePermanent={togglePermanent}
                  />
                </div>
              </motion.div>
            )}

            {activeTab === "character" && (
              <motion.div
                key="character"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Mobile Extra Stats */}
                <div className="xl:hidden grid grid-cols-3 gap-4">
                  <div className="bg-bento-card border border-bento-border rounded-xl p-3 flex flex-col items-center justify-center shadow-xl">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Proficiency</span>
                    <span className="text-xl font-mono font-black text-fuchsia-400">+{character.proficiencyBonus}</span>
                  </div>
                  <div className="bg-bento-card border border-bento-border rounded-xl p-3 flex flex-col items-center justify-center shadow-xl">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Spell DC</span>
                    <span className="text-xl font-mono font-black text-fuchsia-400">{character.spellSaveDC}</span>
                  </div>
                  <div className="bg-bento-card border border-bento-border rounded-xl p-3 flex flex-col items-center justify-center shadow-xl">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Attack</span>
                    <span className="text-xl font-mono font-black text-fuchsia-400">+{character.spellAttackBonus}</span>
                  </div>
                </div>

                <IdentitySection stats={character} onUpdate={updateCharacter} />
                
                <div className="grid grid-cols-12 gap-6">
                   {/* Left Column: Abilities & Skills */}
                   <div className="col-span-12 md:col-span-4 lg:col-span-3 space-y-6">
                      <AbilityScores stats={character} onUpdate={updateCharacter} />
                      <SavingThrowsAndSkills stats={character} onUpdate={updateCharacter} />
                   </div>

                   {/* Right Column: Bio, Vitals, Inventory */}
                   <div className="col-span-12 md:col-span-8 lg:col-span-9 space-y-6">
                      <div className="grid grid-cols-1 gap-6">
                         <div className="flex items-center gap-3 px-2">
                            <User className="w-4 h-4 text-indigo-400" />
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Character Overview</h2>
                         </div>
                         <VitalsSection stats={character} onUpdate={updateCharacter} />
                         
                         <div className="flex items-center gap-3 px-2 mt-4">
                            <Scroll className="w-4 h-4 text-indigo-400" />
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Biographical Details & Features</h2>
                         </div>
                         <BioSection stats={character} onUpdate={updateCharacter} />

                         <div className="flex items-center gap-3 px-2 mt-4">
                            <Backpack className="w-4 h-4 text-indigo-400" />
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Material Inventory</h2>
                         </div>
                         <InventorySection stats={character} onUpdate={updateCharacter} />
                      </div>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === "generator" && (
              <motion.div
                key="generator"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="max-w-5xl mx-auto"
              >
                <GeneratorTab 
                  settings={settings}
                  onUpdateSettings={setSettings}
                  database={database}
                  onUploadCSV={(spells) => {
                    setDatabase(spells);
                    setActiveSpells(prev => prev.map(s => {
                      const match = spells.find(ds => ds.name === s.name);
                      return match ? { ...match, isPermanent: s.isPermanent } : s;
                    }));
                  }}
                  spellCount={database.length}
                  onClearDatabase={() => {
                      setDatabase([]);
                      setPermanentSpellNames([]);
                      setActiveSpells([]);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Database Warning removed per instructions */}
      <ChatBox />
    </div>
  );
}
