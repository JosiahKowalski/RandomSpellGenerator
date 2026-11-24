import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Dices,
  History,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Unlock,
  Wand2,
  X,
} from "lucide-react";
import {
  LevelShortfall,
  RandomizerConfig,
  RollHistoryEntry,
  SorceryState,
  Spell,
  SpellFilterTab,
  SpellSlotState,
} from "../types/spell";
import { SPELL_LEVELS } from "../lib/constants";
import { getEffectiveMaxSlots, getTotalPlannedRolls } from "../lib/spellEngine";
import { isPlayerRollableSpell } from "../lib/aiSpellRollCache";
import { useAiAvailability } from "../lib/useAiAvailability";
import { SpellSlotsPanel } from "./SpellSlotsPanel";

interface SpellbookViewProps {
  catalog: Spell[];
  knownSpells: Spell[];
  rolledSpells: Spell[];
  eligiblePoolCount: number;
  config: RandomizerConfig;
  shortfalls: LevelShortfall[];
  slotState: SpellSlotState;
  sorcery: SorceryState;
  concentrationSpell: string | null;
  rollHistory: RollHistoryEntry[];
  lastSlotFlash?: { level: number; seq: number } | null;
  onRollAll: () => void;
  onClearRolled: () => void;
  onRerollSingle: (spellName: string) => void;
  onToggleKnown: (spellName: string) => void;
  onAddKnownSpell: (spellName: string) => void;
  onOpenSpell: (spell: Spell) => void;
  onOpenRules: () => void;
  onOpenMetamagic: () => void;
  onCastSpell: (spell: Spell, slotLevel: number | null) => void;
  onCastAndRoll: (spell: Spell, slotLevel: number | null) => void;
  onExpendSlot: (level: number) => void;
  onRecoverSlot: (level: number) => void;
  onSetCustomMaxSlot: (level: number, nextMax: number) => void;
  onResetSlotDefaults: () => void;
  onSpendSorceryPoints: (amount: number, label?: string) => void;
  onRegainSorceryPoints: (amount: number) => void;
  onLongRest: () => void;
  onDropConcentration: () => void;
  onRestoreRollHistory: (entryId: string) => void;
  onClearRollHistory: () => void;
}

function formatHistoryTimestamp(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "Previous roll";
  const now = new Date();
  const isSameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();
  const timeStr = dt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (isSameDay) return timeStr;
  const dateStr = dt.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  return `${dateStr} · ${timeStr}`;
}

