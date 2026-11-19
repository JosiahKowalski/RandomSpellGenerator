import Papa from "papaparse";
import {
  GrimoireSnapshot,
  LevelShortfall,
  RandomizerConfig,
  RollResult,
  RulePresetId,
  Spell,
} from "../types/spell";
import {
  casterLevelToMaxSpellLevel,
  DEFAULT_CONFIG,
  RULE_PRESETS,
  SPELL_LEVELS,
} from "./constants";

const COSTLY_MATERIAL_REGEX =
  /\b\d[\d,]*\s*(gp|sp|cp|ep|pp)\b|worth at least/i;
const WEAPON_COMPONENT_REGEX = /\bweapon\b/i;

export function parseLevelIndex(levelRaw: string): number {
  const normalized = (levelRaw || "").trim().toLowerCase();
  if (normalized === "cantrip" || normalized === "0") return 0;
  const parsed = parseInt(normalized.replace(/\D/g, ""), 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(9, parsed));
}

export function extractBaseSchool(schoolRaw: string): string {
  const clean = (schoolRaw || "").trim();
  const parenIndex = clean.indexOf("(");
  return (parenIndex >= 0 ? clean.slice(0, parenIndex) : clean).trim();
}

export function parseSpellsCSV(csvText: string): Spell[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const seen = new Set<string>();
  const spells: Spell[] = [];

  for (const row of result.data) {
    const name = (row.Name || "").trim();
    if (!name) continue;

    const source = (row.Source || "").trim();
    const dedupeKey = `${name.toLowerCase()}::${source.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const level = (row.Level || "Cantrip").trim();
    const levelIndex = parseLevelIndex(level);
    const school = (row.School || "").trim();
    const castingTime = (row["Casting Time"] || "").trim();
    const duration = (row.Duration || "").trim();
    const components = (row.Components || "").trim();

    spells.push({
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${source.toLowerCase() || "core"}`,
      name,
      source,
      page: (row.Page || "").trim(),
      level: SPELL_LEVELS[levelIndex]?.csvValue || level,
      levelIndex,
      castingTime,
      duration,
      school,
      schoolBase: extractBaseSchool(school),
      range: (row.Range || "").trim(),
      components,
      classes: (row.Classes || "").trim(),
      optionalVariantClasses: (row["Optional/Variant Classes"] || "").trim(),
      subclasses: (row.Subclasses || "").trim(),
      text: (row.Text || "").trim(),
      atHigherLevels: (row["At Higher Levels"] || "").trim(),
      isRitual:
        school.toLowerCase().includes("ritual") ||
        castingTime.toLowerCase().includes("ritual"),
      isConcentration: duration.toLowerCase().includes("concentration"),
      hasWeaponComponent: WEAPON_COMPONENT_REGEX.test(components),
      hasCostlyMaterial: COSTLY_MATERIAL_REGEX.test(components),
    });
  }

  return spells;
}

export function filterSpellPool(
  catalog: Spell[],
  config: RandomizerConfig
): Spell[] {
  const lowerClasses = config.classes.map((c) => c.toLowerCase());
  const lowerSchools = config.schools.map((s) => s.toLowerCase());
  const excludedSourcesSet = new Set(
    config.excludedSources.map((src) => src.toLowerCase())
  );

  return catalog.filter((spell) => {
    // Sourcebook filter
    if (
      excludedSourcesSet.size > 0 &&
      excludedSourcesSet.has(spell.source.toLowerCase())
    ) {
      return false;
    }

    // Class affinity filter (optionally includes Optional/Variant Classes column)
    if (lowerClasses.length > 0) {
      const combinedClasses = config.includeOptionalClasses
        ? `${spell.classes} ${spell.optionalVariantClasses}`.toLowerCase()
        : spell.classes.toLowerCase();

      const matchedClass = lowerClasses.some((cls) =>
        combinedClasses.includes(cls)
      );

      if (config.classMode === "exclude" && matchedClass) return false;
      if (config.classMode === "include" && !matchedClass) return false;
    }

    // School of magic filter
    if (lowerSchools.length > 0) {
      const spellSchool = spell.schoolBase.toLowerCase();
      const matchedSchool = lowerSchools.some((sch) =>
        spellSchool.includes(sch)
      );
      if (config.schoolMode === "exclude" && matchedSchool) return false;
      if (config.schoolMode === "include" && !matchedSchool) return false;
    }

    // Component & trait exclusions
    if (config.excludeWeaponComponents && spell.hasWeaponComponent) {
      return false;
    }
    if (config.excludeCostlyMaterials && spell.hasCostlyMaterial) {
      return false;
    }
    if (config.excludeConcentration && spell.isConcentration) {
      return false;
    }
    if (config.excludeRituals && spell.isRitual) {
      return false;
    }

    return true;
  });
}

function fisherYatesShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function rollRandomSpells(
  catalog: Spell[],
  knownSpellNames: string[],
  config: RandomizerConfig
): RollResult {
  const knownSet = new Set(knownSpellNames.map((n) => n.toLowerCase()));
  const eligiblePool = filterSpellPool(catalog, config).filter(
    (spell) => !knownSet.has(spell.name.toLowerCase())
  );

  const rolledNames: string[] = [];
  const chosenNamesLower = new Set<string>();
  const shortfalls: LevelShortfall[] = [];

  for (let lvl = 0; lvl <= config.maxSpellLevel; lvl++) {
    const requested = Math.max(
      0,
      Math.min(20, Number(config.levelCounts[String(lvl)] ?? 0))
    );
    if (requested === 0) continue;

    const candidates = eligiblePool.filter(
      (s) => s.levelIndex === lvl && !chosenNamesLower.has(s.name.toLowerCase())
    );

    if (candidates.length < requested) {
      shortfalls.push({
        levelIndex: lvl,
        requested,
        available: candidates.length,
      });
    }

    const picked = fisherYatesShuffle(candidates).slice(0, requested);
    for (const spell of picked) {
      rolledNames.push(spell.name);
      chosenNamesLower.add(spell.name.toLowerCase());
    }
  }

  return { rolledNames, shortfalls };
}

export function rerollSingleSpell(
  catalog: Spell[],
  knownSpellNames: string[],
  currentRolledNames: string[],
  targetSpellName: string,
  config: RandomizerConfig
): { nextRolledNames: string[]; replacedSpell: Spell | null } {
  const targetIndex = currentRolledNames.findIndex(
    (name) => name.toLowerCase() === targetSpellName.toLowerCase()
  );
  if (targetIndex === -1) {
    return { nextRolledNames: currentRolledNames, replacedSpell: null };
  }

  const targetSpell = catalog.find(
    (s) => s.name.toLowerCase() === targetSpellName.toLowerCase()
  );
  if (!targetSpell) {
    return { nextRolledNames: currentRolledNames, replacedSpell: null };
  }

  const excludedSet = new Set([
    ...knownSpellNames.map((n) => n.toLowerCase()),
    ...currentRolledNames.map((n) => n.toLowerCase()),
  ]);

  const candidates = filterSpellPool(catalog, config).filter(
    (s) =>
      s.levelIndex === targetSpell.levelIndex &&
      !excludedSet.has(s.name.toLowerCase())
  );

  if (candidates.length === 0) {
    return { nextRolledNames: currentRolledNames, replacedSpell: null };
  }

  const [replacement] = fisherYatesShuffle(candidates);
  const nextRolledNames = [...currentRolledNames];
  nextRolledNames[targetIndex] = replacement.name;
  return { nextRolledNames, replacedSpell: replacement };
}

export function getSpell5eToolsUrl(spell: Spell): string {
  const safeName = encodeURIComponent(spell.name.toLowerCase()).replace(
    /'/g,
    "%27"
  );
  const rawSource = (spell.source || "").toLowerCase();
  const safeSource = rawSource.replace(/'14/g, "");

  if (rawSource === "xphb" || rawSource === "xdmg" || rawSource === "xmm") {
    return `https://5e.tools/spells.html#${safeName}_${safeSource}`;
  }
  return `https://2014.5e.tools/spells.html#${safeName}_${safeSource}`;
}

export function detectPresetId(
  levelCounts: Record<string, number>
): RulePresetId {
  for (const [presetKey, preset] of Object.entries(RULE_PRESETS)) {
    const matches = SPELL_LEVELS.every(
      (lvl) => Number(levelCounts[lvl.key] ?? 0) === preset.counts[lvl.key]
    );
    if (matches) return presetKey as Exclude<RulePresetId, "custom">;
  }
  return "custom";
}

export function sanitizeConfig(raw: Partial<RandomizerConfig> | undefined): RandomizerConfig {
  const casterLevel =
    typeof raw?.casterLevel === "number" && Number.isFinite(raw.casterLevel)
      ? Math.max(1, Math.min(20, Math.round(raw.casterLevel)))
      : DEFAULT_CONFIG.casterLevel;

  const maxSpellLevel =
    typeof raw?.maxSpellLevel === "number" && Number.isFinite(raw.maxSpellLevel)
      ? Math.max(0, Math.min(9, Math.round(raw.maxSpellLevel)))
      : casterLevelToMaxSpellLevel(casterLevel);

  const levelCounts: Record<string, number> = {};
  for (const lvl of SPELL_LEVELS) {
    const val = raw?.levelCounts?.[lvl.key];
    levelCounts[lvl.key] =
      typeof val === "number" && Number.isFinite(val)
        ? Math.max(0, Math.min(20, Math.round(val)))
        : DEFAULT_CONFIG.levelCounts[lvl.key];
  }

  const classes = Array.isArray(raw?.classes)
    ? raw.classes
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 30)
    : [...DEFAULT_CONFIG.classes];

  const schools = Array.isArray(raw?.schools)
    ? raw.schools
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 20)
    : [...DEFAULT_CONFIG.schools];

  const excludedSources = Array.isArray(raw?.excludedSources)
    ? raw.excludedSources
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 100)
    : [];

  return {
    casterLevel,
    maxSpellLevel,
    levelCounts,
    classes,
    classMode: raw?.classMode === "exclude" ? "exclude" : "include",
    includeOptionalClasses:
      typeof raw?.includeOptionalClasses === "boolean"
        ? raw.includeOptionalClasses
        : DEFAULT_CONFIG.includeOptionalClasses,
    schools,
    schoolMode: raw?.schoolMode === "include" ? "include" : "exclude",
    excludeWeaponComponents:
      typeof raw?.excludeWeaponComponents === "boolean"
        ? raw.excludeWeaponComponents
        : DEFAULT_CONFIG.excludeWeaponComponents,
    excludeCostlyMaterials: Boolean(raw?.excludeCostlyMaterials),
    excludeConcentration: Boolean(raw?.excludeConcentration),
    excludeRituals: Boolean(raw?.excludeRituals),
    excludedSources,
    activePreset: detectPresetId(levelCounts),
  };
}

