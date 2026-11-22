import React, { useState } from "react";
import { ArrowUpRight, Moon, SlidersHorizontal, X } from "lucide-react";
import { SorceryState, Spell, SpellSlotState } from "../types/spell";
import {
  getDefaultSorceryPoints,
  getDefaultSpellSlots,
  SPELL_LEVELS,
} from "../lib/constants";
import { getBaseMaxSlots, getEffectiveMaxSlots } from "../lib/spellEngine";

interface SpellSlotsPanelProps {
  casterLevel: number;
  slotState: SpellSlotState;
  sorcery: SorceryState;
  concentrationSpell: string | null;
  concentrationSpellObj: Spell | null;
  lastSlotFlash?: { level: number; seq: number } | null;
  onExpendSlot: (level: number) => void;
  onRecoverSlot: (level: number) => void;
  onSetCustomMaxSlot: (level: number, nextMax: number) => void;
  onResetSlotDefaults: () => void;
  onSpendSorceryPoints: (amount: number, label?: string) => void;
  onRegainSorceryPoints: (amount: number) => void;
  onOpenMetamagic: () => void;
  onLongRest: () => void;
  onDropConcentration: () => void;
  onOpenSpell: (spell: Spell) => void;
}

export const SpellSlotsPanel: React.FC<SpellSlotsPanelProps> = ({
  casterLevel,
  slotState,
  sorcery,
  concentrationSpell,
  concentrationSpellObj,
  lastSlotFlash,
  onExpendSlot,
  onRecoverSlot,
  onSetCustomMaxSlot,
  onResetSlotDefaults,
  onSpendSorceryPoints,
  onRegainSorceryPoints,
  onOpenMetamagic,
  onLongRest,
  onDropConcentration,
  onOpenSpell,
}) => {
  const [isCustomizing, setIsCustomizing] = useState(false);

  const baseMaxMap = getBaseMaxSlots(slotState, casterLevel);
  const effectiveMax = getEffectiveMaxSlots(slotState, casterLevel);
  const leveledEntries = SPELL_LEVELS.slice(1).map((lvl) => {
    const base = baseMaxMap[lvl.key] ?? 0;
    const bonus = Math.max(0, slotState.bonus?.[lvl.key] ?? 0);
    const max = effectiveMax[lvl.key] ?? 0;
    const used = Math.min(max, Math.max(0, slotState.used[lvl.key] ?? 0));
    const remaining = Math.max(0, max - used);
    return { lvl, base, bonus, max, used, remaining };
  });

  const activeLevels = leveledEntries.filter((entry) => entry.max > 0);
  const totalMax = activeLevels.reduce((sum, e) => sum + e.max, 0);
  const totalUsed = activeLevels.reduce((sum, e) => sum + e.used, 0);
  const totalBonus = activeLevels.reduce((sum, e) => sum + e.bonus, 0);
  const totalRemaining = Math.max(0, totalMax - totalUsed);

  const maxSorcery = sorcery.useCustomMax
    ? sorcery.maxPoints
    : getDefaultSorceryPoints(casterLevel);
  const usedSorcery = Math.min(maxSorcery, Math.max(0, sorcery.usedPoints));
  const remainingSorcery = Math.max(0, maxSorcery - usedSorcery);

  const canRest =
    totalUsed > 0 ||
    totalBonus > 0 ||
    usedSorcery > 0 ||
    Boolean(concentrationSpell);

  const defaultMap = getDefaultSpellSlots(casterLevel);

  return (
    <section
      aria-label="Combat resources: concentration, spell slots, and sorcery points"
      className="rounded-lg border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot overflow-hidden"
    >
      {/* 1. Concentration Strip (Top of Sticky Combat Rail) */}
      <div
        className={`px-4 py-3 border-b border-limestone dark:border-charcoal-border flex items-center justify-between gap-2 ${
          concentrationSpell
            ? "bg-paper dark:bg-obsidian"
            : "bg-transparent"
        }`}
      >
        {concentrationSpell ? (
          <>
            <div className="min-w-0 space-y-0.5">
              <p className="text-[11px] font-semibold text-sienna dark:text-brass">
                Concentrating
              </p>
              <div className="flex items-baseline gap-1.5 min-w-0">
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
                  <span className="text-xs text-ink-muted dark:text-ash truncate shrink-0">
                    ({concentrationSpellObj.duration.replace(/^Concentration,\s*/i, "")})
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onDropConcentration}
              className="h-8 px-2.5 inline-flex items-center gap-1 rounded-md border border-sienna/40 dark:border-brass/40 text-xs font-medium text-sienna dark:text-brass hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap shrink-0"
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
            None active
          </p>
        )}
      </div>

      {/* 2. Spell Slots Section */}
      <div className="px-4 py-3 border-b border-limestone/80 dark:border-charcoal-border/80 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="font-serif text-base font-semibold text-ink dark:text-parchment whitespace-nowrap">
            Spell Slots
          </h2>
          <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash whitespace-nowrap">
            {totalRemaining}/{totalMax}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsCustomizing((prev) => !prev)}
            title={isCustomizing ? "Finish editing max slots" : "Edit max spell slots"}
            className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              isCustomizing
                ? "bg-lapis text-white border-lapis dark:bg-lapis-dark dark:text-obsidian dark:border-lapis-dark"
                : "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isCustomizing ? "Done" : "Edit"}</span>
          </button>

          <button
            type="button"
            onClick={onLongRest}
            disabled={!canRest}
            title="Restore spell slots & sorcery points, clear temporary slots, and drop concentration"
            className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              canRest
                ? "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink dark:text-parchment hover:border-lapis dark:hover:border-lapis-dark hover:text-lapis dark:hover:text-lapis-dark"
                : "border-limestone/70 dark:border-charcoal-border/70 bg-transparent text-ink-muted/55 dark:text-ash/45 cursor-not-allowed"
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Rest</span>
          </button>
        </div>
      </div>

      {/* Spell Slots Body */}
      <div className="p-3.5">
        {isCustomizing ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted dark:text-ash">
              <span>Max slots per level</span>
              {slotState.useCustomMax && (
                <button
                  type="button"
                  onClick={onResetSlotDefaults}
                  className="font-medium text-lapis dark:text-lapis-dark hover:underline whitespace-nowrap"
                >
                  Lv. {casterLevel} Defaults
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {leveledEntries.map(({ lvl, base }) => {
                const defaultCount = defaultMap[lvl.key] ?? 0;
                const differs = slotState.useCustomMax && base !== defaultCount;
                return (
                  <div
                    key={lvl.key}
                    className="rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian px-2 py-1.5 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-ink dark:text-parchment">
                        {lvl.shortLabel}
                      </span>
                      {differs && (
                        <span className="font-mono text-sienna dark:text-brass">
                          *
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => onSetCustomMaxSlot(lvl.index, base - 1)}
                        disabled={base <= 0}
                        aria-label={`Decrease max ${lvl.shortLabel}-level slots`}
                        className="h-6 w-6 rounded border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot text-ink dark:text-parchment font-mono text-xs hover:bg-linen dark:hover:bg-obsidian disabled:opacity-35"
                      >
                        −
                      </button>
                      <span className="font-mono tabular-nums text-xs font-semibold text-ink dark:text-parchment">
                        {base}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSetCustomMaxSlot(lvl.index, base + 1)}
                        disabled={base >= 9}
                        aria-label={`Increase max ${lvl.shortLabel}-level slots`}
                        className="h-6 w-6 rounded border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot text-ink dark:text-parchment font-mono text-xs hover:bg-linen dark:hover:bg-obsidian disabled:opacity-35"
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
            No spell slots configured.{" "}
            <button
              type="button"
              onClick={() => setIsCustomizing(true)}
              className="text-lapis dark:text-lapis-dark font-medium hover:underline"
            >
              Edit max
            </button>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {activeLevels.map(({ lvl, base, bonus, max, remaining }) => {
              const depleted = remaining === 0;
              const isFlashing = lastSlotFlash?.level === lvl.index;
              return (
                <div
                  key={lvl.key}
                  className={`relative rounded-md border px-2.5 py-2 transition-colors ${
                    depleted
                      ? "border-limestone/70 dark:border-charcoal-border/70 bg-paper/45 dark:bg-obsidian/40"
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
                  <div className="flex items-baseline justify-between gap-1.5 mb-1.5">
                    <span
                      className={`text-xs font-medium ${
                        depleted
                          ? "text-ink-muted dark:text-ash"
                          : "text-ink dark:text-parchment"
                      }`}
                    >
                      {lvl.shortLabel}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-ink-muted dark:text-ash">
                      {remaining}/{max}
                      {bonus > 0 && (
                        <span
                          title={`Includes +${bonus} temporary slot${
                            bonus === 1 ? "" : "s"
                          } from Flexible Casting`}
                          className="ml-1 text-sienna dark:text-brass"
                        >
                          +{bonus}
                        </span>
                      )}
                    </span>
                  </div>

                  <div
                    className="flex flex-wrap items-center gap-1"
                    role="group"
                    aria-label={`${lvl.shortLabel}-level spell slots (${remaining} of ${max} remaining)`}
                  >
                    {Array.from({ length: max }).map((_, idx) => {
                      const isAvailable = idx < remaining;
                      const isBonusPip = idx >= base;
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
                              ? isBonusPip
                                ? "Temporary Flexible Casting slot (click to expend)"
                                : "Click to expend 1 slot"
                              : "Click to recover 1 slot"
                          }
                          className={`h-5 w-5 rounded-[4px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
                            isAvailable
                              ? isBonusPip
                                ? "bg-sienna border-sienna dark:bg-brass dark:border-brass hover:opacity-80"
                                : "bg-lapis border-lapis dark:bg-lapis-dark dark:border-lapis-dark hover:opacity-80"
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

      {/* 3. Integrated Sorcery Points Strip */}
      <div className="px-4 py-3 border-t border-limestone dark:border-charcoal-border space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="font-serif text-base font-semibold text-ink dark:text-parchment whitespace-nowrap">
              Sorcery Points
            </h2>
            <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash whitespace-nowrap">
              {remainingSorcery}/{maxSorcery}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenMetamagic}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-lapis dark:text-lapis-dark hover:underline whitespace-nowrap shrink-0"
          >
            <span>Metamagic</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {maxSorcery === 0 ? (
          <p className="text-xs text-ink-muted dark:text-ash">
            Unlocks at Lv. 2 (or customize in Metamagic).
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div
              className="flex flex-wrap items-center gap-1"
              role="group"
              aria-label={`Sorcery points (${remainingSorcery} of ${maxSorcery} available)`}
            >
              {Array.from({ length: maxSorcery }).map((_, idx) => {
                const isAvailable = idx < remainingSorcery;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      isAvailable
                        ? onSpendSorceryPoints(1)
                        : onRegainSorceryPoints(1)
                    }
                    aria-label={
                      isAvailable
                        ? "Spend 1 sorcery point"
                        : "Regain 1 sorcery point"
                    }
                    title={
                      isAvailable
                        ? "Click to spend 1 SP"
                        : "Click to regain 1 SP"
                    }
                    className={`h-4 w-4 rounded-[3px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sienna dark:focus-visible:ring-brass ${
                      isAvailable
                        ? "bg-sienna border-sienna dark:bg-brass dark:border-brass hover:opacity-80"
                        : "bg-paper dark:bg-obsidian border-limestone dark:border-charcoal-border hover:border-sienna dark:hover:border-brass"
                    }`}
                  />
                );
              })}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onSpendSorceryPoints(1)}
                disabled={remainingSorcery <= 0}
                aria-label="Spend 1 sorcery point"
                className="h-7 w-7 rounded border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-mono text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot disabled:opacity-40 transition-colors"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => onRegainSorceryPoints(1)}
                disabled={remainingSorcery >= maxSorcery}
                aria-label="Regain 1 sorcery point"
                className="h-7 w-7 rounded border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-mono text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot disabled:opacity-40 transition-colors"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