export const SpellbookView: React.FC<SpellbookViewProps> = ({
  catalog,
  knownSpells,
  rolledSpells,
  eligiblePoolCount,
  config,
  shortfalls,
  slotState,
  sorcery,
  concentrationSpell,
  rollHistory,
  lastSlotFlash,
  onRollAll,
  onClearRolled,
  onRerollSingle,
  onToggleKnown,
  onAddKnownSpell,
  onOpenSpell,
  onOpenRules,
  onOpenMetamagic,
  onCastSpell,
  onCastAndRoll,
  onExpendSlot,
  onRecoverSlot,
  onSetCustomMaxSlot,
  onResetSlotDefaults,
  onSpendSorceryPoints,
  onRegainSorceryPoints,
  onLongRest,
  onDropConcentration,
  onRestoreRollHistory,
  onClearRollHistory,
}) => {
  const aiAvailable = useAiAvailability();
  const [filterTab, setFilterTab] = useState<SpellFilterTab>("all");
  const [activeSearch, setActiveSearch] = useState("");
  const [isAddKnownOpen, setIsAddKnownOpen] = useState(false);
  const [knownAddQuery, setKnownAddQuery] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [castEffects, setCastEffects] = useState<Record<string, number>>({});

  const castTimersRef = useRef<Record<string, number>>({});
  const addKnownPopoverRef = useRef<HTMLDivElement | null>(null);
  const addKnownInputRef = useRef<HTMLInputElement | null>(null);
  const historyPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timers = castTimersRef.current;
    return () => {
      Object.values(timers).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  // Auto-focus Add Known search input when popover opens
  useEffect(() => {
    if (isAddKnownOpen) {
      window.setTimeout(() => addKnownInputRef.current?.focus(), 20);
    }
  }, [isAddKnownOpen]);

  // Close popovers on outside click or Escape
  useEffect(() => {
    if (!isAddKnownOpen && !isHistoryOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        isAddKnownOpen &&
        addKnownPopoverRef.current &&
        !addKnownPopoverRef.current.contains(target)
      ) {
        setIsAddKnownOpen(false);
      }
      if (
        isHistoryOpen &&
        historyPopoverRef.current &&
        !historyPopoverRef.current.contains(target)
      ) {
        setIsHistoryOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAddKnownOpen(false);
        setIsHistoryOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAddKnownOpen, isHistoryOpen]);

  // Close history popover automatically if history becomes empty
  useEffect(() => {
    if (rollHistory.length === 0 && isHistoryOpen) {
      setIsHistoryOpen(false);
    }
  }, [rollHistory.length, isHistoryOpen]);

  const triggerCardCast = (spell: Spell, slotLevel: number | null) => {
    onCastSpell(spell, slotLevel);
    const seq = Date.now() + Math.random();
    setCastEffects((prev) => ({ ...prev, [spell.id]: seq }));

    if (castTimersRef.current[spell.id]) {
      window.clearTimeout(castTimersRef.current[spell.id]);
    }
    castTimersRef.current[spell.id] = window.setTimeout(() => {
      setCastEffects((prev) => {
        if (prev[spell.id] !== seq) return prev;
        const next = { ...prev };
        delete next[spell.id];
        return next;
      });
      delete castTimersRef.current[spell.id];
    }, 760);
  };

  const effectiveMaxSlots = useMemo(
    () => getEffectiveMaxSlots(slotState, config.casterLevel),
    [slotState, config.casterLevel]
  );

  const concentrationSpellObj = useMemo(() => {
    if (!concentrationSpell) return null;
    const lower = concentrationSpell.toLowerCase();
    return catalog.find((s) => s.name.toLowerCase() === lower) || null;
  }, [concentrationSpell, catalog]);

  const knownNameSet = useMemo(
    () => new Set(knownSpells.map((s) => s.name.toLowerCase())),
    [knownSpells]
  );

  // Memoize which active spells require player attacks or dice rolls
  const playerRollableById = useMemo(() => {
    const map = new Map<string, boolean>();
    const aiEnabled = aiAvailable === true;
    for (const s of [...knownSpells, ...rolledSpells]) {
      if (!map.has(s.id)) {
        map.set(s.id, isPlayerRollableSpell(s, aiEnabled));
      }
    }
    return map;
  }, [knownSpells, rolledSpells, aiAvailable]);

  // Quick-add search across the entire catalog
  const addKnownResults = useMemo(() => {
    const q = knownAddQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) &&
          !knownNameSet.has(s.name.toLowerCase())
      )
      .slice(0, 8);
  }, [knownAddQuery, catalog, knownNameSet]);

  const combinedEntries = useMemo(() => {
    const entries: Array<{ spell: Spell; kind: "known" | "rolled" }> = [];
    if (filterTab === "all" || filterTab === "known") {
      for (const s of knownSpells) {
        entries.push({ spell: s, kind: "known" });
      }
    }
    if (filterTab === "all" || filterTab === "rolled") {
      for (const s of rolledSpells) {
        if (!knownNameSet.has(s.name.toLowerCase())) {
          entries.push({ spell: s, kind: "rolled" });
        }
      }
    }

    const q = activeSearch.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      ({ spell }) =>
        spell.name.toLowerCase().includes(q) ||
        spell.school.toLowerCase().includes(q) ||
        spell.castingTime.toLowerCase().includes(q)
    );
  }, [knownSpells, rolledSpells, filterTab, activeSearch, knownNameSet]);

  const groupedByLevel = useMemo(() => {
    const map = new Map<
      number,
      Array<{ spell: Spell; kind: "known" | "rolled" }>
    >();
    for (const entry of combinedEntries) {
      const list = map.get(entry.spell.levelIndex) || [];
      list.push(entry);
      map.set(entry.spell.levelIndex, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "known" ? -1 : 1;
        return a.spell.name.localeCompare(b.spell.name);
      });
    }
    return map;
  }, [combinedEntries]);

  const totalPlannedRolls = getTotalPlannedRolls(config);
  const activeLevelMeta = SPELL_LEVELS[config.maxSpellLevel];
  const totalActiveCount = knownSpells.length + rolledSpells.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
      {/* Main Reading Column: Active Spellbook */}
      <div className="lg:col-span-8 space-y-6">
        {/* Compact Editorial Header + Unified Toolbar */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-limestone dark:border-charcoal-border">
            <div className="min-w-0">
              <p className="text-xs text-ink-muted dark:text-ash font-mono tabular-nums">
                Lv. {config.casterLevel} · Up to {activeLevelMeta?.shortLabel} ·{" "}
                {knownSpells.length} Known · {rolledSpells.length} Rolled
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-ink dark:text-parchment mt-1">
                Active Spellbook
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {rollHistory.length > 0 && (
                <div className="relative" ref={historyPopoverRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsHistoryOpen((prev) => !prev);
                      setIsAddKnownOpen(false);
                    }}
                    aria-expanded={isHistoryOpen}
                    className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
                      isHistoryOpen
                        ? "border-lapis text-lapis bg-linen dark:border-lapis-dark dark:text-lapis-dark dark:bg-soot"
                        : "border-limestone dark:border-charcoal-border text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot"
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span className="font-mono tabular-nums">
                      History ({rollHistory.length})
                    </span>
                  </button>

                  {isHistoryOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot shadow-xl z-40 overflow-hidden">
                      <div className="px-3.5 py-2.5 border-b border-limestone dark:border-charcoal-border flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-ink dark:text-parchment">
                          Previous Rolls
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onClearRollHistory();
                            setIsHistoryOpen(false);
                          }}
                          className="text-xs text-ink-muted dark:text-ash hover:text-sienna dark:hover:text-brass transition-colors"
                        >
                          Clear all
                        </button>
                      </div>

                      <div className="max-h-72 overflow-y-auto divide-y divide-limestone/70 dark:divide-charcoal-border/70">
                        {rollHistory.map((entry) => {
                          const preview = entry.rolledSpellNames
                            .slice(0, 3)
                            .join(", ");
                          const extra = Math.max(
                            0,
                            entry.rolledSpellNames.length - 3
                          );
                          return (
                            <div
                              key={entry.id}
                              className="px-3.5 py-2.5 flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-mono tabular-nums text-ink dark:text-parchment">
                                  {formatHistoryTimestamp(entry.rolledAt)} ·{" "}
                                  {entry.rolledSpellNames.length} spell
                                  {entry.rolledSpellNames.length === 1
                                    ? ""
                                    : "s"}
                                </p>
                                <p className="text-xs text-ink-muted dark:text-ash truncate mt-0.5">
                                  {preview}
                                  {extra > 0 ? ` +${extra} more` : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onRestoreRollHistory(entry.id);
                                  setIsHistoryOpen(false);
                                }}
                                className="h-7 px-2.5 inline-flex items-center gap-1 rounded border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-medium text-ink dark:text-parchment hover:border-lapis hover:text-lapis dark:hover:border-lapis-dark dark:hover:text-lapis-dark transition-colors shrink-0"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Restore</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {rolledSpells.length > 0 && (
                <button
                  type="button"
                  onClick={onClearRolled}
                  className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-limestone dark:border-charcoal-border text-xs font-medium text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Rolled</span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenRules}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-limestone dark:border-charcoal-border text-xs font-medium text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Rules</span>
              </button>
            </div>
          </div>

          {/* Single Unified Toolbar: Filter Active Spells + Segmented Filter + Add Known Popover */}
          <div className="flex flex-col md:flex-row md:items-center gap-2.5">
            {/* Filter Active Spells */}
            <div className="relative flex-1 min-w-0">
              <label htmlFor="filter-active-spells" className="sr-only">
                Filter active spells
              </label>
              <Search className="w-4 h-4 text-ink-muted dark:text-ash absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="filter-active-spells"
                type="text"
                value={activeSearch}
                onChange={(e) => setActiveSearch(e.target.value)}
                placeholder="Filter active spells by name, school, or casting time..."
                className="w-full h-10 pl-9 pr-8 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot text-sm text-ink dark:text-parchment placeholder:text-ink-muted/70 dark:placeholder:text-ash/60 focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
              />
              {activeSearch && (
                <button
                  type="button"
                  onClick={() => setActiveSearch("")}
                  aria-label="Clear active spell filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Segmented Filter */}
              <div className="flex-1 md:flex-none flex items-center gap-0.5 p-1 rounded-md bg-linen dark:bg-soot border border-limestone dark:border-charcoal-border">
                {(
                  [
                    { id: "all", label: `All (${totalActiveCount})` },
                    { id: "rolled", label: `Rolled (${rolledSpells.length})` },
                    { id: "known", label: `Known (${knownSpells.length})` },
                  ] as const
                ).map((tab) => {
                  const active = filterTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilterTab(tab.id)}
                      className={`h-8 px-2.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                        active
                          ? "bg-paper dark:bg-obsidian text-ink dark:text-parchment shadow-xs"
                          : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Add Known Button + Anchored Popover */}
              <div className="relative shrink-0" ref={addKnownPopoverRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddKnownOpen((prev) => !prev);
                    setIsHistoryOpen(false);
                  }}
                  aria-expanded={isAddKnownOpen}
                  className={`h-10 px-3 inline-flex items-center gap-1.5 rounded-md border text-xs font-medium whitespace-nowrap transition-colors ${
                    isAddKnownOpen
                      ? "border-sienna text-sienna bg-linen dark:border-brass dark:text-brass dark:bg-soot"
                      : "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink dark:text-parchment hover:border-sienna hover:text-sienna dark:hover:border-brass dark:hover:text-brass"
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Known</span>
                </button>

                {isAddKnownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot shadow-xl z-40 overflow-hidden">
                    <div className="p-2.5 border-b border-limestone dark:border-charcoal-border flex items-center gap-2">
                      <div className="relative flex-1 min-w-0">
                        <Search className="w-3.5 h-3.5 text-ink-muted dark:text-ash absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          ref={addKnownInputRef}
                          type="text"
                          value={knownAddQuery}
                          onChange={(e) => setKnownAddQuery(e.target.value)}
                          placeholder="Search 5e spells to lock (e.g., Shield)..."
                          className="w-full h-9 pl-8 pr-7 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-sm text-ink dark:text-parchment placeholder:text-ink-muted/70 dark:placeholder:text-ash/60 focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
                        />
                        {knownAddQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setKnownAddQuery("");
                              addKnownInputRef.current?.focus();
                            }}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAddKnownOpen(false)}
                        aria-label="Close add known popover"
                        className="h-9 w-8 inline-flex items-center justify-center rounded text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {knownAddQuery.trim().length < 2 ? (
                      <p className="px-3.5 py-3 text-xs text-ink-muted dark:text-ash">
                        Type at least 2 characters to lock a permanent known
                        spell. Known spells stay pinned when you reroll.
                      </p>
                    ) : addKnownResults.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto divide-y divide-limestone/60 dark:divide-charcoal-border/60">
                        {addKnownResults.map((spell) => (
                          <button
                            key={spell.id}
                            type="button"
                            onClick={() => {
                              onAddKnownSpell(spell.name);
                              setKnownAddQuery("");
                              addKnownInputRef.current?.focus();
                            }}
                            className="w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 hover:bg-linen dark:hover:bg-obsidian transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink dark:text-parchment truncate">
                                {spell.name}
                              </p>
                              <p className="text-xs text-ink-muted dark:text-ash truncate">
                                {SPELL_LEVELS[spell.levelIndex]?.shortLabel} ·{" "}
                                {spell.schoolBase}
                                {spell.source ? ` · ${spell.source}` : ""}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-sienna dark:text-brass shrink-0">
                              <Lock className="w-3 h-3" />
                              Lock
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="px-3.5 py-3 text-xs text-ink-muted dark:text-ash">
                        No matching spells found outside your known list.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Shortfall Warning if any level ran out of eligible spells */}
          {shortfalls.length > 0 && (
            <div className="p-4 rounded-md border border-sienna/30 dark:border-brass/30 bg-linen dark:bg-soot flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-sienna dark:text-brass shrink-0 mt-0.5" />
                <div className="text-sm text-ink dark:text-parchment">
                  <p className="font-medium">
                    Some levels had fewer matching spells than requested
                  </p>
                  <p className="text-xs text-ink-muted dark:text-ash mt-0.5">
                    {shortfalls
                      .map(
                        (sf) =>
                          `${SPELL_LEVELS[sf.levelIndex]?.shortLabel}: rolled ${sf.available}/${sf.requested}`
                      )
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenRules}
                className="text-xs font-medium text-lapis dark:text-lapis-dark hover:underline whitespace-nowrap shrink-0"
              >
                Adjust Filters
              </button>
            </div>
          )}
        </section>

        {/* Grouped Spell Sections */}
        {combinedEntries.length === 0 ? (
          <div className="border border-dashed border-limestone dark:border-charcoal-border rounded-lg py-16 px-6 text-center space-y-4">
            <h2 className="font-serif text-2xl font-semibold text-ink dark:text-parchment">
              {totalActiveCount === 0
                ? "No spells yet"
                : "No spells match this filter"}
            </h2>
            <p className="text-sm text-ink-muted dark:text-ash max-w-md mx-auto leading-relaxed">
              {totalActiveCount === 0
                ? "Lock your permanent known spells with Add Known, or roll a fresh random spellbook with one click."
                : "Switch tabs or clear your search phrase to view your active spells."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {totalActiveCount === 0 ? (
                <>
                  <button
                    type="button"
                    onClick={onRollAll}
                    className="h-10 px-5 inline-flex items-center gap-2 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-sm font-medium transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Roll {totalPlannedRolls} Spells</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddKnownOpen(true)}
                    className="h-10 px-4 inline-flex items-center gap-2 rounded-md border border-limestone dark:border-charcoal-border text-sm font-medium text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Known Spell</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFilterTab("all");
                    setActiveSearch("");
                  }}
                  className="h-10 px-4 rounded-md border border-limestone dark:border-charcoal-border text-sm font-medium hover:bg-linen dark:hover:bg-soot transition-colors"
                >
                  Show All Active Spells
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {SPELL_LEVELS.map((lvl) => {
              const entries = groupedByLevel.get(lvl.index);
              if (!entries || entries.length === 0) return null;

              const knownCount = entries.filter(
                (e) => e.kind === "known"
              ).length;
              const rolledCount = entries.filter(
                (e) => e.kind === "rolled"
              ).length;
              const levelMaxSlots =
                lvl.index > 0 ? effectiveMaxSlots[lvl.key] ?? 0 : 0;
              const levelUsedSlots = Math.min(
                levelMaxSlots,
                Math.max(0, slotState.used[lvl.key] ?? 0)
              );
              const levelRemainingSlots = Math.max(
                0,
                levelMaxSlots - levelUsedSlots
              );

              return (
                <section key={lvl.key} className="space-y-3.5">
                  <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-limestone dark:border-charcoal-border">
                    <h2 className="font-serif text-xl font-semibold text-ink dark:text-parchment">
                      {lvl.heading}
                    </h2>
                    <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
                      {knownCount > 0 ? `${knownCount} known` : ""}
                      {knownCount > 0 && rolledCount > 0 ? " · " : ""}
                      {rolledCount > 0 ? `${rolledCount} rolled` : ""}
                      {levelMaxSlots > 0
                        ? ` · ${levelRemainingSlots}/${levelMaxSlots} slots`
                        : ""}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {entries.map(({ spell, kind }) => {
                      const isKnown = kind === "known";
                      const isConcentrating = Boolean(
                        concentrationSpell &&
                          concentrationSpell.toLowerCase() ===
                            spell.name.toLowerCase()
                      );
                      const castSeq = castEffects[spell.id];
                      const isJustCast = Boolean(castSeq);

                      // Resolve quickest valid cast option for this card
                      let quickCastMode:
                        | "cantrip"
                        | "base"
                        | "upcast"
                        | "ritual"
                        | "empty" = "empty";
                      let quickCastSlotLevel: number | null = null;
                      if (spell.levelIndex === 0) {
                        quickCastMode = "cantrip";
                      } else {
                        for (let sLvl = spell.levelIndex; sLvl <= 9; sLvl++) {
                          const sKey = String(sLvl);
                          const sMax = effectiveMaxSlots[sKey] ?? 0;
                          const sUsed = Math.min(
                            sMax,
                            Math.max(0, slotState.used[sKey] ?? 0)
                          );
                          if (sMax - sUsed > 0) {
                            quickCastSlotLevel = sLvl;
                            quickCastMode =
                              sLvl === spell.levelIndex ? "base" : "upcast";
                            break;
                          }
                        }
                        if (
                          quickCastMode === "empty" &&
                          config.canRitualCast &&
                          spell.isRitual
                        ) {
                          quickCastMode = "ritual";
                        }
                      }

                      const showSideRitualButton =
                        config.canRitualCast &&
                        spell.isRitual &&
                        spell.levelIndex > 0 &&
                        (quickCastMode === "base" ||
                          quickCastMode === "upcast");

                      const canQuickCast = quickCastMode !== "empty";
                      const castButtonLabel = isJustCast
                        ? "Cast"
                        : quickCastMode === "upcast" && quickCastSlotLevel
                        ? `Cast (${SPELL_LEVELS[quickCastSlotLevel]?.shortLabel})`
                        : quickCastMode === "ritual"
                        ? "Ritual"
                        : quickCastMode === "empty"
                        ? "No slots"
                        : "Cast";

                      const castButtonTitle =
                        quickCastMode === "cantrip"
                          ? spell.isConcentration
                            ? `Quick cast ${spell.name} (cantrip, sets concentration)`
                            : `Quick cast ${spell.name} (cantrip)`
                          : quickCastMode === "base" && quickCastSlotLevel
                          ? `Quick cast ${spell.name} using a ${SPELL_LEVELS[quickCastSlotLevel]?.shortLabel}-level slot`
                          : quickCastMode === "upcast" && quickCastSlotLevel
                          ? `No ${SPELL_LEVELS[spell.levelIndex]?.shortLabel}-level slots left — upcast using a ${SPELL_LEVELS[quickCastSlotLevel]?.shortLabel}-level slot`
                          : quickCastMode === "ritual"
                          ? `Cast ${spell.name} as a ritual (no slot used)`
                          : `No ${SPELL_LEVELS[spell.levelIndex]?.shortLabel}+ spell slots remaining`;

                      return (
                        <article
                          key={`${kind}-${spell.id}`}
                          onClick={() => onOpenSpell(spell)}
                          className={`group relative overflow-hidden rounded-lg border p-4 cursor-pointer transition-colors flex flex-col justify-between gap-3 ${
                            isConcentrating
                              ? isKnown
                                ? "bg-linen/75 dark:bg-soot border-sienna/60 dark:border-brass/60 hover:border-sienna dark:hover:border-brass"
                                : "bg-paper dark:bg-obsidian border-sienna/60 dark:border-brass/60 hover:bg-linen/50 dark:hover:bg-soot"
                              : isKnown
                              ? "bg-linen/75 dark:bg-soot border-limestone dark:border-charcoal-border hover:border-stone-400 dark:hover:border-stone-600"
                              : "bg-paper dark:bg-obsidian border-limestone dark:border-charcoal-border hover:bg-linen/50 dark:hover:bg-soot"
                          }`}
                        >
                          {/* Subtle Cast Sheen & Border Pulse Overlay */}
                          {isJustCast && (
                            <div
                              key={castSeq}
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
                            >
                              <div
                                className={`absolute inset-y-0 -left-1/3 w-2/3 animate-cast-sheen ${
                                  spell.isConcentration
                                    ? "bg-gradient-to-r from-transparent via-sienna/14 dark:via-brass/18 to-transparent"
                                    : "bg-gradient-to-r from-transparent via-lapis/14 dark:via-lapis-dark/18 to-transparent"
                                }`}
                              />
                              <div
                                className={`absolute inset-0 rounded-lg border animate-cast-ring ${
                                  spell.isConcentration
                                    ? "border-sienna dark:border-brass"
                                    : "border-lapis dark:border-lapis-dark"
                                }`}
                              />
                            </div>
                          )}

                          {/* Top Row: Metadata, Title, Secondary Icons */}
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-1.5 text-xs text-ink-muted dark:text-ash">
                                {isKnown ? (
                                  <span className="inline-flex items-center gap-1 font-medium text-sienna dark:text-brass">
                                    <Lock className="w-3 h-3" />
                                    Known
                                  </span>
                                ) : (
                                  <span className="font-medium text-lapis dark:text-lapis-dark">
                                    Rolled
                                  </span>
                                )}
                                <span aria-hidden="true">·</span>
                                <span className="truncate">
                                  {spell.schoolBase}
                                </span>
                                {isConcentrating ? (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-medium text-sienna dark:text-brass whitespace-nowrap">
                                      Concentrating
                                    </span>
                                  </>
                                ) : (
                                  spell.isConcentration && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>Conc.</span>
                                    </>
                                  )
                                )}
                                {spell.isRitual && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>Ritual</span>
                                  </>
                                )}
                              </div>

                              <h3 className="font-serif text-lg font-semibold text-ink dark:text-parchment truncate group-hover:text-lapis dark:group-hover:text-lapis-dark transition-colors">
                                {spell.name}
                              </h3>
                            </div>

                            <div
                              className="flex items-center gap-0.5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!isKnown && (
                                <button
                                  type="button"
                                  onClick={() => onRerollSingle(spell.name)}
                                  title={`Reroll ${spell.name}`}
                                  aria-label={`Reroll ${spell.name}`}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-muted dark:text-ash hover:text-lapis dark:hover:text-lapis-dark hover:bg-linen dark:hover:bg-obsidian transition-colors"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onToggleKnown(spell.name)}
                                title={
                                  isKnown
                                    ? `Remove ${spell.name} from known spells`
                                    : `Lock ${spell.name} as a known spell`
                                }
                                aria-label={
                                  isKnown
                                    ? `Remove ${spell.name} from known spells`
                                    : `Lock ${spell.name} as a known spell`
                                }
                                className={`h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors ${
                                  isKnown
                                    ? "text-sienna dark:text-brass hover:bg-paper dark:hover:bg-obsidian"
                                    : "text-ink-muted dark:text-ash hover:text-sienna dark:hover:text-brass hover:bg-linen dark:hover:bg-soot"
                                }`}
                              >
                                {isKnown ? (
                                  <Lock className="w-3.5 h-3.5" />
                                ) : (
                                  <Unlock className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Bottom Row: Spell Timing Metadata + Quick Cast */}
                          <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-limestone/60 dark:border-charcoal-border/60">
                            <p className="text-xs text-ink-muted dark:text-ash truncate min-w-0">
                              {spell.castingTime}
                              {spell.range ? ` · ${spell.range}` : ""}
                              {spell.duration ? ` · ${spell.duration}` : ""}
                            </p>

                            <div
                              className="flex items-center gap-1.5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {showSideRitualButton && (
                                <button
                                  type="button"
                                  onClick={() => triggerCardCast(spell, null)}
                                  title={`Cast ${spell.name} as a ritual (no slot used)`}
                                  aria-label={`Cast ${spell.name} as a ritual`}
                                  className="h-8 px-2.5 inline-flex items-center rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-medium text-ink-muted dark:text-ash hover:border-lapis hover:text-lapis dark:hover:border-lapis-dark dark:hover:text-lapis-dark active:scale-[0.95] transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
                                >
                                  Ritual
                                </button>
                              )}

                              {canQuickCast &&
                              quickCastMode !== "ritual" &&
                              playerRollableById.get(spell.id) ? (
                                <div
                                  className={`inline-flex items-stretch rounded-md border overflow-hidden divide-x shrink-0 transition-colors ${
                                    isJustCast
                                      ? spell.isConcentration
                                        ? "border-sienna dark:border-brass divide-white/25 dark:divide-obsidian/25"
                                        : "border-lapis dark:border-lapis-dark divide-white/25 dark:divide-obsidian/25"
                                      : quickCastMode === "upcast"
                                      ? "border-sienna/45 dark:border-brass/45 divide-sienna/30 dark:divide-brass/30 bg-paper dark:bg-obsidian"
                                      : "border-limestone dark:border-charcoal-border divide-limestone dark:divide-charcoal-border bg-paper dark:bg-obsidian"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerCardCast(spell, quickCastSlotLevel)
                                    }
                                    title={castButtonTitle}
                                    aria-label={castButtonTitle}
                                    className={`h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
                                      isJustCast
                                        ? spell.isConcentration
                                          ? "bg-sienna text-white dark:bg-brass dark:text-obsidian"
                                          : "bg-lapis text-white dark:bg-lapis-dark dark:text-obsidian"
                                        : quickCastMode === "upcast"
                                        ? "text-sienna dark:text-brass hover:bg-sienna hover:text-white dark:hover:bg-brass dark:hover:text-obsidian"
                                        : "text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot hover:text-lapis dark:hover:text-lapis-dark"
                                    }`}
                                  >
                                    {isJustCast ? (
                                      <Check className="w-3.5 h-3.5 animate-cast-check-pop" />
                                    ) : (
                                      <Wand2 className="w-3.5 h-3.5" />
                                    )}
                                    <span>{castButtonLabel}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      onCastAndRoll(spell, quickCastSlotLevel)
                                    }
                                    title={
                                      quickCastMode === "upcast" &&
                                      quickCastSlotLevel
                                        ? `Upcast ${spell.name} (${SPELL_LEVELS[quickCastSlotLevel]?.shortLabel} slot) & open Dice Tray`
                                        : `Cast ${spell.name} & open Dice Tray`
                                    }
                                    aria-label={`Cast ${spell.name} and roll in Dice Tray`}
                                    className={`h-8 w-8 inline-flex items-center justify-center transition-colors duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sienna dark:focus-visible:ring-brass ${
                                      isJustCast
                                        ? spell.isConcentration
                                          ? "bg-sienna text-white dark:bg-brass dark:text-obsidian"
                                          : "bg-lapis text-white dark:bg-lapis-dark dark:text-obsidian"
                                        : quickCastMode === "upcast"
                                        ? "text-sienna dark:text-brass hover:bg-sienna hover:text-white dark:hover:bg-brass dark:hover:text-obsidian"
                                        : "text-ink-muted dark:text-ash hover:bg-sienna/10 hover:text-sienna dark:hover:bg-brass/15 dark:hover:text-brass"
                                    }`}
                                  >
                                    <Dices className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!canQuickCast}
                                  onClick={() => {
                                    if (!canQuickCast) return;
                                    triggerCardCast(spell, quickCastSlotLevel);
                                  }}
                                  title={castButtonTitle}
                                  aria-label={castButtonTitle}
                                  className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border text-xs font-medium transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
                                    isJustCast
                                      ? spell.isConcentration
                                        ? "bg-sienna text-white border-sienna dark:bg-brass dark:text-obsidian dark:border-brass"
                                        : "bg-lapis text-white border-lapis dark:bg-lapis-dark dark:text-obsidian dark:border-lapis-dark"
                                      : !canQuickCast
                                      ? "border-limestone/70 dark:border-charcoal-border/70 text-ink-muted/55 dark:text-ash/45 bg-transparent cursor-not-allowed"
                                      : quickCastMode === "upcast"
                                      ? "border-sienna/35 dark:border-brass/40 bg-paper dark:bg-obsidian text-sienna dark:text-brass hover:bg-sienna hover:text-white hover:border-sienna dark:hover:bg-brass dark:hover:text-obsidian dark:hover:border-brass active:scale-[0.95]"
                                      : "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink dark:text-parchment hover:border-lapis hover:text-lapis dark:hover:border-lapis-dark dark:hover:text-lapis-dark active:scale-[0.95]"
                                  }`}
                                >
                                  {isJustCast ? (
                                    <Check className="w-3.5 h-3.5 animate-cast-check-pop" />
                                  ) : (
                                    <Wand2 className="w-3.5 h-3.5" />
                                  )}
                                  <span>{castButtonLabel}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Right Rail: Combat Resources (Concentration, Spell Slots, Sorcery Points) */}
      <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-3">
        <SpellSlotsPanel
          casterLevel={config.casterLevel}
          slotState={slotState}
          sorcery={sorcery}
          concentrationSpell={concentrationSpell}
          concentrationSpellObj={concentrationSpellObj}
          lastSlotFlash={lastSlotFlash}
          onExpendSlot={onExpendSlot}
          onRecoverSlot={onRecoverSlot}
          onSetCustomMaxSlot={onSetCustomMaxSlot}
          onResetSlotDefaults={onResetSlotDefaults}
          onSpendSorceryPoints={onSpendSorceryPoints}
          onRegainSorceryPoints={onRegainSorceryPoints}
          onOpenMetamagic={onOpenMetamagic}
          onLongRest={onLongRest}
          onDropConcentration={onDropConcentration}
          onOpenSpell={onOpenSpell}
        />

        <div className="px-1 flex items-center justify-between gap-3 text-xs text-ink-muted dark:text-ash">
          <span className="font-mono tabular-nums truncate">
            Next roll: {totalPlannedRolls} spells · {eligiblePoolCount} eligible
          </span>
          <button
            type="button"
            onClick={onOpenRules}
            className="font-medium text-lapis dark:text-lapis-dark hover:underline whitespace-nowrap shrink-0"
          >
            Edit Rules
          </button>
        </div>
      </aside>
    </div>
  );
};
