import React, { useEffect } from "react";
import { Check, X } from "lucide-react";
import {
  DiceGentleDropMode,
  DiceRandomnessEngine,
  DiceTraySettings,
} from "../lib/diceRandomness";

interface DiceSettingsModalProps {
  isOpen: boolean;
  settings: DiceTraySettings;
  onChange: (next: DiceTraySettings) => void;
  onClose: () => void;
}

const ENGINE_OPTIONS: Array<{
  id: DiceRandomnessEngine;
  title: string;
  summary: string;
}> = [
  {
    id: "physics",
    title: "Pure Physics",
    summary:
      "Instant live 3D simulation seeded with cryptographic spins, uniform starting orientations, and unbiased click-rerolls.",
  },
  {
    id: "hybrid",
    title: "Crypto-Guaranteed (Hybrid)",
    summary:
      "Draws an unbiased cryptographic result upfront, then aligns the physical throw via die symmetry so it lands naturally on that face. Held dice hide their numbers until release.",
  },
];

const DROP_OPTIONS: Array<{
  id: DiceGentleDropMode;
  title: string;
  summary: string;
}> = [
  {
    id: "concealed-drop",
    title: "Concealed Drop",
    summary:
      "Hides numbers while held in your hand, then drops realistically from a fresh random face so gentle drops still roll fairly.",
  },
  {
    id: "put-back",
    title: "Put Back (Cancel Grab)",
    summary:
      "Gently releasing returns the die smoothly to its previous spot and face without rolling. Flick past speed to roll.",
  },
];

export const DiceSettingsModal: React.FC<DiceSettingsModalProps> = ({
  isOpen,
  settings,
  onChange,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dice-settings-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-limestone dark:border-charcoal-border flex items-center justify-between gap-3">
          <div>
            <h2
              id="dice-settings-title"
              className="font-serif text-lg font-semibold text-ink dark:text-parchment leading-snug"
            >
              Dice Settings
            </h2>
            <p className="text-xs text-ink-muted dark:text-ash mt-0.5">
              Choose how rolls are generated and how gentle drops behave.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dice settings"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[78vh] overflow-y-auto">
          {/* Randomness Engine */}
          <fieldset className="space-y-2.5">
            <legend className="text-xs font-medium text-ink dark:text-parchment">
              Randomness Engine
            </legend>
            <div className="space-y-2" role="radiogroup" aria-label="Randomness Engine">
              {ENGINE_OPTIONS.map((opt) => {
                const selected = settings.randomnessEngine === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      onChange({ ...settings, randomnessEngine: opt.id })
                    }
                    className={`w-full text-left rounded-md border p-3.5 transition-colors flex items-start justify-between gap-3 ${
                      selected
                        ? "border-lapis dark:border-lapis-dark bg-linen/70 dark:bg-soot"
                        : "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian hover:border-lapis/50 dark:hover:border-lapis-dark/50"
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="text-sm font-medium text-ink dark:text-parchment">
                        {opt.title}
                      </div>
                      <p className="text-xs text-ink-muted dark:text-ash leading-relaxed">
                        {opt.summary}
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        selected
                          ? "border-lapis dark:border-lapis-dark bg-lapis dark:bg-lapis-dark text-white dark:text-obsidian"
                          : "border-limestone dark:border-charcoal-border"
                      }`}
                    >
                      {selected && <Check className="w-3 h-3" strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="border-t border-limestone/80 dark:border-charcoal-border/80" />

          {/* Gentle Drag-and-Drop */}
          <fieldset className="space-y-2.5">
            <legend className="text-xs font-medium text-ink dark:text-parchment">
              Gentle Drag-and-Drop
            </legend>
            <div className="space-y-2" role="radiogroup" aria-label="Gentle Drag-and-Drop">
              {DROP_OPTIONS.map((opt) => {
                const selected = settings.gentleDropMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      onChange({ ...settings, gentleDropMode: opt.id })
                    }
                    className={`w-full text-left rounded-md border p-3.5 transition-colors flex items-start justify-between gap-3 ${
                      selected
                        ? "border-lapis dark:border-lapis-dark bg-linen/70 dark:bg-soot"
                        : "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian hover:border-lapis/50 dark:hover:border-lapis-dark/50"
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="text-sm font-medium text-ink dark:text-parchment">
                        {opt.title}
                      </div>
                      <p className="text-xs text-ink-muted dark:text-ash leading-relaxed">
                        {opt.summary}
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        selected
                          ? "border-lapis dark:border-lapis-dark bg-lapis dark:bg-lapis-dark text-white dark:text-obsidian"
                          : "border-limestone dark:border-charcoal-border"
                      }`}
                    >
                      {selected && <Check className="w-3 h-3" strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-limestone dark:border-charcoal-border bg-linen/40 dark:bg-soot/60 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
