import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Spell } from "../types";
import { 
  X, 
  ExternalLink, 
  RefreshCw, 
  Lock, 
  Unlock,
  MapPin,
  Clock,
  Timer,
  BookOpen,
  Info,
  Zap
} from "lucide-react";
import { getSpellUrl } from "../lib/spells";
import { motion, AnimatePresence } from "motion/react";

interface SpellCardProps {
  spell: Spell;
  isDaily?: boolean;
  onReroll?: () => void;
  onTogglePermanent?: () => void;
}

export const SpellCard: React.FC<SpellCardProps> = ({ spell, isDaily, onReroll, onTogglePermanent }) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div 
        className={`relative overflow-hidden transition-all duration-300 rounded-xl border flex flex-col justify-between cursor-pointer ${
          spell.isPermanent 
            ? "bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60" 
            : "bg-fuchsia-900/5 border-fuchsia-500/20 hover:bg-fuchsia-900/10 hover:border-fuchsia-500/30"
        } shadow-md`}
        onClick={() => setShowModal(true)}
      >
        <div className="p-4 flex items-center justify-between gap-3 select-none">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                spell.isPermanent ? "bg-slate-700 text-slate-300" : "bg-fuchsia-500/20 text-fuchsia-400"
              }`}>
                {spell.isPermanent ? "Permanent" : "Daily Roll"}
              </span>
              <span className="text-[9px] font-mono text-slate-500 uppercase">
                {spell.school}
              </span>
            </div>
            <h3 className={`text-base font-bold truncate flex items-center gap-2 ${
              spell.isPermanent ? "text-white" : "text-fuchsia-100"
            }`}>
              {spell.name}
              {spell.isPermanent && <Lock className="w-3 h-3 text-indigo-400 opacity-60" />}
            </h3>
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {isDaily && !spell.isPermanent && onReroll && (
              <button
                onClick={onReroll}
                className="p-2 text-slate-500 hover:text-fuchsia-400 hover:bg-fuchsia-400/10 rounded-lg transition-colors"
                title="Reroll Spell"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            {onTogglePermanent && (
              <button
                onClick={onTogglePermanent}
                className={`p-2 rounded-lg transition-colors ${
                  spell.isPermanent 
                    ? "text-indigo-400 bg-indigo-400/10 hover:bg-indigo-400/20" 
                    : "text-slate-500 hover:text-indigo-400 hover:bg-indigo-400/10"
                }`}
                title={spell.isPermanent ? "Unlock spell" : "Lock as permanent"}
              >
                {spell.isPermanent ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>
            )}
            <div className="w-px h-6 bg-slate-800/80 mx-1" />
            <button
               onClick={() => setShowModal(true)}
               className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
               title="View Details"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-8">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-0 animate-in fade-in duration-200"
            onClick={(e) => { e.stopPropagation(); setShowModal(false); }}
          />
          <div
            className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-300"
          >
                {/* Modal Header */}
                <div className="flex items-start justify-between p-5 sm:p-6 border-b border-slate-800/60 bg-slate-900/50">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                        spell.isPermanent ? "bg-slate-800 text-slate-300" : "bg-fuchsia-900/40 text-fuchsia-400"
                      }`}>
                        {spell.level} Level {spell.school}
                      </span>
                    </div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-2 mt-1">
                      {spell.name}
                    </h2>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowModal(false); }}
                    className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-colors bg-slate-900 shadow-sm border border-slate-800 relative z-50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
  
                {/* Modal Body */}
                <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                    <div>
                       <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Casting Time</p>
                       <p className="text-xs text-slate-300 flex items-center gap-1.5 font-medium"><Timer className="w-3.5 h-3.5 text-indigo-400" /> {spell.castingTime}</p>
                    </div>
                    <div>
                       <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Range</p>
                       <p className="text-xs text-slate-300 flex items-center gap-1.5 font-medium"><MapPin className="w-3.5 h-3.5 text-fuchsia-400" /> {spell.range}</p>
                    </div>
                    <div>
                       <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Duration</p>
                       <p className="text-xs text-slate-300 flex items-center gap-1.5 font-medium"><Clock className="w-3.5 h-3.5 text-emerald-400" /> {spell.duration}</p>
                    </div>
                    <div>
                       <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Components</p>
                       <p className="text-xs text-slate-300 flex items-center gap-1.5 font-medium"><BookOpen className="w-3.5 h-3.5 text-amber-400" /> <span className="truncate">{spell.components}</span></p>
                    </div>
                  </div>
  
                  {/* Text Area */}
                  <div className="space-y-4">
                    <div className="font-serif text-[15px] leading-relaxed text-slate-300 whitespace-pre-wrap">
                      {spell.text}
                    </div>
                    
                    {spell.atHigherLevels && (
                      <div className="p-4 bg-fuchsia-950/20 border border-fuchsia-900/30 rounded-xl mt-4">
                        <h4 className="font-black text-fuchsia-400 uppercase tracking-tighter text-[10px] mb-2 flex items-center gap-1.5">
                          <Zap className="w-3 h-3" /> At Higher Levels
                        </h4>
                        <p className="font-serif text-sm leading-relaxed text-fuchsia-100/80">
                          {spell.atHigherLevels}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
  
                {/* Modal Footer */}
                <div className="flex items-center justify-between p-4 sm:p-5 border-t border-slate-800/60 bg-slate-900/80 mt-auto">
                  <span className="text-[10px] text-slate-500 font-mono font-bold tracking-wider">
                     {spell.source} · PG {spell.page}
                  </span>
                  <a 
                    href={getSpellUrl(spell)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-indigo-500 text-white hover:bg-indigo-400 hover:shadow-lg hover:shadow-indigo-500/20 px-4 py-2 rounded-lg font-black uppercase tracking-tighter text-[10px] transition-all"
                  >
                    Source 5e.Tools <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>,
          document.body
        )}
    </>
  );
};

