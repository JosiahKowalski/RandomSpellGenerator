import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  Dices,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Spell, SpellSlotState } from "../types/spell";
import { SPELL_LEVELS } from "../lib/constants";
import { getEffectiveMaxSlots } from "../lib/spellEngine";
import {
  buildSpellRollFormula,
  getCantripTierMultiplier,
  parseSpellRolls,
} from "../lib/spellRollParser";

const CASTER_STATS_STORAGE_KEY = "arcane_ledger_spellcast_stats_v1";

interface CasterStats {
  spellAttack: number;
  saveDC: number;
  spellMod: number;
}

const DEFAULT_CASTER_STATS: CasterStats = {
  spellAttack: 7,
  saveDC: 15,
  spellMod: 4,
};

function loadCasterStats(): CasterStats {
  try {
    const raw = localStorage.getItem(CASTER_STATS_STORAGE_KEY);
    if (!raw) return DEFAULT_CASTER_STATS;
    const parsed = JSON.parse(raw);
    return {
      spellAttack: Number.isFinite(Number(parsed.spellAttack))
        ? Math.max(-5, Math.min(25, Math.round(Number(parsed.spellAttack))))
        : DEFAULT_CASTER_STATS.spellAttack,
      saveDC: Number.isFinite(Number(parsed.saveDC))
        ? Math.max(8, Math.min(30, Math.round(Number(parsed.saveDC))))
        : DEFAULT_CASTER_STATS.saveDC,
      spellMod: Number.isFinite(Number(parsed.spellMod))
        ? Math.max(-5, Math.min(15, Math.round(Number(parsed.spellMod))))
        : DEFAULT_CASTER_STATS.spellMod,
    };
  } catch {
    return DEFAULT_CASTER_STATS;
  }
}

export interface SpellCastTrayPanelProps {
  catalog: Spell[];
  knownSpells: Spell[];
  rolledSpells: Spell[];
  casterLevel: number;
  slotState: SpellSlotState;
  advMode: "normal" | "advantage" | "disadvantage";
  onChangeAdvMode: (mode: "normal" | "advantage" | "disadvantage") => void;
  selectedSpell: Spell | null;
  onSelectSpell: (spell: Spell | null) => void;
  onRollFormula: (
    formula: string,
    label: string,
    options?: { showHalf?: boolean }
  ) => void;
  onCastSpell: (spell: Spell, slotLevel: number | null) => void;
  onOpenSpell: (spell: Spell) => void;
}

