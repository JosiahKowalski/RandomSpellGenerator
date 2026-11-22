import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
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
  Spell,
  SpellFilterTab,
  SpellSlotState,
} from "../types/spell";
import {
  casterLevelToMaxSpellLevel,
  DND_CLASSES,
  MAGIC_SCHOOLS,
  SPELL_LEVELS,
} from "../lib/constants";
import {
  getEffectiveMaxSlots,
  getTotalPlannedRolls,
  summarizeWeights,
} from "../lib/spellEngine";
import { SpellSlotsPanel } from "./SpellSlotsPanel";

interface SpellbookViewProps {
  catalog: Spell[];
  knownSpells: Spell[];
  rolledSpells: Spell[];
  eligiblePoolCount: number;
  config: RandomizerConfig;
  shortfalls: LevelShortfall[];
  slotState: SpellSlotState;
  concentrationSpell: string | null;
  rollHistory: RollHistoryEntry[];
  lastSlotFlash?: { level: number; seq: number } | null;
  onRollAll: () => void;
  onClearRolled: () => void;
  onRerollSingle: (spellName: string) => void;
  onToggleKnown: (spellName: string) => void;
  onAddKnownSpell: (spellName: string) => void;
  onOpenSpell: (spell: Spell) => void;
  onUpdateConfig: (next: RandomizerConfig) => void;
  onOpenRules: () => void;
  onCastSpell: (spell: Spell, slotLevel: number | null) => void;
  onExpendSlot: (level: number) => void;
  onRecoverSlot: (level: number) => void;
  onSetCustomMaxSlot: (level: number, nextMax: number) => void;
  onResetSlotDefaults: () => void;
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
  concentrationSpell,
  rollHistory,
  lastSlotFlash,
  onRollAll,
  onClearRolled,
  onRerollSingle,
  onToggleKnown,
  onAddKnownSpell,
  onOpenSpell,
  onUpdateConfig,
  onOpenRules,
  onCastSpell,
  onExpendSlot,
  onRecoverSlot,
  onSetCustomMaxSlot,
  onResetSlotDefaults,
  onLongRest,
  onDropConcentration,
  onRestoreRollHistory,
  onClearRollHistory,
}) => {
  const [filterTab, setFilterTab] = useState<SpellFilterTab>("all");
  const [activeSearch, setActiveSearch] = useState("");
  const [knownAddQuery, setKnownAddQuery] = useState("");
  const [showKnownDropdown, setShowKnownDropdown] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [castEffects, setCastEffects] = useState<Record<string, number>>({});
  const castTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const timers = castTimersRef.current;
    return () => {
      Object.values(timers).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

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

  const handleQuickCasterLevelChange = (newLevel: number) => {
    const clamped = Math.max(1, Math.min(20, newLevel));
    onUpdateConfig({
      ...config,
      casterLevel: clamped,
      maxSpellLevel: casterLevelToMaxSpellLevel(clamped),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
      {/* Main Reading Column */}
      <div className="lg:col-span-8 space-y-8">
        {/* Editorial Heading & Quick-Add Known Spells */}
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-limestone dark:border-charcoal-border">
            <div>
              <p className="text-xs text-ink-muted dark:text-ash font-mono tabular-nums">
                Caster Lv. {config.casterLevel} · Up to{" "}
                {activeLevelMeta?.shortLabel} Level · {knownSpells.length} Known ·{" "}
                {rolledSpells.length} Rolled
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-ink dark:text-parchment mt-1">
                Active Spellbook
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {rolledSpells.length > 0 && (
                <button
                  type="button"
                  onClick={onClearRolled}
                  className="h-10 px-3.5 inline-flex items-center gap-2 rounded-md border border-limestone dark:border-charcoal-border text-sm text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear Rolled</span>
                </button>
              )}
              <button
                type="button"
                onClick={onRollAll}
                className="h-10 px-4 inline-flex items-center gap-2 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-sm font-medium transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Roll Random Spells</span>
              </button>
            </div>
          </div>

          {/* Spell Slots & Concentration Tracker */}
          <SpellSlotsPanel
            casterLevel={config.casterLevel}
            slotState={slotState}
            concentrationSpell={concentrationSpell}
            concentrationSpellObj={concentrationSpellObj}
            lastSlotFlash={lastSlotFlash}
            onExpendSlot={onExpendSlot}
            onRecoverSlot={onRecoverSlot}
            onSetCustomMaxSlot={onSetCustomMaxSlot}
            onResetSlotDefaults={onResetSlotDefaults}
            onLongRest={onLongRest}
            onDropConcentration={onDropConcentration}
            onOpenSpell={onOpenSpell}
          />

          {/* Controls Row: Quick-Add Known Spell + Filter Tabs */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Add Known Spell Autocomplete */}
            <div className="md:col-span-7 relative">
              <label htmlFor="add-known-spell-input" className="sr-only">
                Add a known permanent spell
              </label>
              <Plus className="w-4 h-4 text-ink-muted dark:text-ash absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="add-known-spell-input"
                type="text"
                value={knownAddQuery}
                onChange={(e) => {
                  setKnownAddQuery(e.target.value);
                  setShowKnownDropdown(true);
                }}
                onFocus={() => setShowKnownDropdown(true)}
                onBlur={() => setTimeout(() => setShowKnownDropdown(false), 180)}
                placeholder="Add a permanent known spell (e.g., Shield, Misty Step)..."
                className="w-full h-11 pl-10 pr-9 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot text-sm text-ink dark:text-parchment placeholder:text-ink-muted/70 dark:placeholder:text-ash/60 focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
              />
              {knownAddQuery && (
                <button
                  type="button"
                  onClick={() => setKnownAddQuery("")}
                  aria-label="Clear known spell search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {showKnownDropdown && knownAddQuery.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-paper dark:bg-soot border border-limestone dark:border-charcoal-border rounded-md shadow-xl z-40 overflow-hidden">
                  {addKnownResults.length > 0 ? (
                    addKnownResults.map((spell) => (
                      <button
                        key={spell.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onAddKnownSpell(spell.name);
                          setKnownAddQuery("");
                          setShowKnownDropdown(false);
                        }}
                        className="w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 border-b border-limestone/60 dark:border-charcoal-border/60 last:border-0 hover:bg-linen dark:hover:bg-obsidian transition-colors"
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
                        <span className="text-xs font-medium text-lapis dark:text-lapis-dark shrink-0">
                          Add Known
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-3 text-sm text-ink-muted dark:text-ash">
                      No matching spells found outside your known list.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Active View Segmented Filter */}
            <div className="md:col-span-5 flex items-center gap-1 p-1 rounded-md bg-linen dark:bg-soot border border-limestone dark:border-charcoal-border">
              {(
                [
                  {
                    id: "all",
                    label: `All (${knownSpells.length + rolledSpells.length})`,
                  },
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
                    className={`flex-1 h-9 px-2 rounded text-xs font-medium whitespace-nowrap transition-colors ${
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
          </div>

          {/* Search Within Active Spellbook (shown when spells exist) */}
          {knownSpells.length + rolledSpells.length > 4 && (
            <div className="relative">
              <Search className="w-4 h-4 text-ink-muted dark:text-ash absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={activeSearch}
                onChange={(e) => setActiveSearch(e.target.value)}
                placeholder="Filter your active spells by name, school, or casting time..."
                className="w-full h-10 pl-10 pr-9 rounded-md border border-limestone dark:border-charcoal-border bg-transparent text-sm text-ink dark:text-parchment placeholder:text-ink-muted/70 dark:placeholder:text-ash/60 focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
              />
              {activeSearch && (
                <button
                  type="button"
                  onClick={() => setActiveSearch("")}
                  aria-label="Clear active spell filter"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

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
              {knownSpells.length + rolledSpells.length === 0
                ? "No spells yet"
                : "No spells match this filter"}
            </h2>
            <p className="text-sm text-ink-muted dark:text-ash max-w-md mx-auto leading-relaxed">
              {knownSpells.length + rolledSpells.length === 0
                ? "Add your permanent known spells above, then roll random spells on top with one click."
                : "Switch tabs or clear your search phrase to view your active spells."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {knownSpells.length + rolledSpells.length === 0 ? (
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
                    onClick={onOpenRules}
                    className="h-10 px-4 inline-flex items-center gap-2 rounded-md border border-limestone dark:border-charcoal-border text-sm font-medium text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Customize Rules</span>
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
          <div className="space-y-9">
            {SPELL_LEVELS.map((lvl) => {
              const entries = groupedByLevel.get(lvl.index);
              if (!entries || entries.length === 0) return null;

              const knownCount = entries.filter((e) => e.kind === "known").length;
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
                <section key={lvl.key} className="space-y-4">
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

      {/* Right Summary Rail: Quick Roll Controls & Roll History */}
      <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-6">
        <aside className="border border-limestone dark:border-charcoal-border rounded-lg bg-linen/60 dark:bg-soot p-6 space-y-6">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-limestone dark:border-charcoal-border">
            <h2 className="font-serif text-lg font-semibold text-ink dark:text-parchment">
              Roll Configuration
            </h2>
            <button
              type="button"
              onClick={onOpenRules}
              className="text-xs font-medium text-lapis dark:text-lapis-dark hover:underline whitespace-nowrap"
            >
              Edit Rules
            </button>
          </div>

          {/* Quick Caster Level Stepper */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted dark:text-ash">
                Caster Level
              </span>
              <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
                Unlocks up to {activeLevelMeta?.shortLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleQuickCasterLevelChange(config.casterLevel - 1)}
                disabled={config.casterLevel <= 1}
                aria-label="Decrease caster level"
                className="h-10 w-10 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink dark:text-parchment font-mono text-base hover:bg-linen dark:hover:bg-soot disabled:opacity-40 transition-colors"
              >
                −
              </button>
              <div className="flex-1 h-10 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian flex items-center justify-center font-mono tabular-nums text-sm font-semibold text-ink dark:text-parchment">
                Level {config.casterLevel}
              </div>
              <button
                type="button"
                onClick={() => handleQuickCasterLevelChange(config.casterLevel + 1)}
                disabled={config.casterLevel >= 20}
                aria-label="Increase caster level"
                className="h-10 w-10 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink dark:text-parchment font-mono text-base hover:bg-linen dark:hover:bg-soot disabled:opacity-40 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Quick Ritual Casting Toggle */}
          <div className="flex items-center justify-between gap-3 py-2.5 border-y border-limestone/80 dark:border-charcoal-border/80">
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink dark:text-parchment">
                Ritual Casting
              </p>
              <p className="text-[11px] text-ink-muted dark:text-ash">
                {config.canRitualCast
                  ? "Can cast ritual spells without a slot"
                  : "Off — rituals require a spell slot"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.canRitualCast}
              aria-label="Toggle ritual casting"
              onClick={() =>
                onUpdateConfig({
                  ...config,
                  canRitualCast: !config.canRitualCast,
                })
              }
              className={`relative shrink-0 w-10 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
                config.canRitualCast
                  ? "bg-lapis dark:bg-lapis-dark"
                  : "bg-limestone dark:bg-charcoal-border"
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-paper dark:bg-obsidian transition-transform ${
                  config.canRitualCast ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Active Per-Level Quota Breakdown */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted dark:text-ash">
                Spells Per Roll
              </span>
              <span className="text-xs font-mono tabular-nums font-medium text-ink dark:text-parchment">
                {totalPlannedRolls} total
              </span>
            </div>

            <div className="divide-y divide-limestone/70 dark:divide-charcoal-border/70 border-y border-limestone dark:border-charcoal-border">
              {SPELL_LEVELS.slice(0, config.maxSpellLevel + 1).map((lvl) => {
                const count = Number(config.levelCounts[lvl.key] ?? 0);
                return (
                  <div
                    key={lvl.key}
                    className="py-1.5 flex items-center justify-between text-xs"
                  >
                    <span className="text-ink-muted dark:text-ash">
                      {lvl.shortLabel}
                      {lvl.index > 0 ? " Level" : ""}
                    </span>
                    <span className="font-mono tabular-nums font-medium text-ink dark:text-parchment">
                      {count === 0 ? "Skip" : `${count}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Filter Constraints Summary */}
          <div className="space-y-2 text-xs text-ink-muted dark:text-ash">
            <p className="font-medium text-ink dark:text-parchment">
              Active Odds &amp; Filters
            </p>
            <p className="leading-relaxed">
              <span className="text-ink dark:text-parchment font-medium">
                Classes:{" "}
              </span>
              {summarizeWeights(DND_CLASSES, config.classWeights, "classes")}
            </p>
            <p className="leading-relaxed">
              <span className="text-ink dark:text-parchment font-medium">
                Schools:{" "}
              </span>
              {summarizeWeights(MAGIC_SCHOOLS, config.schoolWeights, "schools")}
            </p>
            <p className="leading-relaxed">
              <span className="text-ink dark:text-parchment font-medium">
                Exclusions:{" "}
              </span>
              {[
                config.excludeWeaponComponents ? "Weapon components" : null,
                config.excludeCostlyMaterials ? "Costly materials" : null,
                config.excludeConcentration ? "Concentration" : null,
                config.excludeRituals ? "Rituals" : null,
                config.excludedSources.length > 0
                  ? `${config.excludedSources.length} sourcebooks`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "None"}
            </p>
            <p className="pt-1 font-mono tabular-nums text-ink dark:text-parchment">
              {eligiblePoolCount} eligible spells in pool
            </p>
          </div>
        </aside>

        {/* Recent Roll History */}
        {rollHistory.length > 0 && (
          <aside className="border border-limestone dark:border-charcoal-border rounded-lg bg-linen/60 dark:bg-soot p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-limestone dark:border-charcoal-border">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-ink-muted dark:text-ash" />
                <h2 className="font-serif text-lg font-semibold text-ink dark:text-parchment">
                  Roll History
                </h2>
              </div>
              <button
                type="button"
                onClick={onClearRollHistory}
                className="text-xs font-medium text-ink-muted dark:text-ash hover:text-sienna dark:hover:text-brass hover:underline whitespace-nowrap"
              >
                Clear
              </button>
            </div>

            <div className="divide-y divide-limestone/70 dark:divide-charcoal-border/70">
              {(showAllHistory ? rollHistory : rollHistory.slice(0, 3)).map(
                (entry) => {
                  const previewNames = entry.rolledSpellNames.slice(0, 3);
                  const extraCount =
                    entry.rolledSpellNames.length - previewNames.length;
                  return (
                    <div
                      key={entry.id}
                      className="py-3 first:pt-0 last:pb-0 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash truncate">
                          {formatHistoryTimestamp(entry.rolledAt)} ·{" "}
                          {entry.rolledSpellNames.length} spell
                          {entry.rolledSpellNames.length === 1 ? "" : "s"}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRestoreRollHistory(entry.id)}
                          className="h-7 px-2.5 inline-flex items-center gap-1 rounded border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-medium text-ink dark:text-parchment hover:border-lapis dark:hover:border-lapis-dark hover:text-lapis dark:hover:text-lapis-dark transition-colors whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                      </div>
                      <p className="text-xs text-ink-muted dark:text-ash truncate">
                        {previewNames.join(", ")}
                        {extraCount > 0 ? ` +${extraCount} more` : ""}
                      </p>
                    </div>
                  );
                }
              )}
            </div>

            {rollHistory.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllHistory((prev) => !prev)}
                className="w-full pt-2 border-t border-limestone dark:border-charcoal-border text-xs font-medium text-lapis dark:text-lapis-dark hover:underline text-left"
              >
                {showAllHistory
                  ? "Show fewer"
                  : `Show all (${rollHistory.length})`}
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
