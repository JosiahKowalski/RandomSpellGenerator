import React, { useState } from 'react';
import { Dices, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function DiceRoller() {
  const [result, setResult] = useState<{ roll: number; type: string } | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  const rollDice = (sides: number) => {
    setIsRolling(true);
    setResult(null);
    setTimeout(() => {
      const roll = Math.floor(Math.random() * sides) + 1;
      setResult({ roll, type: `d${sides}` });
      setIsRolling(false);
    }, 500); // Small delay for rolling feel
  };

  const diceTypes = [4, 6, 8, 10, 12, 20];

  return (
    <div className="flex-1 flex flex-col justify-center gap-3 w-full">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Dices className="w-3 h-3" /> Quick Roll</span>
        <div className="h-6 flex items-center justify-end w-16">
            <AnimatePresence mode="wait">
              {isRolling && (
                <motion.div
                  key="rolling"
                  initial={{ opacity: 0, rotate: -180 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 180 }}
                  className="text-fuchsia-400"
                >
                  <RefreshCw className="w-4 h-4 animate-spin" />
                </motion.div>
              )}
              {result && !isRolling && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.5, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="flex items-center gap-1.5"
                >
                  <span className="text-[9px] text-fuchsia-400 font-bold uppercase">{result.type}</span>
                  <span className="text-sm font-black text-white font-mono bg-fuchsia-600/20 px-2 rounded border border-fuchsia-500/30">
                    {result.roll}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        {diceTypes.map((sides) => (
          <button
            key={sides}
            onClick={() => rollDice(sides)}
            disabled={isRolling}
            className="bg-slate-800/80 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 hover:text-fuchsia-300 text-slate-400 text-[10px] font-bold font-mono py-1.5 rounded transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 uppercase"
          >
            d{sides}
          </button>
        ))}
      </div>
    </div>
  );
}
