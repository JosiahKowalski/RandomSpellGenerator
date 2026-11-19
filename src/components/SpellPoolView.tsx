import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Lock, Plus, Search, X } from "lucide-react";
import { Spell } from "../types/spell";
import { SPELL_LEVELS } from "../lib/constants";

interface SpellPoolViewProps {
  eligiblePool: Spell[];
  knownSpellNames: string[];
  maxSpellLevel: number;
  onOpenSpell: (spell: Spell) => void;
  onToggleKnown: (spellName: string) => void;
}

type SortField = "name" | "levelIndex" | "schoolBase" | "source";

export const SpellPoolView: React.FC<SpellPoolViewProps> = ({
  eligiblePool,
  knownSpellNames,
  maxSpellLevel,
  onOpenSpell,
  onToggleKnown,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<number | "all" | "unlocked">(
    "unlocked"
  );
  const [sortField, setSortField] = useState<SortField>("levelIndex");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const knownSet = useMemo(
    () => new Set(knownSpellNames.map((n) => n.toLowerCase())),
    [knownSpellNames]
  );

  const visibleSpells = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = eligiblePool.filter((spell) => {
      if (levelFilter === "unlocked" && spell.levelIndex > maxSpellLevel) {
        return false;
      }
      if (typeof levelFilter === "number" && spell.levelIndex !== levelFilter) {
        return false;
      }
      if (!q) return true;
      return (
        spell.name.toLowerCase().includes(q) ||
        spell.school.toLowerCase().includes(q) ||
        spell.source.toLowerCase().includes(q) ||
        spell.castingTime.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      let comp = 0;
      if (sortField === "levelIndex") {
        comp = a.levelIndex - b.levelIndex || a.name.localeCompare(b.name);
      } else {
        comp = a[sortField].localeCompare(b[sortField]);
      }
      return sortDir === "asc" ? comp : -comp;
    });
  }, [eligiblePool, levelFilter, maxSpellLevel, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline w-3.5 h-3.5 ml-1" />
    ) : (
      <ChevronDown className="inline w-3.5 h-3.5 ml-1" />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-limestone dark:border-charcoal-border">
        <div>
          <p className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
            {visibleSpells.length} shown · {eligiblePool.length} total matching your rules
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-ink dark:text-parchment mt-1">
            Matching Spell Pool
          </h1>
        </div>
      </div>

      {/* Search & Level Filter Strip */}
      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-ink-muted dark:text-ash absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search matching spells by name, school, or book..."
            className="w-full h-10 pl-10 pr-9 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot text-sm text-ink dark:text-parchment placeholder:text-ink-muted/70 dark:placeholder:text-ash/60 focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear pool search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLevelFilter("unlocked")}
            className={`h-8 px-3 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              levelFilter === "unlocked"
                ? "bg-lapis text-white border-lapis dark:bg-lapis-dark dark:text-obsidian dark:border-lapis-dark"
                : "bg-paper dark:bg-soot text-ink-muted dark:text-ash border-limestone dark:border-charcoal-border hover:text-ink dark:hover:text-parchment"
            }`}
          >
            Unlocked (0–{maxSpellLevel})
          </button>
          <button
            type="button"
            onClick={() => setLevelFilter("all")}
            className={`h-8 px-3 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              levelFilter === "all"
                ? "bg-lapis text-white border-lapis dark:bg-lapis-dark dark:text-obsidian dark:border-lapis-dark"
                : "bg-paper dark:bg-soot text-ink-muted dark:text-ash border-limestone dark:border-charcoal-border hover:text-ink dark:hover:text-parchment"
            }`}
          >
            All Levels
          </button>
          {SPELL_LEVELS.map((lvl) => (
            <button
              key={lvl.key}
              type="button"
              onClick={() => setLevelFilter(lvl.index)}
              className={`h-8 px-2.5 rounded-md text-xs font-mono tabular-nums border transition-colors whitespace-nowrap ${
                levelFilter === lvl.index
                  ? "bg-lapis text-white border-lapis dark:bg-lapis-dark dark:text-obsidian dark:border-lapis-dark"
                  : "bg-paper dark:bg-soot text-ink-muted dark:text-ash border-limestone dark:border-charcoal-border hover:text-ink dark:hover:text-parchment"
              }`}
            >
              {lvl.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Reference Table */}
      <div className="border border-limestone dark:border-charcoal-border rounded-lg overflow-hidden">
        {visibleSpells.length === 0 ? (
          <div className="py-12 px-6 text-center text-sm text-ink-muted dark:text-ash">
            No spells match the current filters. Try widening your rules or selecting All Levels.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-linen dark:bg-soot border-b border-limestone dark:border-charcoal-border text-xs font-medium text-ink-muted dark:text-ash">
                  <th className="py-2.5 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className="hover:text-ink dark:hover:text-parchment transition-colors"
                    >
                      Spell Name {renderSortIcon("name")}
                    </button>
                  </th>
                  <th className="py-2.5 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort("levelIndex")}
                      className="hover:text-ink dark:hover:text-parchment transition-colors"
                    >
                      Level {renderSortIcon("levelIndex")}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 hidden sm:table-cell">
                    <button
                      type="button"
                      onClick={() => handleSort("schoolBase")}
                      className="hover:text-ink dark:hover:text-parchment transition-colors"
                    >
                      School {renderSortIcon("schoolBase")}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 hidden md:table-cell">
                    Casting Time
                  </th>
                  <th className="py-2.5 px-4 hidden lg:table-cell">
                    <button
                      type="button"
                      onClick={() => handleSort("source")}
                      className="hover:text-ink dark:hover:text-parchment transition-colors"
                    >
                      Source {renderSortIcon("source")}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 text-right">Known</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-limestone/70 dark:divide-charcoal-border/70">
                {visibleSpells.map((spell) => {
                  const isKnown = knownSet.has(spell.name.toLowerCase());
                  return (
                    <tr
                      key={spell.id}
                      onClick={() => onOpenSpell(spell)}
                      className="hover:bg-linen/70 dark:hover:bg-soot cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-4 text-sm font-medium text-ink dark:text-parchment">
                        {spell.name}
                      </td>
                      <td className="py-2.5 px-4 text-xs font-mono tabular-nums text-ink-muted dark:text-ash whitespace-nowrap">
                        {SPELL_LEVELS[spell.levelIndex]?.shortLabel}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-ink-muted dark:text-ash hidden sm:table-cell">
                        {spell.schoolBase}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-ink-muted dark:text-ash hidden md:table-cell">
                        {spell.castingTime}
                      </td>
                      <td className="py-2.5 px-4 text-xs font-mono text-ink-muted dark:text-ash hidden lg:table-cell">
                        {spell.source}
                      </td>
                      <td
                        className="py-2.5 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onToggleKnown(spell.name)}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                            isKnown
                              ? "border-sienna/40 dark:border-brass/40 text-sienna dark:text-brass bg-linen/60 dark:bg-obsidian"
                              : "border-limestone dark:border-charcoal-border text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                          }`}
                        >
                          {isKnown ? (
                            <>
                              <Lock className="w-3 h-3" />
                              <span>Known</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>Lock</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
