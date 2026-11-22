import Papa from "papaparse";
import {
  GrimoireSnapshot,
  LevelShortfall,
  MultiClassRule,
  RandomizerConfig,
  RollResult,
  RulePresetId,
  Spell,
} from "../types/spell";
import {
  casterLevelToMaxSpellLevel,
  createUniformWeights,
  DEFAULT_CONFIG,
  DND_CLASSES,
  MAGIC_SCHOOLS,
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

export function getSpellMatchedClasses(
  spell: Spell,
  includeOptionalClasses: boolean
): string[] {
  const combined = includeOptionalClasses
    ? `${spell.classes} ${spell.optionalVariantClasses}`.toLowerCase()
    : spell.classes.toLowerCase();

  return DND_CLASSES.filter((cls) => combined.includes(cls.toLowerCase()));
}

export function getSpellClassWeight(
  spell: Spell,
  config: RandomizerConfig
): number {
  const matchedClasses = getSpellMatchedClasses(
    spell,
    config.includeOptionalClasses
  );

  if (matchedClasses.length === 0) {
    // Spells with no recognized base class (e.g., custom/subclass-only) are allowed
    // only when at least one class is enabled and no classes are turned off globally.
    const allEnabled = DND_CLASSES.every(
      (cls) => (config.classWeights[cls] ?? 1) > 0
    );
    return allEnabled ? 1 : 0;
  }

  const weights = matchedClasses.map((cls) =>
    Math.max(0, Number(config.classWeights[cls] ?? 1))
  );

  if (config.multiClassRule === "highest") {
    return Math.max(...weights);
  }

  if (config.multiClassRule === "average") {
    const sum = weights.reduce((acc, w) => acc + w, 0);
    return sum / weights.length;
  }

  // "lowest": strict rule — if any of the spell's classes is lowered or Off (0),
  // that lower weight governs the spell.
  return Math.min(...weights);
}

export function getSpellSchoolWeight(
  spell: Spell,
  config: RandomizerConfig
): number {
  const matchedSchool = MAGIC_SCHOOLS.find(
    (sch) => sch.toLowerCase() === spell.schoolBase.toLowerCase()
  );
  if (!matchedSchool) return 1;
  return Math.max(0, Number(config.schoolWeights[matchedSchool] ?? 1));
}

export function getSpellWeight(
  spell: Spell,
  config: RandomizerConfig
): number {
  // Hard exclusions: sourcebook, weapon components, costly materials, traits
  if (
    config.excludedSources.length > 0 &&
    config.excludedSources.some(
      (src) => src.toLowerCase() === spell.source.toLowerCase()
    )
  ) {
    return 0;
  }

  if (config.excludeWeaponComponents && spell.hasWeaponComponent) return 0;
  if (config.excludeCostlyMaterials && spell.hasCostlyMaterial) return 0;
  if (config.excludeConcentration && spell.isConcentration) return 0;
  if (config.excludeRituals && spell.isRitual) return 0;

  const classWeight = getSpellClassWeight(spell, config);
  if (classWeight <= 0) return 0;

  const schoolWeight = getSpellSchoolWeight(spell, config);
  if (schoolWeight <= 0) return 0;

  return classWeight * schoolWeight;
}

export function formatWeightLabel(weight: number): string {
  if (weight <= 0) return "Off";
  const rounded = Math.round(weight * 100) / 100;
  return `${rounded}×`;
}

export function filterSpellPool(
  catalog: Spell[],
  config: RandomizerConfig
): Spell[] {
  return catalog.filter((spell) => getSpellWeight(spell, config) > 0);
}

function weightedSampleWithoutReplacement<T>(
  items: T[],
  getWeight: (item: T) => number,
  count: number
): T[] {
  const remaining = items
    .map((item) => ({ item, weight: Math.max(0, getWeight(item)) }))
    .filter((entry) => entry.weight > 0);

  const picked: T[] = [];
  const draws = Math.min(count, remaining.length);

  for (let d = 0; d < draws; d++) {
    const totalWeight = remaining.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) break;

    let cursor = Math.random() * totalWeight;
    let chosenIdx = remaining.length - 1;

    for (let i = 0; i < remaining.length; i++) {
      cursor -= remaining[i].weight;
      if (cursor <= 0) {
        chosenIdx = i;
        break;
      }
    }

    picked.push(remaining[chosenIdx].item);
    remaining.splice(chosenIdx, 1);
  }

  return picked;
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

    const picked = weightedSampleWithoutReplacement(
      candidates,
      (spell) => getSpellWeight(spell, config),
      requested
    );

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

  const [replacement] = weightedSampleWithoutReplacement(
    candidates,
    (spell) => getSpellWeight(spell, config),
    1
  );

  if (!replacement) {
    return { nextRolledNames: currentRolledNames, replacedSpell: null };
  }

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

function clampWeight(val: unknown, fallback = 1): number {
  if (typeof val !== "number" || !Number.isFinite(val)) return fallback;
  const clamped = Math.max(0, Math.min(10, val));
  return Math.round(clamped * 100) / 100;
}

export function sanitizeConfig(raw: unknown): RandomizerConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;

  const casterLevel =
    typeof obj.casterLevel === "number" && Number.isFinite(obj.casterLevel)
      ? Math.max(1, Math.min(20, Math.round(obj.casterLevel)))
      : DEFAULT_CONFIG.casterLevel;

  const maxSpellLevel =
    typeof obj.maxSpellLevel === "number" && Number.isFinite(obj.maxSpellLevel)
      ? Math.max(0, Math.min(9, Math.round(obj.maxSpellLevel)))
      : casterLevelToMaxSpellLevel(casterLevel);

  const rawCounts =
    obj.levelCounts && typeof obj.levelCounts === "object"
      ? (obj.levelCounts as Record<string, unknown>)
      : {};
  const levelCounts: Record<string, number> = {};
  for (const lvl of SPELL_LEVELS) {
    const val = rawCounts[lvl.key];
    levelCounts[lvl.key] =
      typeof val === "number" && Number.isFinite(val)
        ? Math.max(0, Math.min(20, Math.round(val)))
        : DEFAULT_CONFIG.levelCounts[lvl.key];
  }

  // Class weights (with automatic migration from legacy classes + classMode)
  let classWeights: Record<string, number>;
  let inferredMultiClassRule: MultiClassRule = DEFAULT_CONFIG.multiClassRule;

  if (obj.classWeights && typeof obj.classWeights === "object") {
    const rawMap = obj.classWeights as Record<string, unknown>;
    classWeights = {};
    for (const cls of DND_CLASSES) {
      classWeights[cls] = clampWeight(rawMap[cls], 1);
    }
  } else if (Array.isArray(obj.classes)) {
    const legacyClasses = obj.classes
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.toLowerCase());
    const legacyExclude = obj.classMode === "exclude";

    if (legacyClasses.length === 0) {
      classWeights = createUniformWeights(DND_CLASSES, 1);
    } else if (legacyExclude) {
      classWeights = {};
      for (const cls of DND_CLASSES) {
        classWeights[cls] = legacyClasses.includes(cls.toLowerCase()) ? 0 : 1;
      }
      inferredMultiClassRule = "lowest";
    } else {
      classWeights = {};
      for (const cls of DND_CLASSES) {
        classWeights[cls] = legacyClasses.includes(cls.toLowerCase()) ? 1 : 0;
      }
      inferredMultiClassRule = "highest";
    }
  } else {
    classWeights = { ...DEFAULT_CONFIG.classWeights };
  }

  const multiClassRule: MultiClassRule =
    obj.multiClassRule === "highest" ||
    obj.multiClassRule === "average" ||
    obj.multiClassRule === "lowest"
      ? obj.multiClassRule
      : inferredMultiClassRule;

  // School weights (with automatic migration from legacy schools + schoolMode)
  let schoolWeights: Record<string, number>;
  if (obj.schoolWeights && typeof obj.schoolWeights === "object") {
    const rawMap = obj.schoolWeights as Record<string, unknown>;
    schoolWeights = {};
    for (const sch of MAGIC_SCHOOLS) {
      schoolWeights[sch] = clampWeight(rawMap[sch], 1);
    }
  } else if (Array.isArray(obj.schools)) {
    const legacySchools = obj.schools
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.toLowerCase());
    const legacyInclude = obj.schoolMode === "include";

    if (legacySchools.length === 0) {
      schoolWeights = createUniformWeights(MAGIC_SCHOOLS, 1);
    } else if (legacyInclude) {
      schoolWeights = {};
      for (const sch of MAGIC_SCHOOLS) {
        schoolWeights[sch] = legacySchools.includes(sch.toLowerCase()) ? 1 : 0;
      }
    } else {
      schoolWeights = {};
      for (const sch of MAGIC_SCHOOLS) {
        schoolWeights[sch] = legacySchools.includes(sch.toLowerCase()) ? 0 : 1;
      }
    }
  } else {
    schoolWeights = { ...DEFAULT_CONFIG.schoolWeights };
  }

  const excludedSources = Array.isArray(obj.excludedSources)
    ? obj.excludedSources
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 100)
    : [];

  return {
    casterLevel,
    maxSpellLevel,
    levelCounts,
    classWeights,
    multiClassRule,
    includeOptionalClasses:
      typeof obj.includeOptionalClasses === "boolean"
        ? obj.includeOptionalClasses
        : DEFAULT_CONFIG.includeOptionalClasses,
    schoolWeights,
    excludeWeaponComponents:
      typeof obj.excludeWeaponComponents === "boolean"
        ? obj.excludeWeaponComponents
        : DEFAULT_CONFIG.excludeWeaponComponents,
    excludeCostlyMaterials: Boolean(obj.excludeCostlyMaterials),
    excludeConcentration: Boolean(obj.excludeConcentration),
    excludeRituals: Boolean(obj.excludeRituals),
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

  const isNewFormat =
    Array.isArray(obj.knownSpellNames) ||
    Array.isArray(obj.rolledSpellNames) ||
    (obj.config && typeof obj.config === "object");

  if (isNewFormat) {
    return {
      knownSpellNames: sanitizeStringList(obj.knownSpellNames, 400),
      rolledSpellNames: sanitizeStringList(obj.rolledSpellNames, 100),
      config: sanitizeConfig(obj.config),
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
              Boolean(
                s &&
                  typeof s === "object" &&
                  typeof (s as { name?: unknown }).name === "string"
              )
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
          ? legacySettings.classes
          : [],
        classMode: legacySettings.excludeClasses ? "exclude" : "include",
        schools: Array.isArray(legacySettings.schools)
          ? legacySettings.schools
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

export function summarizeWeights(
  keys: string[],
  weights: Record<string, number>,
  nounPlural: string
): string {
  const off: string[] = [];
  const reduced: string[] = [];
  const boosted: string[] = [];
  const normal: string[] = [];

  for (const key of keys) {
    const w = Number(weights[key] ?? 1);
    if (w <= 0) off.push(key);
    else if (w < 1) reduced.push(`${key} (${formatWeightLabel(w)})`);
    else if (w > 1) boosted.push(`${key} (${formatWeightLabel(w)})`);
    else normal.push(key);
  }

  if (off.length === keys.length) return `None (all ${nounPlural} off)`;
  if (off.length === 0 && reduced.length === 0 && boosted.length === 0) {
    return `All ${nounPlural} (1×)`;
  }

  // If only 1-3 items are enabled and the rest are Off, show the enabled ones concisely
  const enabledCount = keys.length - off.length;
  if (enabledCount > 0 && enabledCount <= 3 && off.length >= 4) {
    const activeLabels = keys
      .filter((k) => Number(weights[k] ?? 1) > 0)
      .map((k) => {
        const w = Number(weights[k] ?? 1);
        return w === 1 ? k : `${k} (${formatWeightLabel(w)})`;
      });
    return `Only ${activeLabels.join(", ")}`;
  }

  const parts: string[] = [];
  if (boosted.length > 0) parts.push(`Boosted: ${boosted.join(", ")}`);
  if (reduced.length > 0) parts.push(`Lowered: ${reduced.join(", ")}`);
  if (off.length > 0) parts.push(`Off: ${off.join(", ")}`);
  return parts.join(" · ");
}