export function sanitizeStringList(raw: unknown, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const clean = item.trim().slice(0, 120);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxLen) break;
  }
  return out;
}

export function validateImportPayload(raw: unknown): GrimoireSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // Support both new GrimoireSnapshot format and legacy character JSON exports
  const isNewFormat =
    Array.isArray(obj.knownSpellNames) ||
    Array.isArray(obj.rolledSpellNames) ||
    (obj.config && typeof obj.config === "object");

  if (isNewFormat) {
    return {
      knownSpellNames: sanitizeStringList(obj.knownSpellNames, 400),
      rolledSpellNames: sanitizeStringList(obj.rolledSpellNames, 100),
      config: sanitizeConfig(obj.config as Partial<RandomizerConfig> | undefined),
      updatedAt:
        typeof obj.updatedAt === "string"
          ? obj.updatedAt
          : new Date().toISOString(),
    };
  }

  // Legacy export fallback (permanentSpellNames + settings + activeSpells)
  if (Array.isArray(obj.permanentSpellNames)) {
    const legacySettings = (obj.settings || {}) as Record<string, unknown>;
    const legacyChar = (obj.character || {}) as Record<string, unknown>;
    const legacyLevel =
      typeof legacyChar.level === "number" ? legacyChar.level : 5;
    const legacyActive = Array.isArray(obj.activeSpells)
      ? obj.activeSpells
          .filter(
            (s): s is { name: string; isPermanent?: boolean } =>
              Boolean(s && typeof s === "object" && typeof (s as { name?: unknown }).name === "string")
          )
          .filter((s) => !s.isPermanent)
          .map((s) => s.name)
      : [];

    return {
      knownSpellNames: sanitizeStringList(obj.permanentSpellNames, 400),
      rolledSpellNames: sanitizeStringList(legacyActive, 100),
      config: sanitizeConfig({
        casterLevel: legacyLevel,
        maxSpellLevel: casterLevelToMaxSpellLevel(legacyLevel),
        classes: Array.isArray(legacySettings.classes)
          ? (legacySettings.classes as string[])
          : DEFAULT_CONFIG.classes,
        classMode: legacySettings.excludeClasses ? "exclude" : "include",
        schools: Array.isArray(legacySettings.schools)
          ? (legacySettings.schools as string[])
          : [],
        schoolMode: legacySettings.excludeSchools ? "exclude" : "include",
        excludeWeaponComponents:
          typeof legacySettings.excludeWeaponComponents === "boolean"
            ? legacySettings.excludeWeaponComponents
            : true,
      }),
      updatedAt: new Date().toISOString(),
    };
  }

  return null;
}

export function getTotalPlannedRolls(config: RandomizerConfig): number {
  let total = 0;
  for (let lvl = 0; lvl <= config.maxSpellLevel; lvl++) {
    total += Math.max(0, Number(config.levelCounts[String(lvl)] ?? 0));
  }
  return total;
}

export function getUniqueSources(catalog: Spell[]): string[] {
  const counts = new Map<string, number>();
  for (const spell of catalog) {
    if (!spell.source) continue;
    counts.set(spell.source, (counts.get(spell.source) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([src]) => src);
}
