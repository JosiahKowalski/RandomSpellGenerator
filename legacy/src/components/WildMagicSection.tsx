import React, { useState } from "react";
import { WILD_MAGIC_TABLE } from "../constants";
import { Dices, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const WildMagicSection: React.FC<{ onSurge?: () => void }> = ({ onSurge }) => {
  const [roll, setRoll] = useState<number | null>(null);
  const [effect, setEffect] = useState<string | null>(null);

  const rollSurge = () => {
    const r = Math.floor(Math.random() * 100) + 1;
    setRoll(r);
    
    const found = WILD_MAGIC_TABLE.find(item => {
      const [start, end] = item.roll.split("-").map(n => parseInt(n));
      const adjustedEnd = end === 0 ? 100 : end;
      return r >= start && r <= adjustedEnd;
    });

    setEffect(found ? found.effect : "Unknown effect. Consulting the weave...");
    if (onSurge) onSurge();
  };

  return (
    <div id="wild-magic-container">
      <div className="bg-bento-card border border-bento-border rounded-2xl p-4 relative overflow-hidden shadow-xl group transition-all min-h-[220px] flex flex-col justify-center">
        {/* Ambient Magical Background Glow */}
        <div className="absolute -inset-[100px] bg-gradient-to-tr from-fuchsia-500/5 via-transparent to-indigo-500/5 blur-[80px] pointer-events-none group-hover:from-fuchsia-500/10 group-hover:to-indigo-500/10 transition-colors duration-1000" />
        
        {/* Background Decoration */}
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform duration-1000 ease-out">
          <Dices className="w-48 h-48 text-fuchsia-400" />
        </div>

        <div className="flex flex-col gap-4 relative z-10">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-fuchsia-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-fuchsia-500/20">
               <Dices className="w-4 h-4" />
             </div>
             <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Wild Magic</h3>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {roll ? (
                <motion.div
                  key={roll}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-4xl lg:text-5xl font-black font-mono text-fuchsia-400 drop-shadow-[0_0_10px_rgba(232,121,249,0.3)]">#{roll.toString().padStart(2, '0')}</span>
                    <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 to-transparent" />
                  </div>
                  <p className="text-slate-300 text-[15px] leading-relaxed font-serif italic bg-slate-950/50 p-5 rounded-2xl border border-white/5 shadow-inner">
                    "{effect}"
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-slate-500 italic font-serif text-lg text-center py-10 opacity-40 border-y border-slate-800"
                >
                  "The Weave trembles... waiting for your command."
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={rollSurge}
            className="w-full relative overflow-hidden group/btn flex items-center justify-center py-4 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 border border-slate-700/50 text-white rounded-2xl shadow-xl transition-all active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-600/20 to-indigo-600/20 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
            <div className="relative z-10 hidden sm:flex items-center mr-3">
              <RefreshCw className="w-5 h-5 text-slate-400 group-hover/btn:rotate-180 transition-transform duration-700" />
            </div>
            <span className="relative z-10 text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
              <Dices className="w-4 h-4 sm:hidden" />
              Trigger Surge (d100)
            </span>
          </button>

          {roll && (
            <div className="flex justify-end absolute top-0 right-0">
              <button
                 onClick={() => { setRoll(null); setEffect(null); }}
                 className="text-slate-600 hover:text-slate-300 transition-colors flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700"
                 title="Clear Outcome"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
