import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Lock,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import {
  LevelShortfall,
  RandomizerConfig,
  Spell,
  SpellFilterTab,
} from "../types/spell";
import {
  casterLevelToMaxSpellLevel,
  SPELL_LEVELS,
} from "../lib/constants";
import { getTotalPlannedRolls } from "../lib/spellEngine";

interface SpellbookViewProps {
  catalog: Spell[];
  knownSpells: Spell[];
  rolledSpells: Spell[];
  eligiblePoolCount: number;
  config: RandomizerConfig;
  shortfalls: LevelShortfall[];
  onRollAll: () => void;
  onClearRolled: () => void;
  onRerollSingle: (spellName: string) => void;
  onToggleKnown: (spellName: string) => void;
  onAddKnownSpell: (spellName: string) => void;
  onOpenSpell: (spell: Spell) => void;
  onUpdateConfig: (next: RandomizerConfig) => void;
  onOpenRules: () => void;
}

export const SpellbookView: React.FC<SpellbookViewProps> = ({
  catalog,
  knownSpells,
  rolledSpells,
  eligiblePoolCount,
  config,
  shortfalls,
  onRollAll,
  onClearRolled,
  onRerollSingle,
  onToggleKnown,
  onAddKnownSpell,
  onOpenSpell,
  onUpdateConfig,
  onOpenRules,
}) => {
  const [filterTab, setFilterTab] = useState<SpellFilterTab>("all");
  const [activeSearch, setActiveSearch] = useState("");
  const [knownAddQuery, setKnownAddQuery] = useState("");
  const [showKnownDropdown, setShowKnownDropdown] = useState(false);

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
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {entries.map(({ spell, kind }) => {
                      const isKnown = kind === "known";
                      return (
                        <article
                          key={`${kind}-${spell.id}`}
                          onClick={() => onOpenSpell(spell)}
                          className={`group rounded-lg border p-4 cursor-pointer transition-colors flex items-start justify-between gap-3 ${
                            isKnown
                              ? "bg-linen/75 dark:bg-soot border-limestone dark:border-charcoal-border hover:border-stone-400 dark:hover:border-stone-600"
                              : "bg-paper dark:bg-obsidian border-limestone dark:border-charcoal-border hover:bg-linen/50 dark:hover:bg-soot"
                          }`}
                        >
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
                              <span className="truncate">{spell.schoolBase}</span>
                              {spell.isConcentration && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Conc.</span>
                                </>
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

                            <p className="text-xs text-ink-muted dark:text-ash truncate">
                              {spell.castingTime}
                              {spell.range ? ` · ${spell.range}` : ""}
                              {spell.duration ? ` · ${spell.duration}` : ""}
                            </p>
                          </div>

                          <div
                            className="flex items-center gap-1 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!isKnown && (
                              <button
                                type="button"
                                onClick={() => onRerollSingle(spell.name)}
                                title={`Reroll ${spell.name}`}
                                aria-label={`Reroll ${spell.name}`}
                                className="h-9 w-9 inline-flex items-center justify-center rounded-md text-ink-muted dark:text-ash hover:text-lapis dark:hover:text-lapis-dark hover:bg-linen dark:hover:bg-obsidian transition-colors"
                              >
                                <RefreshCw className="w-4 h-4" />
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
                              className={`h-9 w-9 inline-flex items-center justify-center rounded-md transition-colors ${
                                isKnown
                                  ? "text-sienna dark:text-brass hover:bg-paper dark:hover:bg-obsidian"
                                  : "text-ink-muted dark:text-ash hover:text-sienna dark:hover:text-brass hover:bg-linen dark:hover:bg-soot"
                              }`}
                            >
                              {isKnown ? (
                                <Lock className="w-4 h-4" />
                              ) : (
                                <Unlock className="w-4 h-4" />
                              )}
                            </button>
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

      {/* Right Summary Rail: Quick Roll Controls & Active Rules Snapshot */}
      <aside className="lg:col-span-4 lg:sticky lg:top-24 border border-limestone dark:border-charcoal-border rounded-lg bg-linen/60 dark:bg-soot p-6 space-y-6">
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
            Active Filters
          </p>
          <p className="leading-relaxed">
            <span className="text-ink dark:text-parchment font-medium">
              Classes:{" "}
            </span>
            {config.classes.length === 0
              ? "All classes"
              : `${config.classMode === "exclude" ? "Excluding " : ""}${config.classes.join(", ")}`}
          </p>
          <p className="leading-relaxed">
            <span className="text-ink dark:text-parchment font-medium">
              Schools:{" "}
            </span>
            {config.schools.length === 0
              ? "All schools"
              : `${config.schoolMode === "exclude" ? "Excluding " : ""}${config.schools.join(", ")}`}
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
    </div>
  );
};
