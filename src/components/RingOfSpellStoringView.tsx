import React, { useMemo, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { Spell, StoredRingSpell } from "../types/spell";
import { SPELL_LEVELS } from "../lib/constants";
import { getRingUsedLevels, RING_MAX_LEVELS } from "../lib/spellEngine";

interface RingOfSpellStoringViewProps {
  catalog: Spell[];
  knownSpells: Spell[];
  rolledSpells: Spell[];
  ringSpells: StoredRingSpell[];
  onStoreSpell: (entry: Omit<StoredRingSpell, "id">) => void;
  onCastStoredSpell: (entryId: string) => void;
  onClearRing: () => void;
  onOpenSpell: (spell: Spell) => void;
}

export const RingOfSpellStoringView: React.FC<RingOfSpellStoringViewProps> = ({
  catalog,
  knownSpells,
  rolledSpells,
  ringSpells,
  onStoreSpell,
  onCastStoredSpell,
  onClearRing,
  onOpenSpell,
}) => {
  const usedLevels = getRingUsedLevels(ringSpells);
  const remainingLevels = Math.max(0, RING_MAX_LEVELS - usedLevels);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(null);
  const [castLevel, setCastLevel] = useState<number>(1);
  const [casterName, setCasterName] = useState("");
  const [saveDC, setSaveDC] = useState("");
  const [attackBonus, setAttackBonus] = useState("");
  const [notes, setNotes] = useState("");

  const catalogByName = useMemo(() => {
    const map = new Map<string, Spell>();
    for (const s of catalog) {
      const key = s.name.toLowerCase();
      if (!map.has(key)) map.set(key, s);
    }
    return map;
  }, [catalog]);

  // All 1st–5th level spells that currently fit in remaining capacity
  const storableSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2 || remainingLevels === 0) return [];
    return catalog
      .filter(
        (s) =>
          s.levelIndex >= 1 &&
          s.levelIndex <= Math.min(RING_MAX_LEVELS, remainingLevels) &&
          s.name.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [catalog, searchQuery, remainingLevels]);

  // Active Known + Rolled spells that fit in remaining capacity for quick picking
  const quickPickSpells = useMemo(() => {
    if (remainingLevels === 0) return [];
    const seen = new Set<string>();
    const combined: Array<{ spell: Spell; sourceLabel: string }> = [];

    for (const s of knownSpells) {
      if (s.levelIndex >= 1 && s.levelIndex <= remainingLevels) {
        const key = s.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          combined.push({ spell: s, sourceLabel: "Known" });
        }
      }
    }
    for (const s of rolledSpells) {
      if (s.levelIndex >= 1 && s.levelIndex <= remainingLevels) {
        const key = s.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          combined.push({ spell: s, sourceLabel: "Rolled" });
        }
      }
    }

    return combined.sort(
      (a, b) =>
        a.spell.levelIndex - b.spell.levelIndex ||
        a.spell.name.localeCompare(b.spell.name)
    );
  }, [knownSpells, rolledSpells, remainingLevels]);

  const handleSelectSpell = (spell: Spell) => {
    setSelectedSpell(spell);
    setCastLevel(Math.max(1, spell.levelIndex));
    setSearchQuery("");
  };

  const handleSubmitStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSpell) return;
    if (castLevel < selectedSpell.levelIndex || castLevel > remainingLevels) {
      return;
    }

    onStoreSpell({
      spellName: selectedSpell.name,
      castLevel,
      casterName: casterName.trim(),
      saveDC: saveDC.trim(),
      attackBonus: attackBonus.trim(),
      notes: notes.trim(),
    });

    setSelectedSpell(null);
    setCastLevel(1);
    setNotes("");
  };

  // Build 5 discrete slot indicators so the user sees exact level allocation
  const capacitySlots = useMemo(() => {
    const slots: Array<{ label: string; filled: boolean }> = [];
    for (const entry of ringSpells) {
      for (let i = 0; i < entry.castLevel; i++) {
        if (slots.length < RING_MAX_LEVELS) {
          slots.push({
            label: `${entry.spellName} (${SPELL_LEVELS[entry.castLevel]?.shortLabel})`,
            filled: true,
          });
        }
      }
    }
    while (slots.length < RING_MAX_LEVELS) {
      slots.push({ label: "Empty level", filled: false });
    }
    return slots;
  }, [ringSpells]);

  const maxAllowedCastLevel = Math.min(RING_MAX_LEVELS, remainingLevels);

  return (
    <div className="space-y-8">
      {/* Header & 5-Level Capacity Bar */}
      <section className="space-y-5 pb-6 border-b border-limestone dark:border-charcoal-border">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
              {usedLevels} / {RING_MAX_LEVELS} spell levels used ·{" "}
              {remainingLevels}{" "}
              {remainingLevels === 1 ? "level" : "levels"} free
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-ink dark:text-parchment mt-1">
              Ring of Spell Storing
            </h1>
          </div>

          {ringSpells.length > 0 && (
            <button
              type="button"
              onClick={onClearRing}
              className="h-10 px-3.5 inline-flex items-center gap-2 rounded-md border border-limestone dark:border-charcoal-border text-sm text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap self-start sm:self-auto"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear Ring</span>
            </button>
          )}
        </div>

        {/* 5-Slot Capacity Meter */}
        <div className="space-y-2">
          <div
            className="grid grid-cols-5 gap-2"
            aria-label={`Ring capacity: ${usedLevels} of ${RING_MAX_LEVELS} spell levels used`}
          >
            {capacitySlots.map((slot, idx) => (
              <div
                key={idx}
                title={slot.label}
                className={`h-3 rounded-sm transition-colors ${
                  slot.filled
                    ? "bg-lapis dark:bg-lapis-dark"
                    : "border border-dashed border-limestone dark:border-charcoal-border bg-linen/50 dark:bg-soot/50"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-ink-muted dark:text-ash leading-relaxed">
            Holds up to 5 levels of 1st–5th level spells (cantrips cannot be stored). Cast spells use the original caster&apos;s slot level, Save DC, and spell attack bonus.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Left Column: Currently Stored Spells */}
        <section className="lg:col-span-7 space-y-4">
          <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-limestone dark:border-charcoal-border">
            <h2 className="font-serif text-xl font-semibold text-ink dark:text-parchment">
              Stored Spells
            </h2>
            <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
              {ringSpells.length}{" "}
              {ringSpells.length === 1 ? "spell" : "spells"}
            </span>
          </div>

          {ringSpells.length === 0 ? (
            <div className="border border-dashed border-limestone dark:border-charcoal-border rounded-lg py-14 px-6 text-center space-y-2">
              <h3 className="font-serif text-xl font-semibold text-ink dark:text-parchment">
                Ring is empty
              </h3>
              <p className="text-sm text-ink-muted dark:text-ash max-w-md mx-auto leading-relaxed">
                Store 1st–5th level spells using the panel on the right—either from your active spells or from any party member&apos;s spell list.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ringSpells.map((entry) => {
                const catalogSpell = catalogByName.get(
                  entry.spellName.toLowerCase()
                );
                const baseLevel = catalogSpell?.levelIndex ?? entry.castLevel;
                const isUpcast = entry.castLevel > baseLevel;
                const slotLabel = SPELL_LEVELS[entry.castLevel]?.shortLabel;
                const baseLabel = SPELL_LEVELS[baseLevel]?.shortLabel;

                const casterMeta = [
                  entry.casterName ? `Caster: ${entry.casterName}` : null,
                  entry.saveDC ? `DC ${entry.saveDC.replace(/^dc\s*/i, "")}` : null,
                  entry.attackBonus ? `Attack ${entry.attackBonus}` : null,
                ].filter(Boolean);

                return (
                  <article
                    key={entry.id}
                    onClick={() => catalogSpell && onOpenSpell(catalogSpell)}
                    className={`rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition-colors ${
                      catalogSpell
                        ? "cursor-pointer hover:bg-linen/50 dark:hover:bg-soot"
                        : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted dark:text-ash">
                        <span className="font-mono tabular-nums font-medium text-lapis dark:text-lapis-dark">
                          {slotLabel}-level slot
                        </span>
                        {isUpcast && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-sienna dark:text-brass font-medium">
                              Upcast from {baseLabel}
                            </span>
                          </>
                        )}
                        {catalogSpell?.schoolBase && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{catalogSpell.schoolBase}</span>
                          </>
                        )}
                        {catalogSpell?.isConcentration && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Conc.</span>
                          </>
                        )}
                      </div>

                      <h3 className="font-serif text-lg font-semibold text-ink dark:text-parchment">
                        {entry.spellName}
                      </h3>

                      {catalogSpell && (
                        <p className="text-xs text-ink-muted dark:text-ash">
                          {catalogSpell.castingTime}
                          {catalogSpell.range ? ` · ${catalogSpell.range}` : ""}
                          {catalogSpell.duration
                            ? ` · ${catalogSpell.duration}`
                            : ""}
                        </p>
                      )}

                      {casterMeta.length > 0 && (
                        <p className="text-xs font-mono tabular-nums text-ink dark:text-parchment pt-0.5">
                          {casterMeta.join(" · ")}
                        </p>
                      )}

                      {entry.notes && (
                        <p className="text-xs text-ink-muted dark:text-ash italic">
                          {entry.notes}
                        </p>
                      )}
                    </div>

                    <div
                      className="flex items-center gap-2 shrink-0 self-end sm:self-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => onCastStoredSpell(entry.id)}
                        className="h-9 px-3.5 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-xs font-medium whitespace-nowrap transition-colors"
                      >
                        Cast
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Store a Spell Panel */}
        <aside className="lg:col-span-5 border border-limestone dark:border-charcoal-border rounded-lg bg-linen/60 dark:bg-soot p-6 space-y-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-limestone dark:border-charcoal-border">
            <h2 className="font-serif text-lg font-semibold text-ink dark:text-parchment">
              Store a Spell
            </h2>
            <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
              {remainingLevels} {remainingLevels === 1 ? "level" : "levels"} open
            </span>
          </div>

          {remainingLevels === 0 ? (
            <p className="text-sm text-ink-muted dark:text-ash leading-relaxed">
              The ring is at full capacity (5 / 5 spell levels). Cast one of the stored spells to free room for another.
            </p>
          ) : !selectedSpell ? (
            <div className="space-y-5">
              {/* Search full catalog (party members can cast into the ring too) */}
              <div className="space-y-1.5 relative">
                <label
                  htmlFor="ring-spell-search"
                  className="block text-xs font-medium text-ink dark:text-parchment"
                >
                  Search any 1st–{SPELL_LEVELS[maxAllowedCastLevel]?.shortLabel} level spell
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-ink-muted dark:text-ash absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="ring-spell-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g., Shield, Cure Wounds, Counterspell..."
                    className="w-full h-10 pl-9 pr-8 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-sm text-ink dark:text-parchment placeholder:text-ink-muted/70 dark:placeholder:text-ash/60 focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear spell search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {searchQuery.trim().length >= 2 && (
                  <div className="mt-1.5 border border-limestone dark:border-charcoal-border rounded-md bg-paper dark:bg-obsidian divide-y divide-limestone/60 dark:divide-charcoal-border/60 overflow-hidden">
                    {storableSearchResults.length > 0 ? (
                      storableSearchResults.map((spell) => (
                        <button
                          key={spell.id}
                          type="button"
                          onClick={() => handleSelectSpell(spell)}
                          className="w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 hover:bg-linen dark:hover:bg-soot transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink dark:text-parchment truncate">
                              {spell.name}
                            </p>
                            <p className="text-xs text-ink-muted dark:text-ash truncate">
                              {SPELL_LEVELS[spell.levelIndex]?.shortLabel} ·{" "}
                              {spell.schoolBase}
                            </p>
                          </div>
                          <Plus className="w-4 h-4 text-lapis dark:text-lapis-dark shrink-0" />
                        </button>
                      ))
                    ) : (
                      <p className="px-3.5 py-3 text-xs text-ink-muted dark:text-ash">
                        No 1st–{SPELL_LEVELS[maxAllowedCastLevel]?.shortLabel}{" "}
                        level spells match that search.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Pick from User's Active Spellbook */}
              {quickPickSpells.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-ink-muted dark:text-ash">
                    Quick pick from your active spells
                  </p>
                  <div className="max-h-64 overflow-y-auto border border-limestone dark:border-charcoal-border rounded-md bg-paper dark:bg-obsidian divide-y divide-limestone/60 dark:divide-charcoal-border/60">
                    {quickPickSpells.map(({ spell, sourceLabel }) => (
                      <button
                        key={`${sourceLabel}-${spell.id}`}
                        type="button"
                        onClick={() => handleSelectSpell(spell)}
                        className="w-full px-3.5 py-2 text-left flex items-center justify-between gap-2 hover:bg-linen dark:hover:bg-soot transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink dark:text-parchment truncate">
                            {spell.name}
                          </p>
                          <p className="text-xs text-ink-muted dark:text-ash">
                            {SPELL_LEVELS[spell.levelIndex]?.shortLabel} ·{" "}
                            {sourceLabel}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-lapis dark:text-lapis-dark shrink-0">
                          Select
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmitStore} className="space-y-4">
              {/* Selected Spell Summary */}
              <div className="p-3.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-muted dark:text-ash">
                    Base {SPELL_LEVELS[selectedSpell.levelIndex]?.shortLabel}{" "}
                    level · {selectedSpell.schoolBase}
                  </p>
                  <p className="font-serif text-base font-semibold text-ink dark:text-parchment truncate mt-0.5">
                    {selectedSpell.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSpell(null)}
                  className="text-xs text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment whitespace-nowrap"
                >
                  Change
                </button>
              </div>

              {/* Cast Slot Level Picker (Supports Upcasting!) */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-ink dark:text-parchment">
                  Slot Level Used (takes {castLevel}{" "}
                  {castLevel === 1 ? "level" : "levels"} in ring)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(
                    {
                      length:
                        maxAllowedCastLevel - selectedSpell.levelIndex + 1,
                    },
                    (_, i) => selectedSpell.levelIndex + i
                  ).map((lvl) => {
                    const active = castLevel === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setCastLevel(lvl)}
                        className={`h-9 px-3 rounded-md text-xs font-mono tabular-nums font-medium border transition-colors ${
                          active
                            ? "bg-lapis text-white border-lapis dark:bg-lapis-dark dark:text-obsidian dark:border-lapis-dark"
                            : "bg-paper dark:bg-obsidian text-ink dark:text-parchment border-limestone dark:border-charcoal-border hover:bg-linen dark:hover:bg-soot"
                        }`}
                      >
                        {SPELL_LEVELS[lvl]?.shortLabel}
                        {lvl > selectedSpell.levelIndex ? " ↑" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Original Caster Stats (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label
                    htmlFor="ring-caster-name"
                    className="block text-xs text-ink-muted dark:text-ash"
                  >
                    Caster (opt.)
                  </label>
                  <input
                    id="ring-caster-name"
                    type="text"
                    maxLength={60}
                    value={casterName}
                    onChange={(e) => setCasterName(e.target.value)}
                    placeholder="Self / Cleric"
                    className="w-full h-9 px-2.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs text-ink dark:text-parchment focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="ring-save-dc"
                    className="block text-xs text-ink-muted dark:text-ash"
                  >
                    Save DC
                  </label>
                  <input
                    id="ring-save-dc"
                    type="text"
                    maxLength={16}
                    value={saveDC}
                    onChange={(e) => setSaveDC(e.target.value)}
                    placeholder="15"
                    className="w-full h-9 px-2.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-mono tabular-nums text-ink dark:text-parchment focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="ring-attack-bonus"
                    className="block text-xs text-ink-muted dark:text-ash"
                  >
                    Spell Attack
                  </label>
                  <input
                    id="ring-attack-bonus"
                    type="text"
                    maxLength={16}
                    value={attackBonus}
                    onChange={(e) => setAttackBonus(e.target.value)}
                    placeholder="+7"
                    className="w-full h-9 px-2.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-mono tabular-nums text-ink dark:text-parchment focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="ring-notes"
                  className="block text-xs text-ink-muted dark:text-ash"
                >
                  Notes (optional)
                </label>
                <input
                  id="ring-notes"
                  type="text"
                  maxLength={200}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Upcast for extra target"
                  className="w-full h-9 px-2.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs text-ink dark:text-parchment focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
                />
              </div>

              <button
                type="submit"
                className="w-full h-10 px-4 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-sm font-medium transition-colors"
              >
                Store in Ring ({castLevel}{" "}
                {castLevel === 1 ? "Level" : "Levels"})
              </button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
};
