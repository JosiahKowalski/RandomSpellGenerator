import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Lock, Plus, RefreshCw, Unlock, X } from "lucide-react";
import { Spell } from "../types/spell";
import { SPELL_LEVELS } from "../lib/constants";
import { getSpell5eToolsUrl } from "../lib/spellEngine";

interface SpellReaderModalProps {
  spell: Spell | null;
  isKnown: boolean;
  isRolled: boolean;
  ringRemainingLevels: number;
  onClose: () => void;
  onToggleKnown: (spellName: string) => void;
  onReroll?: (spellName: string) => void;
  onQuickStoreInRing?: (spell: Spell) => void;
}

export const SpellReaderModal: React.FC<SpellReaderModalProps> = ({
  spell,
  isKnown,
  isRolled,
  ringRemainingLevels,
  onClose,
  onToggleKnown,
  onReroll,
  onQuickStoreInRing,
}) => {
  useEffect(() => {
    if (!spell) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [spell, onClose]);

  if (!spell || typeof document === "undefined") return null;

  const levelMeta = SPELL_LEVELS[spell.levelIndex];
  const levelDescriptor =
    spell.levelIndex === 0
      ? `${spell.school} cantrip`
      : `${levelMeta?.shortLabel}-level ${spell.school.toLowerCase()}`;

  const classList = [spell.classes, spell.optionalVariantClasses]
    .filter(Boolean)
    .join(", ");

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spell-reader-title"
    >
      <div
        className="absolute inset-0 bg-stone-950/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-2xl max-h-[88vh] flex flex-col bg-paper dark:bg-soot border border-limestone dark:border-charcoal-border rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-limestone dark:border-charcoal-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted dark:text-ash">
              <span className="capitalize">{levelDescriptor}</span>
              <span aria-hidden="true">·</span>
              <span>
                {isKnown
                  ? "Known Spell"
                  : isRolled
                  ? "Rolled Spell"
                  : "Spell Pool"}
              </span>
              {spell.source && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {spell.source}
                    {spell.page ? ` p.${spell.page}` : ""}
                  </span>
                </>
              )}
            </div>
            <h2
              id="spell-reader-title"
              className="font-serif text-2xl sm:text-3xl font-semibold text-ink dark:text-parchment mt-1"
            >
              {spell.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close spell details"
            className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-md border border-limestone dark:border-charcoal-border text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-obsidian transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-6">
          {/* Structured Spell Facts Grid */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-limestone dark:border-charcoal-border">
            <div>
              <dt className="text-xs font-medium text-ink-muted dark:text-ash">
                Casting Time
              </dt>
              <dd className="text-sm font-medium text-ink dark:text-parchment mt-1">
                {spell.castingTime || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted dark:text-ash">
                Range
              </dt>
              <dd className="text-sm font-medium text-ink dark:text-parchment mt-1">
                {spell.range || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted dark:text-ash">
                Duration
              </dt>
              <dd className="text-sm font-medium text-ink dark:text-parchment mt-1">
                {spell.duration || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted dark:text-ash">
                Components
              </dt>
              <dd className="text-sm font-medium text-ink dark:text-parchment mt-1 break-words">
                {spell.components || "—"}
              </dd>
            </div>
          </dl>

          {/* Main Spell Text */}
          <div className="max-w-prose space-y-4">
            <div className="text-[15px] leading-[1.7] text-ink dark:text-parchment whitespace-pre-wrap">
              {spell.text || "No description provided in the loaded CSV."}
            </div>

            {spell.atHigherLevels && (
              <div className="pt-4 border-t border-limestone dark:border-charcoal-border">
                <h3 className="font-serif text-base font-semibold text-ink dark:text-parchment mb-1.5">
                  At Higher Levels
                </h3>
                <p className="text-[15px] leading-[1.7] text-ink-muted dark:text-ash whitespace-pre-wrap">
                  {spell.atHigherLevels.replace(/^At Higher Levels\.\s*/i, "")}
                </p>
              </div>
            )}

            {classList && (
              <div className="pt-4 border-t border-limestone dark:border-charcoal-border text-xs text-ink-muted dark:text-ash leading-relaxed">
                <span className="font-medium text-ink dark:text-parchment">
                  Classes:{" "}
                </span>
                {classList}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-limestone dark:border-charcoal-border bg-linen/70 dark:bg-obsidian/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleKnown(spell.name)}
              className={`h-10 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium border transition-colors whitespace-nowrap ${
                isKnown
                  ? "border-sienna/40 dark:border-brass/40 text-sienna dark:text-brass bg-paper dark:bg-soot hover:bg-linen dark:hover:bg-obsidian"
                  : "border-limestone dark:border-charcoal-border text-ink dark:text-parchment bg-paper dark:bg-soot hover:bg-linen dark:hover:bg-obsidian"
              }`}
            >
              {isKnown ? (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Remove from Known</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Lock as Known</span>
                </>
              )}
            </button>

            {isRolled && !isKnown && onReroll && (
              <button
                type="button"
                onClick={() => onReroll(spell.name)}
                className="h-10 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium border border-limestone dark:border-charcoal-border text-ink dark:text-parchment bg-paper dark:bg-soot hover:bg-linen dark:hover:bg-obsidian transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reroll</span>
              </button>
            )}

            {onQuickStoreInRing &&
              spell.levelIndex >= 1 &&
              spell.levelIndex <= 5 &&
              spell.levelIndex <= ringRemainingLevels && (
                <button
                  type="button"
                  onClick={() => onQuickStoreInRing(spell)}
                  className="h-10 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium border border-limestone dark:border-charcoal-border text-ink dark:text-parchment bg-paper dark:bg-soot hover:bg-linen dark:hover:bg-obsidian transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Store in Ring</span>
                </button>
              )}
          </div>

          <a
            href={getSpell5eToolsUrl(spell)}
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 px-4 inline-flex items-center gap-2 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <span>Open on 5e.tools</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
};
