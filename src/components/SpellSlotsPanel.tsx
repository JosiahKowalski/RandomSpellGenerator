import React, { useState } from "react";
import { Moon, SlidersHorizontal, X } from "lucide-react";
import { Spell, SpellSlotState } from "../types/spell";
import { getDefaultSpellSlots, SPELL_LEVELS } from "../lib/constants";
import { getEffectiveMaxSlots } from "../lib/spellEngine";

interface SpellSlotsPanelProps {
  casterLevel: number;
  slotState: SpellSlotState;
  concentrationSpell: string | null;
  concentrationSpellObj: Spell | null;
  lastSlotFlash?: { level: number; seq: number } | null;
  onExpendSlot: (level: number) => void;
  onRecoverSlot: (level: number) => void;
  onSetCustomMaxSlot: (level: number, nextMax: number) => void;
  onResetSlotDefaults: () => void;
  onLongRest: () => void;
  onDropConcentration: () => void;
  onOpenSpell: (spell: Spell) => void;
}

export const SpellSlotsPanel: React.FC<SpellSlotsPanelProps> = ({
  casterLevel,
  slotState,
  concentrationSpell,
  concentrationSpellObj,
  lastSlotFlash,
  onExpendSlot,
  onRecoverSlot,
  onSetCustomMaxSlot,
  onResetSlotDefaults,
  onLongRest,
  onDropConcentration,
  onOpenSpell,
}) => {
  const [isCustomizing, setIsCustomizing] = useState(false);

  const effectiveMax = getEffectiveMaxSlots(slotState, casterLevel);
  const leveledEntries = SPELL_LEVELS.slice(1).map((lvl) => {
    const max = effectiveMax[lvl.key] ?? 0;
    const used = Math.min(max, Math.max(0, slotState.used[lvl.key] ?? 0));
    const remaining = Math.max(0, max - used);
    return { lvl, max, used, remaining };
  });

  const activeLevels = leveledEntries.filter((entry) => entry.max > 0);
  const totalMax = activeLevels.reduce((sum, e) => sum + e.max, 0);
  const totalUsed = activeLevels.reduce((sum, e) => sum + e.used, 0);
  const totalRemaining = Math.max(0, totalMax - totalUsed);
  const canRest = totalUsed > 0 || Boolean(concentrationSpell);

  const defaultMap = getDefaultSpellSlots(casterLevel);

  return (
    <section
      aria-label="Spell slots and concentration tracker"
      className="rounded-lg border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot overflow-hidden"
    >
      {/* Header Row */}
      <div className="px-4 py-3 border-b border-limestone dark:border-charcoal-border flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h2 className="font-serif text-base font-semibold text-ink dark:text-parchment">
            Spell Slots
          </h2>
          <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
            {totalRemaining}/{totalMax} remaining
          </span>
          <span aria-hidden="true" className="text-xs text-ink-muted dark:text-ash">
            ·
          </span>
          <span className="text-xs text-ink-muted dark:text-ash">
            {slotState.useCustomMax ? "Custom max" : `Lv. ${casterLevel} table`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCustomizing((prev) => !prev)}
            className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              isCustomizing
                ? "bg-lapis text-white border-lapis dark:bg-lapis-dark dark:text-obsidian dark:border-lapis-dark"
                : "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isCustomizing ? "Done" : "Edit Max"}</span>
          </button>

          <button
            type="button"
            onClick={onLongRest}
            disabled={!canRest}
            title="Restore all expended spell slots and drop concentration"
            className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              canRest
                ? "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink dark:text-parchment hover:border-lapis dark:hover:border-lapis-dark hover:text-lapis dark:hover:text-lapis-dark"
                : "border-limestone/70 dark:border-charcoal-border/70 bg-transparent text-ink-muted/60 dark:text-ash/50 cursor-not-allowed"
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Long Rest</span>
          </button>
        </div>
      </div>

      {/* Body: Interactive Slot Tracker OR Max Slot Editor */}
      <div className="p-4">
        {isCustomizing ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted dark:text-ash">
              <span>
                Adjust max slots per level (useful for half-casters, Warlocks, or magic items).
              </span>
              {slotState.useCustomMax && (
                <button
                  type="button"
                  onClick={onResetSlotDefaults}
                  className="font-medium text-lapis dark:text-lapis-dark hover:underline whitespace-nowrap"
                >
                  Use Lv. {casterLevel} Defaults
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {leveledEntries.map(({ lvl, max }) => {
                const defaultCount = defaultMap[lvl.key] ?? 0;
                const differs = slotState.useCustomMax && max !== defaultCount;
                return (
                  <div
                    key={lvl.key}
                    className="rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian px-2.5 py-2 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink dark:text-parchment">
                        {lvl.shortLabel}
                      </span>
                      {differs && (
                        <span className="font-mono text-[11px] text-sienna dark:text-brass">
                          custom
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => onSetCustomMaxSlot(lvl.index, max - 1)}
                        disabled={max <= 0}
                        aria-label={`Decrease max ${lvl.shortLabel}-level slots`}
                        className="h-7 w-7 rounded border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot text-ink dark:text-parchment font-mono text-sm hover:bg-linen dark:hover:bg-obsidian disabled:opacity-35 transition-colors"
                      >
                        −
                      </button>
                      <span className="font-mono tabular-nums text-sm font-semibold text-ink dark:text-parchment">
                        {max}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSetCustomMaxSlot(lvl.index, max + 1)}
                        disabled={max >= 9}
                        aria-label={`Increase max ${lvl.shortLabel}-level slots`}
                        className="h-7 w-7 rounded border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot text-ink dark:text-parchment font-mono text-sm hover:bg-linen dark:hover:bg-obsidian disabled:opacity-35 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeLevels.length === 0 ? (
          <p className="text-xs text-ink-muted dark:text-ash">
            No spell slots configured. Click{" "}
            <button
              type="button"
              onClick={() => setIsCustomizing(true)}
              className="text-lapis dark:text-lapis-dark font-medium hover:underline"
            >
              Edit Max
            </button>{" "}
            to add slots.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {activeLevels.map(({ lvl, max, remaining }) => {
              const depleted = remaining === 0;
              const isFlashing = lastSlotFlash?.level === lvl.index;
              return (
                <div
                  key={lvl.key}
                  className={`relative rounded-md border px-3 py-2.5 transition-colors ${
                    depleted
                      ? "border-limestone/70 dark:border-charcoal-border/70 bg-paper/50 dark:bg-obsidian/40"
                      : "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian"
                  }`}
                >
                  {isFlashing && (
                    <span
                      key={lastSlotFlash.seq}
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-px rounded-md border border-lapis dark:border-lapis-dark bg-lapis/8 dark:bg-lapis-dark/12 animate-cast-ring"
                    />
                  )}
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span
                      className={`text-xs font-medium ${
                        depleted
                          ? "text-ink-muted dark:text-ash"
                          : "text-ink dark:text-parchment"
                      }`}
                    >
                      {lvl.shortLabel} Level
                    </span>
                    <span
                      className={`text-xs font-mono tabular-nums ${
                        depleted
                          ? "text-ink-muted/75 dark:text-ash/70"
                          : "text-ink-muted dark:text-ash font-medium"
                      }`}
                    >
                      {remaining}/{max}
                    </span>
                  </div>

                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label={`${lvl.shortLabel}-level spell slots (${remaining} of ${max} remaining)`}
                  >
                    {Array.from({ length: max }).map((_, idx) => {
                      const isAvailable = idx < remaining;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            isAvailable
                              ? onExpendSlot(lvl.index)
                              : onRecoverSlot(lvl.index)
                          }
                          aria-label={
                            isAvailable
                              ? `Expend a ${lvl.shortLabel}-level spell slot`
                              : `Recover a ${lvl.shortLabel}-level spell slot`
                          }
                          title={
                            isAvailable
                              ? "Click to expend 1 slot"
                              : "Click to recover 1 slot"
                          }
                          className={`h-5 w-5 rounded-[4px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
                            isAvailable
                              ? "bg-lapis border-lapis dark:bg-lapis-dark dark:border-lapis-dark hover:opacity-80"
                              : "bg-transparent border-limestone dark:border-charcoal-border hover:border-lapis dark:hover:border-lapis-dark"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Integrated Concentration Strip */}
      <div
        className={`px-4 py-2.5 border-t border-limestone dark:border-charcoal-border flex flex-wrap items-center justify-between gap-2 ${
          concentrationSpell
            ? "bg-paper dark:bg-obsidian"
            : "bg-transparent"
        }`}
      >
        {concentrationSpell ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
              <span className="text-xs font-semibold text-sienna dark:text-brass whitespace-nowrap">
                Concentrating
              </span>
              <span aria-hidden="true" className="text-xs text-ink-muted dark:text-ash">
                ·
              </span>
              {concentrationSpellObj ? (
                <button
                  type="button"
                  onClick={() => onOpenSpell(concentrationSpellObj)}
                  className="font-serif text-base font-semibold text-ink dark:text-parchment hover:text-lapis dark:hover:text-lapis-dark hover:underline underline-offset-2 truncate text-left"
                >
                  {concentrationSpell}
                </button>
              ) : (
                <span className="font-serif text-base font-semibold text-ink dark:text-parchment truncate">
                  {concentrationSpell}
                </span>
              )}
              {concentrationSpellObj?.duration && (
                <span className="text-xs text-ink-muted dark:text-ash truncate">
                  ({concentrationSpellObj.duration.replace(/^Concentration,\s*/i, "")})
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onDropConcentration}
              className="h-8 px-2.5 inline-flex items-center gap-1 rounded-md border border-sienna/40 dark:border-brass/40 text-xs font-medium text-sienna dark:text-brass hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              <span>Drop</span>
            </button>
          </>
        ) : (
          <p className="text-xs text-ink-muted dark:text-ash">
            <span className="font-medium text-ink dark:text-parchment">
              Concentration:
            </span>{" "}
            None — cast any concentration spell from its detail view to track it here.
          </p>
        )}
      </div>
    </section>
  );
};