export const SpellCastTrayPanel: React.FC<SpellCastTrayPanelProps> = ({
  catalog,
  knownSpells,
  rolledSpells,
  casterLevel,
  slotState,
  advMode,
  onChangeAdvMode,
  selectedSpell,
  onSelectSpell,
  onRollFormula,
  onCastSpell,
  onOpenSpell,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [editingStats, setEditingStats] = useState<boolean>(false);
  const [castLevel, setCastLevel] = useState<number>(1);
  const [isCrit, setIsCrit] = useState<boolean>(false);
  const [slotSpentFeedback, setSlotSpentFeedback] = useState<boolean>(false);
  const [stats, setStats] = useState<CasterStats>(loadCasterStats);

  useEffect(() => {
    try {
      localStorage.setItem(CASTER_STATS_STORAGE_KEY, JSON.stringify(stats));
    } catch {
      // ignore storage quota errors
    }
  }, [stats]);

  // Reset cast level and crit whenever selected spell changes
  useEffect(() => {
    if (selectedSpell) {
      setCastLevel(Math.max(1, selectedSpell.levelIndex));
      setIsCrit(false);
      setSlotSpentFeedback(false);
    }
  }, [selectedSpell]);

  // Combine Known + Rolled spells into deduplicated quick picks, prioritizing spells with detected rolls
  const spellbookPicks = useMemo(() => {
    const seen = new Set<string>();
    const combined: Array<{ spell: Spell; rollable: boolean }> = [];
    for (const s of [...knownSpells, ...rolledSpells]) {
      const k = s.name.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        combined.push({ spell: s, rollable: parseSpellRolls(s).hasAnyRoll });
      }
    }
    combined.sort((a, b) => Number(b.rollable) - Number(a.rollable));
    return combined;
  }, [knownSpells, rolledSpells]);

  // Search full catalog
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const exactOrPrefix: Spell[] = [];
    const contains: Spell[] = [];
    for (const s of catalog) {
      const lower = s.name.toLowerCase();
      if (lower.startsWith(q)) exactOrPrefix.push(s);
      else if (lower.includes(q)) contains.push(s);
    }
    return [...exactOrPrefix, ...contains].slice(0, 7);
  }, [catalog, searchQuery]);

  const effectiveMax = useMemo(
    () => getEffectiveMaxSlots(slotState, casterLevel),
    [slotState, casterLevel]
  );

  const parsedProfile = useMemo(
    () => (selectedSpell ? parseSpellRolls(selectedSpell) : null),
    [selectedSpell]
  );

  const handlePickSpell = (spell: Spell) => {
    onSelectSpell(spell);
    setSearchQuery("");
  };

  const handleRollAttack = () => {
    if (!selectedSpell || !parsedProfile?.attackType) return;
    const dicePrefix =
      advMode === "advantage"
        ? "2d20kh1"
        : advMode === "disadvantage"
        ? "2d20kl1"
        : "1d20";
    const modStr =
      stats.spellAttack >= 0
        ? `+${stats.spellAttack}`
        : `${stats.spellAttack}`;
    const modeTag =
      advMode === "advantage"
        ? " (Adv)"
        : advMode === "disadvantage"
        ? " (Dis)"
        : "";
    onRollFormula(
      `${dicePrefix}${modStr}`,
      `${selectedSpell.name} · Attack${modeTag}`
    );
  };

  const handleSpendSlot = () => {
    if (!selectedSpell || selectedSpell.levelIndex === 0) return;
    onCastSpell(selectedSpell, castLevel);
    setSlotSpentFeedback(true);
    window.setTimeout(() => setSlotSpentFeedback(false), 750);
  };

  const slotInfoForCastLevel = useMemo(() => {
    if (!selectedSpell || selectedSpell.levelIndex === 0) return null;
    const key = String(castLevel);
    const max = effectiveMax[key] ?? 0;
    const used = Math.min(max, Math.max(0, slotState.used[key] ?? 0));
    const remaining = Math.max(0, max - used);
    return { max, remaining };
  }, [selectedSpell, castLevel, effectiveMax, slotState.used]);

  return (
    <div className="space-y-4">
      {/* Compact Caster Stats Summary + Toggleable Editor */}
      <div className="rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian px-3 py-2 space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-ink-muted dark:text-ash">
            <span>
              Atk{" "}
              <strong className="font-mono text-ink dark:text-parchment">
                {stats.spellAttack >= 0
                  ? `+${stats.spellAttack}`
                  : stats.spellAttack}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              DC{" "}
              <strong className="font-mono text-ink dark:text-parchment">
                {stats.saveDC}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Mod{" "}
              <strong className="font-mono text-ink dark:text-parchment">
                {stats.spellMod >= 0 ? `+${stats.spellMod}` : stats.spellMod}
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setEditingStats((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-medium text-lapis dark:text-lapis-dark hover:underline whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>{editingStats ? "Done" : "Edit"}</span>
          </button>
        </div>

        {editingStats && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-limestone/70 dark:border-charcoal-border/70">
            {(
              [
                {
                  key: "spellAttack",
                  label: "Attack",
                  format: (v: number) => (v >= 0 ? `+${v}` : String(v)),
                  min: -5,
                  max: 25,
                },
                {
                  key: "saveDC",
                  label: "Save DC",
                  format: (v: number) => String(v),
                  min: 8,
                  max: 30,
                },
                {
                  key: "spellMod",
                  label: "Mod",
                  format: (v: number) => (v >= 0 ? `+${v}` : String(v)),
                  min: -5,
                  max: 15,
                },
              ] as const
            ).map((item) => (
              <div key={item.key} className="space-y-1">
                <span className="block text-[11px] text-ink-muted dark:text-ash">
                  {item.label}
                </span>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setStats((prev) => ({
                        ...prev,
                        [item.key]: Math.max(item.min, prev[item.key] - 1),
                      }))
                    }
                    aria-label={`Decrease ${item.label}`}
                    className="h-6 w-6 rounded border border-limestone dark:border-charcoal-border font-mono text-xs text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot"
                  >
                    −
                  </button>
                  <span className="font-mono tabular-nums text-xs font-semibold text-ink dark:text-parchment">
                    {item.format(stats[item.key])}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setStats((prev) => ({
                        ...prev,
                        [item.key]: Math.min(item.max, prev[item.key] + 1),
                      }))
                    }
                    aria-label={`Increase ${item.label}`}
                    className="h-6 w-6 rounded border border-limestone dark:border-charcoal-border font-mono text-xs text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spell Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-ink-muted dark:text-ash absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search any spell (e.g. Synaptic Static)..."
          aria-label="Search any spell"
          className="w-full h-9 pl-9 pr-8 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-sm text-ink dark:text-parchment placeholder:text-ink-muted/70 dark:placeholder:text-ash/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 mt-1 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian shadow-lg z-20 divide-y divide-limestone/60 dark:divide-charcoal-border/60 overflow-hidden">
            {searchResults.map((spell) => (
              <button
                key={spell.id}
                type="button"
                onClick={() => handlePickSpell(spell)}
                className="w-full px-3 py-2 text-left hover:bg-linen dark:hover:bg-soot flex items-baseline justify-between gap-2 transition-colors"
              >
                <span className="text-sm font-medium text-ink dark:text-parchment truncate">
                  {spell.name}
                </span>
                <span className="text-xs font-mono text-ink-muted dark:text-ash shrink-0">
                  {SPELL_LEVELS[spell.levelIndex]?.shortLabel}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Spell Roll Card */}
      {selectedSpell && parsedProfile && (
        <div className="rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian p-3.5 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 border-b border-limestone/80 dark:border-charcoal-border/80 pb-2.5">
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-semibold text-ink dark:text-parchment leading-snug">
                {selectedSpell.name}
              </h3>
              <p className="text-xs text-ink-muted dark:text-ash mt-0.5 flex flex-wrap items-center gap-x-1.5">
                <span className="font-mono">
                  {SPELL_LEVELS[selectedSpell.levelIndex]?.shortLabel}
                </span>
                {parsedProfile.saveAbility && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-ink dark:text-parchment">
                      {parsedProfile.saveAbility} DC {stats.saveDC}
                    </span>
                    {parsedProfile.halfOnSave && <span>(half)</span>}
                  </>
                )}
                {selectedSpell.levelIndex === 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Lv.{casterLevel} (×{getCantripTierMultiplier(casterLevel)})
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onOpenSpell(selectedSpell)}
                title="Read full spell description"
                className="h-7 px-2 inline-flex items-center gap-1 rounded border border-limestone dark:border-charcoal-border text-xs text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Read</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectSpell(null)}
                aria-label="Clear selected spell"
                className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Slot Level & Expend Slot (for leveled spells) */}
          {selectedSpell.levelIndex > 0 && (
            <div className="flex items-center justify-between gap-2">
              <select
                aria-label="Cast spell at slot level"
                value={castLevel}
                onChange={(e) => setCastLevel(Number(e.target.value))}
                className="flex-1 h-8 px-2 rounded-md border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot text-xs font-mono tabular-nums text-ink dark:text-parchment focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
              >
                {SPELL_LEVELS.slice(selectedSpell.levelIndex).map((lvl) => {
                  const max = effectiveMax[lvl.key] ?? 0;
                  const used = Math.min(
                    max,
                    Math.max(0, slotState.used[lvl.key] ?? 0)
                  );
                  const rem = Math.max(0, max - used);
                  return (
                    <option key={lvl.key} value={lvl.index}>
                      {lvl.shortLabel}-level slot
                      {max > 0 ? ` (${rem}/${max} left)` : ""}
                    </option>
                  );
                })}
              </select>

              <button
                type="button"
                onClick={handleSpendSlot}
                disabled={
                  !slotInfoForCastLevel || slotInfoForCastLevel.remaining <= 0
                }
                className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  slotSpentFeedback
                    ? "border-lapis bg-lapis text-white dark:border-lapis-dark dark:bg-lapis-dark dark:text-obsidian animate-cast-confirm"
                    : slotInfoForCastLevel && slotInfoForCastLevel.remaining > 0
                    ? "border-limestone dark:border-charcoal-border bg-linen/70 dark:bg-soot text-ink dark:text-parchment hover:border-lapis dark:hover:border-lapis-dark hover:text-lapis dark:hover:text-lapis-dark"
                    : "border-limestone/60 dark:border-charcoal-border/60 text-ink-muted/50 dark:text-ash/40 cursor-not-allowed"
                }`}
              >
                {slotSpentFeedback ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Used</span>
                  </>
                ) : (
                  <span>Use Slot</span>
                )}
              </button>
            </div>
          )}

          {/* Attack Row (with inline Adv / Normal / Dis) */}
          {parsedProfile.attackType && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRollAttack}
                  className="flex-1 h-9 px-3 inline-flex items-center justify-center gap-2 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  <Dices className="w-4 h-4" />
                  <span>
                    Roll Attack · 1d20
                    {stats.spellAttack >= 0
                      ? `+${stats.spellAttack}`
                      : stats.spellAttack}
                  </span>
                </button>

                <div
                  role="group"
                  aria-label="Attack roll mode"
                  className="inline-flex rounded-md border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot p-0.5 shrink-0"
                >
                  {(
                    [
                      { id: "advantage", label: "Adv" },
                      { id: "normal", label: "Std" },
                      { id: "disadvantage", label: "Dis" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onChangeAdvMode(m.id)}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                        advMode === m.id
                          ? "bg-paper dark:bg-obsidian text-ink dark:text-parchment shadow-xs"
                          : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Damage / Healing / Effect Roll Buttons */}
          {parsedProfile.rolls.length > 0 ? (
            <div className="space-y-2">
              {parsedProfile.rolls.map((action) => {
                const built = buildSpellRollFormula(action, {
                  baseSpellLevel: selectedSpell.levelIndex,
                  castLevel,
                  casterLevel,
                  spellMod: stats.spellMod,
                  isCrit,
                });
                const exceedsTray = built.totalDiceCount > 24;

                return (
                  <button
                    key={action.id}
                    type="button"
                    disabled={exceedsTray}
                    onClick={() =>
                      onRollFormula(
                        built.formula,
                        `${selectedSpell.name} · ${built.displayLabel}${
                          isCrit && action.canCrit ? " (Crit)" : ""
                        }`,
                        {
                          showHalf:
                            parsedProfile.halfOnSave &&
                            action.kind === "damage",
                        }
                      )
                    }
                    className={`w-full px-3 py-2.5 rounded-md border flex items-center justify-between gap-3 text-left transition-colors disabled:opacity-45 ${
                      action.kind === "damage"
                        ? "border-sienna/50 dark:border-brass/50 bg-linen/50 dark:bg-soot hover:border-sienna dark:hover:border-brass"
                        : "border-limestone dark:border-charcoal-border bg-linen/30 dark:bg-soot/60 hover:border-lapis dark:hover:border-lapis-dark"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink dark:text-parchment leading-tight">
                        {built.displayLabel}
                      </span>
                      {action.sublabel && (
                        <span className="block text-[11px] text-ink-muted dark:text-ash mt-0.5">
                          {action.sublabel}
                        </span>
                      )}
                    </span>

                    <span className="font-mono text-sm font-semibold tabular-nums text-sienna dark:text-brass whitespace-nowrap shrink-0">
                      {built.formula}
                    </span>
                  </button>
                );
              })}

              {parsedProfile.attackType &&
                parsedProfile.rolls.some((r) => r.canCrit) && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-ink-muted dark:text-ash cursor-pointer select-none pt-0.5">
                    <input
                      type="checkbox"
                      checked={isCrit}
                      onChange={(e) => setIsCrit(e.target.checked)}
                      className="rounded border-limestone dark:border-charcoal-border accent-sienna dark:accent-brass"
                    />
                    <span>Critical Hit (double damage dice)</span>
                  </label>
                )}
            </div>
          ) : parsedProfile.saveAbility ? (
            <p className="text-xs text-ink-muted dark:text-ash">
              Targets make a {parsedProfile.saveAbility} save (DC {stats.saveDC}
              ). No direct damage dice detected.
            </p>
          ) : (
            <p className="text-xs text-ink-muted dark:text-ash">
              No direct attack or damage dice detected in this spell&apos;s text.
            </p>
          )}
        </div>
      )}

      {/* Compact Spellbook Quick-Select List */}
      {spellbookPicks.length > 0 ? (
        <div className="space-y-3">
          {(() => {
            const rollableSpells = spellbookPicks.filter((p) => p.rollable);
            const utilitySpells = spellbookPicks.filter((p) => !p.rollable);

            const renderSpellButton = (spell: Spell, mutedStyle: boolean) => {
              const isActive =
                selectedSpell?.id === spell.id ||
                selectedSpell?.name.toLowerCase() === spell.name.toLowerCase();
              return (
                <button
                  key={spell.id}
                  type="button"
                  onClick={() => handlePickSpell(spell)}
                  className={`h-7 px-2.5 inline-flex items-center gap-1 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? "border-lapis bg-lapis text-white dark:border-lapis-dark dark:bg-lapis-dark dark:text-obsidian"
                      : mutedStyle
                      ? "border-limestone/65 dark:border-charcoal-border/65 bg-paper/55 dark:bg-obsidian/55 text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:border-limestone dark:hover:border-charcoal-border"
                      : "border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-ink dark:text-parchment hover:border-lapis dark:hover:border-lapis-dark"
                  }`}
                >
                  <span>{spell.name}</span>
                </button>
              );
            };

            return (
              <>
                {rollableSpells.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted dark:text-ash">
                      Your Spellbook · With Dice or Saves (
                      {rollableSpells.length})
                    </p>
                    <div className="max-h-44 overflow-y-auto flex flex-wrap gap-1.5 pr-1">
                      {rollableSpells.map(({ spell }) =>
                        renderSpellButton(spell, false)
                      )}
                    </div>
                  </div>
                )}

                {utilitySpells.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted/80 dark:text-ash/75">
                      Utility · No Dice Detected ({utilitySpells.length})
                    </p>
                    <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1.5 pr-1">
                      {utilitySpells.map(({ spell }) =>
                        renderSpellButton(spell, true)
                      )}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        !selectedSpell && (
          <p className="text-xs text-ink-muted dark:text-ash">
            No spells in your Spellbook yet — search any 5e spell above to roll
            it.
          </p>
        )
      )}
    </div>
  );
};
