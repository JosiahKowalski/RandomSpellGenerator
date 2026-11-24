import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Moon,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { SorceryState, SpellSlotState } from "../types/spell";
import {
  FLEXIBLE_CASTING_SLOT_COSTS,
  getDefaultSorceryPoints,
  METAMAGIC_OPTIONS,
  SPELL_LEVELS,
} from "../lib/constants";
import { getEffectiveMaxSlots } from "../lib/spellEngine";

interface MetamagicViewProps {
  casterLevel: number;
  slotState: SpellSlotState;
  sorcery: SorceryState;
  onSpendSorceryPoints: (amount: number, label?: string) => void;
  onRegainSorceryPoints: (amount: number) => void;
  onSetCustomMaxSorcery: (nextMax: number) => void;
  onResetSorceryDefaults: () => void;
  onRestoreSorcery: () => void;
  onLongRest: () => void;
  onToggleKnownMetamagic: (id: string) => void;
  onConvertSlotToSorcery: (level: number) => void;
  onCreateSlotFromSorcery: (level: number, cost: number) => void;
}

const TWINNED_LEVEL_OPTIONS = [
  { level: 0, label: "Cantrip", cost: 1 },
  { level: 1, label: "1st Level", cost: 1 },
  { level: 2, label: "2nd Level", cost: 2 },
  { level: 3, label: "3rd Level", cost: 3 },
  { level: 4, label: "4th Level", cost: 4 },
  { level: 5, label: "5th Level", cost: 5 },
  { level: 6, label: "6th Level", cost: 6 },
  { level: 7, label: "7th Level", cost: 7 },
  { level: 8, label: "8th Level", cost: 8 },
  { level: 9, label: "9th Level", cost: 9 },
];

