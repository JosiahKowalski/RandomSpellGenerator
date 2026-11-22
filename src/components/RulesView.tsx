import React, { useMemo, useRef } from "react";
import { RotateCcw, Upload } from "lucide-react";
import {
  MultiClassRule,
  RandomizerConfig,
  RulePresetId,
  Spell,
} from "../types/spell";
import {
  casterLevelToMaxSpellLevel,
  createUniformWeights,
  DEFAULT_CONFIG,
  DND_CLASSES,
  MAGIC_SCHOOLS,
  ODDS_OPTIONS,
  RULE_PRESETS,
  SPELL_LEVELS,
} from "../lib/constants";
import {
  detectPresetId,
  getTotalPlannedRolls,
  getUniqueSources,
} from "../lib/spellEngine";

interface RulesViewProps {
  config: RandomizerConfig;
  catalog: Spell[];
  eligiblePool: Spell[];
  knownSpellNames: string[];
  isCustomCatalog: boolean;
  onUpdateConfig: (next: RandomizerConfig) => void;
  onUploadCsv: (file: File) => void;
  onResetCatalog: () => void;
}

const MULTI_CLASS_OPTIONS: Array<{
  id: MultiClassRule;
  label: string;
  hint: string;
}> = [
  {
    id: "lowest",
    label: "Lowest odds",
    hint: "If a spell is on Sorcerer (0.25×) and Wizard (1×), it uses 0.25×. Best when lowering or turning off a class.",
  },
  {
    id: "average",
    label: "Average odds",
    hint: "If a spell is on Sorcerer (0.25×) and Wizard (1×), it blends them to 0.63×.",
  },
  {
    id: "highest",
    label: "Highest odds",
    hint: "If a spell is on Sorcerer (1×) and Wizard (Off), it uses 1×. Best when picking only specific classes.",
  },
];