export const MetamagicView: React.FC<MetamagicViewProps> = ({
  casterLevel,
  slotState,
  sorcery,
  onSpendSorceryPoints,
  onRegainSorceryPoints,
  onSetCustomMaxSorcery,
  onResetSorceryDefaults,
  onRestoreSorcery,
  onLongRest,
  onToggleKnownMetamagic,
  onConvertSlotToSorcery,
  onCreateSlotFromSorcery,
}) => {
  const [filterTab, setFilterTab] = useState<"all" | "known">("all");
  const [isEditingMax, setIsEditingMax] = useState(false);
  const [twinnedLevel, setTwinnedLevel] = useState<number>(1);
  const [expandedRuleIds, setExpandedRuleIds] = useState<Record<string, boolean>>({});
  const [recentActionKey, setRecentActionKey] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const flashAction = (key: string) => {
    setRecentActionKey(key);
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = window.setTimeout(() => {
      setRecentActionKey(null);
    }, 650);
  };

  const defaultMax = getDefaultSorceryPoints(casterLevel);
  const maxPoints = sorcery.useCustomMax ? sorcery.maxPoints : defaultMax;
  const usedPoints = Math.min(maxPoints, Math.max(0, sorcery.usedPoints));
  const remainingPoints = Math.max(0, maxPoints - usedPoints);

  const knownSet = new Set(sorcery.knownMetamagics);
  const knownCount = sorcery.knownMetamagics.length;

  const visibleMetamagics =
    filterTab === "known"
      ? METAMAGIC_OPTIONS.filter((opt) => knownSet.has(opt.id))
      : [...METAMAGIC_OPTIONS].sort(
          (a, b) => Number(knownSet.has(b.id)) - Number(knownSet.has(a.id))
        );

  const effectiveMaxSlots = getEffectiveMaxSlots(slotState, casterLevel);
  const activeSlotLevels = SPELL_LEVELS.slice(1)
    .map((lvl) => {
      const max = effectiveMaxSlots[lvl.key] ?? 0;
      const used = Math.min(max, Math.max(0, slotState.used[lvl.key] ?? 0));
      const bonus = Math.max(0, slotState.bonus?.[lvl.key] ?? 0);
      const remaining = Math.max(0, max - used);
      return { lvl, max, used, bonus, remaining };
    })
    .filter((entry) => entry.max > 0);

  const totalUsedSlots = activeSlotLevels.reduce((sum, e) => sum + e.used, 0);
  const totalBonusSlots = activeSlotLevels.reduce((sum, e) => sum + e.bonus, 0);
  const canLongRest = usedPoints > 0 || totalUsedSlots > 0 || totalBonusSlots > 0;

  const toggleRuleExpand = (id: string) => {
    setExpandedRuleIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUseMetamagic = (id: string, name: string, cost: number) => {
    if (remainingPoints < cost) return;
    onSpendSorceryPoints(cost, name);
    flashAction(`meta-${id}`);
  };

  const handleCreateSlot = (level: number, cost: number) => {
    if (remainingPoints < cost) return;
    onCreateSlotFromSorcery(level, cost);
    flashAction(`create-${level}`);
  };

  const handleConvertSlot = (level: number) => {
    onConvertSlotToSorcery(level);
    flashAction(`convert-${level}`);
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-limestone dark:border-charcoal-border pb-5">
        <div>
          <p className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
            {remainingPoints}/{maxPoints} sorcery points · {knownCount} known{" "}
            {knownCount === 1 ? "option" : "options"}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-ink dark:text-parchment mt-1">
            Metamagic &amp; Font of Magic
          </h1>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {usedPoints > 0 && (
            <button
              type="button"
              onClick={onRestoreSorcery}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-medium text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Refill SP</span>
            </button>
          )}
          <button
            type="button"
            onClick={onLongRest}
            disabled={!canLongRest}
            title="Restore sorcery points and spell slots, clear temporary created slots, and drop concentration"
            className={`h-9 px-3.5 inline-flex items-center gap-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
              canLongRest
                ? "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink dark:text-parchment hover:border-lapis dark:hover:border-lapis-dark hover:text-lapis dark:hover:text-lapis-dark"
                : "border-limestone/70 dark:border-charcoal-border/70 text-ink-muted/60 dark:text-ash/50 cursor-not-allowed"
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Long Rest</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Main Column: Sorcery Points + All 10 Metamagic Options */}
        <div className="lg:col-span-8 space-y-8">
          {/* Sorcery Points Tracker */}
          <section
            aria-label="Sorcery points pool"
            className="rounded-lg border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-limestone dark:border-charcoal-border flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <h2 className="font-serif text-base font-semibold text-ink dark:text-parchment">
                  Sorcery Points
                </h2>
                <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
                  {remainingPoints}/{maxPoints} available
                </span>
                <span aria-hidden="true" className="text-xs text-ink-muted dark:text-ash">
                  ·
                </span>
                <span className="text-xs text-ink-muted dark:text-ash">
                  {sorcery.useCustomMax
                    ? "Custom max"
                    : casterLevel >= 2
                    ? `Lv. ${casterLevel} Sorcerer`
                    : "Unlocks at Lv. 2"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsEditingMax((prev) => !prev)}
                className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                  isEditingMax
                    ? "bg-lapis text-white border-lapis dark:bg-lapis-dark dark:text-obsidian dark:border-lapis-dark"
                    : "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{isEditingMax ? "Done" : "Edit Max"}</span>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {isEditingMax ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted dark:text-ash">
                    <span>
                      Override max sorcery points for multiclass Sorcerers, Metamagic Adept (+2), or magic items.
                    </span>
                    {sorcery.useCustomMax && (
                      <button
                        type="button"
                        onClick={onResetSorceryDefaults}
                        className="font-medium text-lapis dark:text-lapis-dark hover:underline whitespace-nowrap"
                      >
                        Use Lv. {casterLevel} Default ({defaultMax})
                      </button>
                    )}
                  </div>

                  <div className="inline-flex items-center gap-3 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian px-3 py-2">
                    <span className="text-xs font-medium text-ink dark:text-parchment">
                      Max Sorcery Points
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSetCustomMaxSorcery(maxPoints - 1)}
                        disabled={maxPoints <= 0}
                        aria-label="Decrease max sorcery points"
                        className="h-8 w-8 rounded border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot text-ink dark:text-parchment font-mono text-sm hover:bg-linen dark:hover:bg-obsidian disabled:opacity-35 transition-colors"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-mono tabular-nums text-base font-semibold text-ink dark:text-parchment">
                        {maxPoints}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSetCustomMaxSorcery(maxPoints + 1)}
                        disabled={maxPoints >= 30}
                        aria-label="Increase max sorcery points"
                        className="h-8 w-8 rounded border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot text-ink dark:text-parchment font-mono text-sm hover:bg-linen dark:hover:bg-obsidian disabled:opacity-35 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ) : maxPoints === 0 ? (
                <p className="text-xs text-ink-muted dark:text-ash leading-relaxed">
                  Sorcerers gain Font of Magic at 2nd level. Raise your caster level in Rules or click{" "}
                  <button
                    type="button"
                    onClick={() => setIsEditingMax(true)}
                    className="text-lapis dark:text-lapis-dark font-medium hover:underline"
                  >
                    Edit Max
                  </button>{" "}
                  if you have the Metamagic Adept feat.
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label={`Sorcery points (${remainingPoints} of ${maxPoints} available)`}
                  >
                    {Array.from({ length: maxPoints }).map((_, idx) => {
                      const isAvailable = idx < remainingPoints;
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
                          className={`h-6 w-6 rounded-[4px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sienna dark:focus-visible:ring-brass ${
                            isAvailable
                              ? "bg-sienna border-sienna dark:bg-brass dark:border-brass hover:opacity-80"
                              : "bg-paper dark:bg-obsidian border-limestone dark:border-charcoal-border hover:border-sienna dark:hover:border-brass"
                          }`}
                        />
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSpendSorceryPoints(1)}
                      disabled={remainingPoints <= 0}
                      className="h-8 px-2.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-mono font-medium text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot disabled:opacity-40 transition-colors"
                    >
                      −1 SP
                    </button>
                    <button
                      type="button"
                      onClick={() => onRegainSorceryPoints(1)}
                      disabled={remainingPoints >= maxPoints}
                      className="h-8 px-2.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-mono font-medium text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot disabled:opacity-40 transition-colors"
                    >
                      +1 SP
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Metamagic Options Catalog */}
          <section aria-label="Metamagic options" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl font-semibold text-ink dark:text-parchment">
                  Metamagic Options
                </h2>
                <p className="text-xs text-ink-muted dark:text-ash mt-0.5">
                  Pin your character&apos;s known options or spend sorcery points directly during casting.
                </p>
              </div>

              <div
                role="tablist"
                aria-label="Filter metamagic options"
                className="inline-flex rounded-md border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterTab === "all"}
                  onClick={() => setFilterTab("all")}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    filterTab === "all"
                      ? "bg-paper dark:bg-obsidian text-ink dark:text-parchment shadow-xs"
                      : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                  }`}
                >
                  All ({METAMAGIC_OPTIONS.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterTab === "known"}
                  onClick={() => setFilterTab("known")}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    filterTab === "known"
                      ? "bg-paper dark:bg-obsidian text-ink dark:text-parchment shadow-xs"
                      : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                  }`}
                >
                  Known ({knownCount})
                </button>
              </div>
            </div>

            {visibleMetamagics.length === 0 ? (
              <div className="rounded-lg border border-dashed border-limestone dark:border-charcoal-border p-8 text-center space-y-2">
                <p className="text-sm font-medium text-ink dark:text-parchment">
                  No Metamagic options pinned yet.
                </p>
                <p className="text-xs text-ink-muted dark:text-ash">
                  Switch to All and click the bookmark icon on the options your character knows.
                </p>
                <button
                  type="button"
                  onClick={() => setFilterTab("all")}
                  className="mt-2 h-8 px-3 rounded-md border border-limestone dark:border-charcoal-border text-xs font-medium text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors"
                >
                  Show All 10 Options
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleMetamagics.map((option) => {
                  const isKnown = knownSet.has(option.id);
                  const isTwinned = option.id === "twinned";
                  const cost = isTwinned
                    ? Math.max(1, twinnedLevel)
                    : option.fixedCost ?? 1;
                  const canAfford = remainingPoints >= cost;
                  const isConfirmed = recentActionKey === `meta-${option.id}`;
                  const isExpanded = Boolean(expandedRuleIds[option.id]);

                  return (
                    <article
                      key={option.id}
                      className={`rounded-lg border p-4 flex flex-col justify-between gap-3 transition-colors ${
                        isKnown
                          ? "border-sienna/45 dark:border-brass/45 bg-linen/50 dark:bg-soot"
                          : "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-serif text-lg font-semibold text-ink dark:text-parchment leading-snug">
                              {option.name}
                            </h3>
                            <p className="text-xs text-ink-muted dark:text-ash mt-0.5 flex flex-wrap items-center gap-x-1.5">
                              <span className="font-mono font-medium text-sienna dark:text-brass">
                                {option.costLabel}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{option.source}</span>
                              {option.combinable && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Combinable</span>
                                </>
                              )}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => onToggleKnownMetamagic(option.id)}
                            aria-label={
                              isKnown
                                ? `Unpin ${option.name} from known metamagic`
                                : `Pin ${option.name} as known metamagic`
                            }
                            title={
                              isKnown
                                ? "Known Metamagic (click to unpin)"
                                : "Pin as Known Metamagic"
                            }
                            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border transition-colors shrink-0 ${
                              isKnown
                                ? "border-sienna/50 dark:border-brass/50 bg-paper dark:bg-obsidian text-sienna dark:text-brass"
                                : "border-transparent text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot"
                            }`}
                          >
                            {isKnown ? (
                              <BookmarkCheck className="w-4 h-4" />
                            ) : (
                              <Bookmark className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        <p className="text-sm text-ink-muted dark:text-ash leading-relaxed">
                          {isExpanded ? option.rules : option.summary}
                        </p>

                        <button
                          type="button"
                          onClick={() => toggleRuleExpand(option.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted dark:text-ash hover:text-lapis dark:hover:text-lapis-dark transition-colors"
                        >
                          <span>{isExpanded ? "Hide full rule" : "Full rule"}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="pt-2 border-t border-limestone/80 dark:border-charcoal-border/80 flex items-center justify-between gap-2">
                        {isTwinned ? (
                          <label className="flex items-center gap-1.5 text-xs text-ink-muted dark:text-ash min-w-0">
                            <span className="sr-only">Spell level for Twinned Spell</span>
                            <select
                              value={twinnedLevel}
                              onChange={(e) => setTwinnedLevel(Number(e.target.value))}
                              className="h-8 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian px-2 text-xs font-medium text-ink dark:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
                            >
                              {TWINNED_LEVEL_OPTIONS.map((lvl) => (
                                <option key={lvl.level} value={lvl.level}>
                                  {lvl.label} ({lvl.cost} SP)
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <span className="text-xs text-ink-muted dark:text-ash">
                            {isKnown ? "Known" : "Reference"}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            handleUseMetamagic(
                              option.id,
                              isTwinned
                                ? `${option.name} (${
                                    twinnedLevel === 0
                                      ? "Cantrip"
                                      : SPELL_LEVELS[twinnedLevel]?.shortLabel
                                  })`
                                : option.name,
                              cost
                            )
                          }
                          disabled={!canAfford}
                          className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                            isConfirmed
                              ? "border-sienna bg-sienna text-white dark:border-brass dark:bg-brass dark:text-obsidian animate-cast-confirm"
                              : canAfford
                              ? "border-limestone dark:border-charcoal-border bg-linen/70 dark:bg-soot text-ink dark:text-parchment hover:border-sienna dark:hover:border-brass hover:text-sienna dark:hover:text-brass"
                              : "border-limestone/60 dark:border-charcoal-border/60 text-ink-muted/50 dark:text-ash/40 cursor-not-allowed"
                          }`}
                        >
                          {isConfirmed ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Used</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Use · {cost} SP</span>
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Sticky Sidebar: Flexible Casting (Slot <-> SP Conversion) */}
        <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-6">
          <div className="rounded-lg border border-limestone dark:border-charcoal-border bg-linen/50 dark:bg-soot overflow-hidden">
            <div className="px-4 py-3 border-b border-limestone dark:border-charcoal-border">
              <h2 className="font-serif text-lg font-semibold text-ink dark:text-parchment">
                Flexible Casting
              </h2>
              <p className="text-xs text-ink-muted dark:text-ash mt-0.5">
                Bonus action to convert between spell slots and sorcery points.
              </p>
            </div>

            {/* Section 1: Create Spell Slot (SP -> Slot) */}
            <div className="p-4 space-y-3 border-b border-limestone dark:border-charcoal-border">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold text-ink dark:text-parchment">
                  Create Spell Slot
                </h3>
                <span className="text-[11px] font-mono text-ink-muted dark:text-ash">
                  SP → Slot
                </span>
              </div>

              <div className="space-y-2">
                {FLEXIBLE_CASTING_SLOT_COSTS.map((row) => {
                  const key = String(row.level);
                  const max = effectiveMaxSlots[key] ?? 0;
                  const used = Math.min(max, Math.max(0, slotState.used[key] ?? 0));
                  const remaining = Math.max(0, max - used);
                  const restoresExisting = used > 0;
                  const canAfford = remainingPoints >= row.cost;
                  const isConfirmed = recentActionKey === `create-${row.level}`;

                  return (
                    <div
                      key={row.level}
                      className="rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-ink dark:text-parchment">
                            {SPELL_LEVELS[row.level]?.shortLabel} Level
                          </span>
                          <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
                            {remaining}/{max}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-muted dark:text-ash">
                          {restoresExisting
                            ? "Restores 1 expended slot"
                            : "Adds +1 temporary slot"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCreateSlot(row.level, row.cost)}
                        disabled={!canAfford}
                        className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                          isConfirmed
                            ? "border-lapis bg-lapis text-white dark:border-lapis-dark dark:bg-lapis-dark dark:text-obsidian animate-cast-confirm"
                            : canAfford
                            ? "border-limestone dark:border-charcoal-border bg-linen/70 dark:bg-soot text-ink dark:text-parchment hover:border-lapis dark:hover:border-lapis-dark hover:text-lapis dark:hover:text-lapis-dark"
                            : "border-limestone/60 dark:border-charcoal-border/60 text-ink-muted/50 dark:text-ash/40 cursor-not-allowed"
                        }`}
                      >
                        {isConfirmed ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Created</span>
                          </>
                        ) : (
                          <>
                            <span className="font-mono">{row.cost} SP</span>
                            <ArrowRight className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-ink-muted dark:text-ash leading-relaxed">
                Any temporary slot created above your normal max vanishes when you finish a long rest.
              </p>
            </div>

            {/* Section 2: Convert Slot to Points (Slot -> SP) */}
            <div className="p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold text-ink dark:text-parchment">
                  Convert Slot to Points
                </h3>
                <span className="text-[11px] font-mono text-ink-muted dark:text-ash">
                  Slot → SP
                </span>
              </div>

              {activeSlotLevels.length === 0 ? (
                <p className="text-xs text-ink-muted dark:text-ash">
                  No spell slots available to convert.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeSlotLevels.map(({ lvl, max, remaining }) => {
                    const atCap = remainingPoints >= maxPoints;
                    const actualGain = Math.min(
                      lvl.index,
                      Math.max(0, maxPoints - remainingPoints)
                    );
                    const overflows = !atCap && actualGain < lvl.index;
                    const disabled = remaining <= 0 || atCap || maxPoints === 0;
                    const isConfirmed = recentActionKey === `convert-${lvl.index}`;

                    return (
                      <div
                        key={lvl.key}
                        className="rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-ink dark:text-parchment">
                              {lvl.shortLabel} Level
                            </span>
                            <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
                              {remaining}/{max} left
                            </span>
                          </div>
                          {overflows && (
                            <p className="text-[11px] text-sienna dark:text-brass">
                              Caps at max (+{actualGain} of {lvl.index} SP)
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleConvertSlot(lvl.index)}
                          disabled={disabled}
                          className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                            isConfirmed
                              ? "border-sienna bg-sienna text-white dark:border-brass dark:bg-brass dark:text-obsidian animate-cast-confirm"
                              : !disabled
                              ? "border-limestone dark:border-charcoal-border bg-linen/70 dark:bg-soot text-ink dark:text-parchment hover:border-sienna dark:hover:border-brass hover:text-sienna dark:hover:text-brass"
                              : "border-limestone/60 dark:border-charcoal-border/60 text-ink-muted/50 dark:text-ash/40 cursor-not-allowed"
                          }`}
                        >
                          {isConfirmed ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>+{actualGain || lvl.index} SP</span>
                            </>
                          ) : (
                            <span className="font-mono">+{lvl.index} SP</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {maxPoints > 0 && remainingPoints >= maxPoints && (
                <p className="text-[11px] text-ink-muted dark:text-ash">
                  Sorcery points are full ({remainingPoints}/{maxPoints}). You can never hold more than your maximum.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