export const RulesView: React.FC<RulesViewProps> = ({
  config,
  catalog,
  eligiblePool,
  knownSpellNames,
  isCustomCatalog,
  onUpdateConfig,
  onUploadCsv,
  onResetCatalog,
}) => {
  const csvInputRef = useRef<HTMLInputElement>(null);

  const knownSet = useMemo(
    () => new Set(knownSpellNames.map((n) => n.toLowerCase())),
    [knownSpellNames]
  );

  const availableByLevel = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lvl of SPELL_LEVELS) counts[lvl.key] = 0;
    for (const spell of eligiblePool) {
      if (knownSet.has(spell.name.toLowerCase())) continue;
      const key = String(spell.levelIndex);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [eligiblePool, knownSet]);

  const availableSources = useMemo(() => getUniqueSources(catalog), [catalog]);

  const handleCasterLevelChange = (casterLevel: number) => {
    const clamped = Math.max(1, Math.min(20, casterLevel));
    onUpdateConfig({
      ...config,
      casterLevel: clamped,
      maxSpellLevel: casterLevelToMaxSpellLevel(clamped),
    });
  };

  const handleMaxSpellLevelChange = (maxSpellLevel: number) => {
    const clamped = Math.max(0, Math.min(9, maxSpellLevel));
    onUpdateConfig({
      ...config,
      maxSpellLevel: clamped,
    });
  };

  const handleLevelCountChange = (levelKey: string, nextValue: number) => {
    const clamped = Math.max(0, Math.min(20, Math.round(nextValue)));
    const nextCounts = { ...config.levelCounts, [levelKey]: clamped };
    onUpdateConfig({
      ...config,
      levelCounts: nextCounts,
      activePreset: detectPresetId(nextCounts),
    });
  };

  const applyPreset = (presetId: Exclude<RulePresetId, "custom">) => {
    const counts = { ...RULE_PRESETS[presetId].counts };
    onUpdateConfig({
      ...config,
      levelCounts: counts,
      activePreset: presetId,
    });
  };

  const zeroAllCounts = () => {
    const counts: Record<string, number> = {};
    for (const lvl of SPELL_LEVELS) counts[lvl.key] = 0;
    onUpdateConfig({
      ...config,
      levelCounts: counts,
      activePreset: "custom",
    });
  };

  const setClassWeight = (cls: string, weight: number) => {
    onUpdateConfig({
      ...config,
      classWeights: { ...config.classWeights, [cls]: weight },
    });
  };

  const setOnlyClass = (cls: string) => {
    const next = createUniformWeights(DND_CLASSES, 0);
    next[cls] = 1;
    onUpdateConfig({
      ...config,
      classWeights: next,
      multiClassRule: "highest",
    });
  };

  const resetAllClasses = (weight: number) => {
    onUpdateConfig({
      ...config,
      classWeights: createUniformWeights(DND_CLASSES, weight),
      multiClassRule: weight > 0 ? "lowest" : "highest",
    });
  };

  const setSchoolWeight = (school: string, weight: number) => {
    onUpdateConfig({
      ...config,
      schoolWeights: { ...config.schoolWeights, [school]: weight },
    });
  };

  const setOnlySchool = (school: string) => {
    const next = createUniformWeights(MAGIC_SCHOOLS, 0);
    next[school] = 1;
    onUpdateConfig({
      ...config,
      schoolWeights: next,
    });
  };

  const resetAllSchools = (weight: number) => {
    onUpdateConfig({
      ...config,
      schoolWeights: createUniformWeights(MAGIC_SCHOOLS, weight),
    });
  };

  const toggleSourceExclusion = (source: string) => {
    const next = config.excludedSources.includes(source)
      ? config.excludedSources.filter((s) => s !== source)
      : [...config.excludedSources, source];
    onUpdateConfig({ ...config, excludedSources: next });
  };

  const totalPlanned = getTotalPlannedRolls(config);
  const activeMultiClassMeta =
    MULTI_CLASS_OPTIONS.find((opt) => opt.id === config.multiClassRule) ||
    MULTI_CLASS_OPTIONS[0];

  const getOddsButtonClass = (isActive: boolean, value: number) => {
    if (!isActive) {
      return "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-paper/70 dark:hover:bg-obsidian/60";
    }
    if (value === 0) {
      return "bg-sienna text-white dark:bg-brass dark:text-obsidian shadow-xs";
    }
    if (value > 1) {
      return "bg-lapis text-white dark:bg-lapis-dark dark:text-obsidian shadow-xs";
    }
    if (value < 1) {
      return "bg-stone-700 text-paper dark:bg-stone-300 dark:text-obsidian shadow-xs";
    }
    return "bg-paper dark:bg-obsidian text-ink dark:text-parchment shadow-xs";
  };

  return (
    <div className="max-w-5xl space-y-12">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-limestone dark:border-charcoal-border">
        <div>
          <p className="text-xs font-mono tabular-nums text-ink-muted dark:text-ash">
            {totalPlanned} spells per roll · {eligiblePool.length} matching spells
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-ink dark:text-parchment mt-1">
            Randomizer Rules
          </h1>
        </div>

        <button
          type="button"
          onClick={() => onUpdateConfig({ ...DEFAULT_CONFIG })}
          className="h-10 px-4 inline-flex items-center gap-2 rounded-md border border-limestone dark:border-charcoal-border text-sm text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {/* Section 1: Caster Cap & Per-Level Roll Table */}
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl font-semibold text-ink dark:text-parchment">
            Spell Levels &amp; Roll Quotas
          </h2>
          <p className="text-sm text-ink-muted dark:text-ash max-w-2xl leading-relaxed">
            Set your character&apos;s Caster Level to unlock spell levels automatically, or adjust the highest spell level and individual per-level counts directly.
          </p>
        </div>

        <div className="p-5 rounded-lg border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label
                htmlFor="caster-level-select"
                className="block text-sm font-medium text-ink dark:text-parchment"
              >
                Caster Level (Full-Caster Progression)
              </label>
              <select
                id="caster-level-select"
                value={config.casterLevel}
                onChange={(e) => handleCasterLevelChange(Number(e.target.value))}
                className="w-full h-11 px-3.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-sm font-mono tabular-nums text-ink dark:text-parchment focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
              >
                {Array.from({ length: 20 }, (_, i) => i + 1).map((lvl) => {
                  const maxSpell = casterLevelToMaxSpellLevel(lvl);
                  return (
                    <option key={lvl} value={lvl}>
                      Level {lvl} (unlocks up to {SPELL_LEVELS[maxSpell].shortLabel})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="max-spell-level-select"
                className="block text-sm font-medium text-ink dark:text-parchment"
              >
                Highest Unlocked Spell Level (Override)
              </label>
              <select
                id="max-spell-level-select"
                value={config.maxSpellLevel}
                onChange={(e) => handleMaxSpellLevelChange(Number(e.target.value))}
                className="w-full h-11 px-3.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-sm font-mono tabular-nums text-ink dark:text-parchment focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
              >
                {SPELL_LEVELS.map((lvl) => (
                  <option key={lvl.key} value={lvl.index}>
                    {lvl.index === 0
                      ? "Cantrips Only"
                      : `Up to ${lvl.shortLabel} Level`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-limestone dark:border-charcoal-border flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink dark:text-parchment">
                Ritual Casting
              </p>
              <p className="text-xs text-ink-muted dark:text-ash mt-0.5 leading-relaxed">
                Show ritual casting options that don&apos;t spend a spell slot (for Wizards, Clerics, Druids, Bards, or the Ritual Caster feat). Leave off for Sorcerers and other non-ritual casters.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={config.canRitualCast}
              aria-label="Enable ritual casting"
              onClick={() =>
                onUpdateConfig({
                  ...config,
                  canRitualCast: !config.canRitualCast,
                })
              }
              className={`relative shrink-0 w-12 h-7 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
                config.canRitualCast
                  ? "bg-lapis dark:bg-lapis-dark"
                  : "bg-limestone dark:bg-charcoal-border"
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-paper dark:bg-obsidian transition-transform ${
                  config.canRitualCast ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              Object.entries(RULE_PRESETS) as Array<
                [
                  Exclude<RulePresetId, "custom">,
                  (typeof RULE_PRESETS)[Exclude<RulePresetId, "custom">],
                ]
              >
            ).map(([presetId, preset]) => {
              const active = config.activePreset === presetId;
              return (
                <button
                  key={presetId}
                  type="button"
                  onClick={() => applyPreset(presetId)}
                  title={preset.description}
                  className={`h-9 px-3.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                    active
                      ? "bg-lapis text-white border-lapis dark:bg-lapis-dark dark:text-obsidian dark:border-lapis-dark"
                      : "bg-paper dark:bg-soot text-ink dark:text-parchment border-limestone dark:border-charcoal-border hover:bg-linen dark:hover:bg-obsidian"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={zeroAllCounts}
              className="h-9 px-3 rounded-md text-xs font-medium text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment transition-colors whitespace-nowrap"
            >
              Set All to 0
            </button>
          </div>

          <span className="text-xs text-ink-muted dark:text-ash">
            {config.activePreset === "custom"
              ? "Custom per-level distribution"
              : RULE_PRESETS[config.activePreset].description}
          </span>
        </div>

        <div className="border border-limestone dark:border-charcoal-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2.5 bg-linen dark:bg-soot border-b border-limestone dark:border-charcoal-border text-xs font-medium text-ink-muted dark:text-ash">
            <div className="col-span-4 sm:col-span-3">Spell Level</div>
            <div className="col-span-3 hidden sm:block">Status</div>
            <div className="col-span-5 sm:col-span-3 text-center">
              Spells to Roll
            </div>
            <div className="col-span-3 text-right">Eligible Pool</div>
          </div>

          <div className="divide-y divide-limestone dark:divide-charcoal-border">
            {SPELL_LEVELS.map((lvl) => {
              const isUnlocked = lvl.index <= config.maxSpellLevel;
              const count = Number(config.levelCounts[lvl.key] ?? 0);
              const eligibleCount = availableByLevel[lvl.key] ?? 0;
              const hasShortfall = isUnlocked && count > eligibleCount;

              return (
                <div
                  key={lvl.key}
                  className={`grid grid-cols-12 items-center px-4 py-3 text-sm transition-colors ${
                    isUnlocked
                      ? "bg-paper dark:bg-obsidian"
                      : "bg-linen/40 dark:bg-soot/40 opacity-60"
                  }`}
                >
                  <div className="col-span-4 sm:col-span-3 font-medium text-ink dark:text-parchment">
                    {lvl.index === 0 ? "Cantrip" : `${lvl.shortLabel} Level`}
                  </div>

                  <div className="col-span-3 hidden sm:flex items-center gap-2 text-xs">
                    {isUnlocked ? (
                      <span className="text-ink-muted dark:text-ash">
                        {count > 0 ? "Active" : "Skipped (0)"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleMaxSpellLevelChange(lvl.index)}
                        className="text-lapis dark:text-lapis-dark hover:underline text-left"
                      >
                        Unlock to {lvl.shortLabel}
                      </button>
                    )}
                  </div>

                  <div className="col-span-5 sm:col-span-3 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleLevelCountChange(lvl.key, count - 1)
                      }
                      disabled={count <= 0}
                      aria-label={`Decrease ${lvl.shortLabel} roll count`}
                      className="h-9 w-9 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot text-ink dark:text-parchment font-mono hover:bg-linen dark:hover:bg-obsidian disabled:opacity-35 transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={count}
                      aria-label={`${lvl.shortLabel} roll count`}
                      onChange={(e) =>
                        handleLevelCountChange(
                          lvl.key,
                          e.target.value === "" ? 0 : parseInt(e.target.value, 10)
                        )
                      }
                      className="w-12 h-9 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot text-center font-mono tabular-nums text-sm font-medium text-ink dark:text-parchment focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleLevelCountChange(lvl.key, count + 1)
                      }
                      disabled={count >= 20}
                      aria-label={`Increase ${lvl.shortLabel} roll count`}
                      className="h-9 w-9 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot text-ink dark:text-parchment font-mono hover:bg-linen dark:hover:bg-obsidian disabled:opacity-35 transition-colors"
                    >
                      +
                    </button>
                  </div>

                  <div className="col-span-3 text-right font-mono tabular-nums text-xs">
                    {hasShortfall ? (
                      <span className="text-sienna dark:text-brass font-medium">
                        Only {eligibleCount} left
                      </span>
                    ) : (
                      <span className="text-ink-muted dark:text-ash">
                        {eligibleCount} available
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 2: Class & School Odds */}
      <section className="space-y-8 pt-4 border-t border-limestone dark:border-charcoal-border">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl font-semibold text-ink dark:text-parchment">
            Class &amp; School Odds
          </h2>
          <p className="text-sm text-ink-muted dark:text-ash max-w-2xl leading-relaxed">
            Set relative roll odds for each class and school. Use <strong className="font-medium text-ink dark:text-parchment">Off</strong> to exclude completely, <strong className="font-medium text-ink dark:text-parchment">0.25× / 0.5×</strong> to make spells rarer while keeping them possible, or <strong className="font-medium text-ink dark:text-parchment">2× / 3×</strong> to favor them.
          </p>
        </div>

        {/* Class Odds */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink dark:text-parchment">
              Classes
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => resetAllClasses(1)}
                className="text-lapis dark:text-lapis-dark hover:underline whitespace-nowrap"
              >
                All Normal (1×)
              </button>
              <span aria-hidden="true" className="text-limestone dark:text-charcoal-border">
                /
              </span>
              <button
                type="button"
                onClick={() => resetAllClasses(0)}
                className="text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment whitespace-nowrap"
              >
                All Off
              </button>
            </div>
          </div>

          {/* Multi-class overlap selector */}
          <div className="p-4 rounded-lg border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink dark:text-parchment">
                When a spell belongs to multiple classes
              </span>
              <div className="inline-flex items-center gap-1 p-0.5 rounded-md bg-paper dark:bg-obsidian border border-limestone dark:border-charcoal-border self-start sm:self-auto">
                {MULTI_CLASS_OPTIONS.map((opt) => {
                  const active = config.multiClassRule === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onUpdateConfig({ ...config, multiClassRule: opt.id })
                      }
                      className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                        active
                          ? "bg-lapis text-white dark:bg-lapis-dark dark:text-obsidian"
                          : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-ink-muted dark:text-ash leading-relaxed">
              {activeMultiClassMeta.hint}
            </p>
          </div>

          {/* Class Odds Rows */}
          <div className="border border-limestone dark:border-charcoal-border rounded-lg divide-y divide-limestone dark:divide-charcoal-border overflow-hidden">
            {DND_CLASSES.map((cls) => {
              const currentWeight = Number(config.classWeights[cls] ?? 1);
              return (
                <div
                  key={cls}
                  className="px-4 py-2.5 bg-paper dark:bg-obsidian flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-center justify-between sm:justify-start gap-3">
                    <span
                      className={`text-sm font-medium ${
                        currentWeight === 0
                          ? "text-ink-muted dark:text-ash line-through"
                          : "text-ink dark:text-parchment"
                      }`}
                    >
                      {cls}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOnlyClass(cls)}
                      className="text-xs text-ink-muted dark:text-ash hover:text-lapis dark:hover:text-lapis-dark transition-colors"
                      title={`Set only ${cls} to 1× and all other classes to Off`}
                    >
                      Only
                    </button>
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-md bg-linen dark:bg-soot border border-limestone dark:border-charcoal-border overflow-x-auto">
                    {ODDS_OPTIONS.map((opt) => {
                      const active = currentWeight === opt.value;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setClassWeight(cls, opt.value)}
                          className={`flex-1 sm:flex-none min-w-[48px] h-8 px-2 rounded text-xs font-mono tabular-nums font-medium whitespace-nowrap transition-colors ${getOddsButtonClass(
                            active,
                            opt.value
                          )}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <label className="flex items-start gap-3 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={config.includeOptionalClasses}
              onChange={(e) =>
                onUpdateConfig({
                  ...config,
                  includeOptionalClasses: e.target.checked,
                })
              }
              className="mt-0.5 h-4 w-4 rounded border-limestone dark:border-charcoal-border accent-lapis dark:accent-lapis-dark"
            />
            <span className="text-xs text-ink-muted dark:text-ash leading-relaxed">
              <strong className="font-medium text-ink dark:text-parchment">
                Include optional &amp; expansion class lists
              </strong>{" "}
              (captures XGE/TCE spells like <em>Absorb Elements</em> listed in the Optional/Variant column)
            </span>
          </label>
        </div>

        {/* School Odds */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink dark:text-parchment">
              Schools of Magic
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => resetAllSchools(1)}
                className="text-lapis dark:text-lapis-dark hover:underline whitespace-nowrap"
              >
                All Normal (1×)
              </button>
              <span aria-hidden="true" className="text-limestone dark:text-charcoal-border">
                /
              </span>
              <button
                type="button"
                onClick={() => resetAllSchools(0)}
                className="text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment whitespace-nowrap"
              >
                All Off
              </button>
            </div>
          </div>

          <div className="border border-limestone dark:border-charcoal-border rounded-lg divide-y divide-limestone dark:divide-charcoal-border overflow-hidden">
            {MAGIC_SCHOOLS.map((school) => {
              const currentWeight = Number(config.schoolWeights[school] ?? 1);
              return (
                <div
                  key={school}
                  className="px-4 py-2.5 bg-paper dark:bg-obsidian flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-center justify-between sm:justify-start gap-3">
                    <span
                      className={`text-sm font-medium ${
                        currentWeight === 0
                          ? "text-ink-muted dark:text-ash line-through"
                          : "text-ink dark:text-parchment"
                      }`}
                    >
                      {school}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOnlySchool(school)}
                      className="text-xs text-ink-muted dark:text-ash hover:text-lapis dark:hover:text-lapis-dark transition-colors"
                      title={`Set only ${school} to 1× and all other schools to Off`}
                    >
                      Only
                    </button>
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-md bg-linen dark:bg-soot border border-limestone dark:border-charcoal-border overflow-x-auto">
                    {ODDS_OPTIONS.map((opt) => {
                      const active = currentWeight === opt.value;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setSchoolWeight(school, opt.value)}
                          className={`flex-1 sm:flex-none min-w-[48px] h-8 px-2 rounded text-xs font-mono tabular-nums font-medium whitespace-nowrap transition-colors ${getOddsButtonClass(
                            active,
                            opt.value
                          )}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 3: Component, Trait & Sourcebook Exclusions */}
      <section className="space-y-6 pt-4 border-t border-limestone dark:border-charcoal-border">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl font-semibold text-ink dark:text-parchment">
            Component &amp; Source Exclusions
          </h2>
          <p className="text-sm text-ink-muted dark:text-ash max-w-2xl leading-relaxed">
            Keep out spells that require specific weapons, expensive gold components, concentration, rituals, or campaign-specific books.
          </p>
        </div>

        <div className="divide-y divide-limestone dark:divide-charcoal-border border border-limestone dark:border-charcoal-border rounded-lg overflow-hidden">
          {[
            {
              key: "excludeWeaponComponents" as const,
              title: "Exclude Weapon Components",
              description:
                "Skip spells requiring a weapon as a material component (e.g., Booming Blade, Green-Flame Blade, Steel Wind Strike).",
            },
            {
              key: "excludeCostlyMaterials" as const,
              title: "Exclude Costly Material Components",
              description:
                "Skip spells whose material component specifies a coin value (gp, sp, etc.).",
            },
            {
              key: "excludeConcentration" as const,
              title: "Exclude Concentration Spells",
              description:
                "Only roll instantaneous or non-concentration spells.",
            },
            {
              key: "excludeRituals" as const,
              title: "Exclude Ritual Spells",
              description: "Skip spells tagged with the Ritual casting tag.",
            },
          ].map((toggle) => {
            const enabled = config[toggle.key];
            return (
              <div
                key={toggle.key}
                className="p-4 bg-paper dark:bg-obsidian flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink dark:text-parchment">
                    {toggle.title}
                  </p>
                  <p className="text-xs text-ink-muted dark:text-ash mt-0.5 leading-relaxed">
                    {toggle.description}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() =>
                    onUpdateConfig({ ...config, [toggle.key]: !enabled })
                  }
                  className={`relative shrink-0 w-12 h-7 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
                    enabled
                      ? "bg-lapis dark:bg-lapis-dark"
                      : "bg-limestone dark:bg-charcoal-border"
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-paper dark:bg-obsidian transition-transform ${
                      enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {/* Sourcebook Exclusions */}
        {availableSources.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink dark:text-parchment">
                Exclude Specific Sourcebooks
              </h3>
              {config.excludedSources.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({ ...config, excludedSources: [] })
                  }
                  className="text-xs text-lapis dark:text-lapis-dark hover:underline"
                >
                  Allow All Books
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {availableSources.map((src) => {
                const isExcluded = config.excludedSources.includes(src);
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => toggleSourceExclusion(src)}
                    className={`h-8 px-3 rounded-md font-mono text-xs border transition-colors ${
                      isExcluded
                        ? "bg-sienna text-white border-sienna dark:bg-brass dark:text-obsidian dark:border-brass line-through"
                        : "bg-paper dark:bg-soot text-ink dark:text-parchment border-limestone dark:border-charcoal-border hover:bg-linen dark:hover:bg-obsidian"
                    }`}
                  >
                    {src}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Section 4: Spell Database CSV */}
      <section className="space-y-4 pt-4 border-t border-limestone dark:border-charcoal-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-serif text-2xl font-semibold text-ink dark:text-parchment">
              Spell Database
            </h2>
            <p className="text-sm text-ink-muted dark:text-ash">
              Currently loaded:{" "}
              <span className="font-mono tabular-nums font-medium text-ink dark:text-parchment">
                {catalog.length}
              </span>{" "}
              spells ({isCustomCatalog ? "Custom CSV" : "Bundled 5eTools CSV"}).
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isCustomCatalog && (
              <button
                type="button"
                onClick={onResetCatalog}
                className="h-10 px-4 rounded-md border border-limestone dark:border-charcoal-border text-sm text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap"
              >
                Restore Bundled CSV
              </button>
            )}
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="h-10 px-4 inline-flex items-center gap-2 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot text-sm font-medium text-ink dark:text-parchment hover:bg-linen dark:hover:bg-obsidian transition-colors whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Custom CSV</span>
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadCsv(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
};
