import { RandomizerConfig, RulePresetId } from "../types/spell";

export interface SpellLevelMeta {
  index: number;
  key: string;
  shortLabel: string;
  heading: string;
  csvValue: string;
}

export const SPELL_LEVELS: SpellLevelMeta[] = [
  { index: 0, key: "0", shortLabel: "Cantrip", heading: "Cantrips", csvValue: "Cantrip" },
  { index: 1, key: "1", shortLabel: "1st", heading: "1st-Level Spells", csvValue: "1st" },
  { index: 2, key: "2", shortLabel: "2nd", heading: "2nd-Level Spells", csvValue: "2nd" },
  { index: 3, key: "3", shortLabel: "3rd", heading: "3rd-Level Spells", csvValue: "3rd" },
  { index: 4, key: "4", shortLabel: "4th", heading: "4th-Level Spells", csvValue: "4th" },
  { index: 5, key: "5", shortLabel: "5th", heading: "5th-Level Spells", csvValue: "5th" },
  { index: 6, key: "6", shortLabel: "6th", heading: "6th-Level Spells", csvValue: "6th" },
  { index: 7, key: "7", shortLabel: "7th", heading: "7th-Level Spells", csvValue: "7th" },
  { index: 8, key: "8", shortLabel: "8th", heading: "8th-Level Spells", csvValue: "8th" },
  { index: 9, key: "9", shortLabel: "9th", heading: "9th-Level Spells", csvValue: "9th" },
];

export const DND_CLASSES: string[] = [
  "Artificer",
  "Bard",
  "Cleric",
  "Druid",
  "Paladin",
  "Ranger",
  "Sorcerer",
  "Warlock",
  "Wizard",
];

export const MAGIC_SCHOOLS: string[] = [
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
];

export interface OddsOption {
  value: number;
  label: string;
}

export const ODDS_OPTIONS: OddsOption[] = [
  { value: 0, label: "Off" },
  { value: 0.25, label: "0.25×" },
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 3, label: "3×" },
];

export function createUniformWeights(
  keys: string[],
  value: number
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const key of keys) {
    weights[key] = value;
  }
  return weights;
}

export const RULE_PRESETS: Record<
  Exclude<RulePresetId, "custom">,
  { label: string; description: string; counts: Record<string, number> }
> = {
  standard_121: {
    label: "1-2-1 Default",
    description: "1 cantrip, 2 per level (1st–5th), 1 per level (6th–9th)",
    counts: {
      "0": 1,
      "1": 2,
      "2": 2,
      "3": 2,
      "4": 2,
      "5": 2,
      "6": 1,
      "7": 1,
      "8": 1,
      "9": 1,
    },
  },
  one_per_level: {
    label: "1 Per Level",
    description: "1 cantrip and 1 spell per unlocked level",
    counts: {
      "0": 1,
      "1": 1,
      "2": 1,
      "3": 1,
      "4": 1,
      "5": 1,
      "6": 1,
      "7": 1,
      "8": 1,
      "9": 1,
    },
  },
  two_per_level: {
    label: "2 Per Level",
    description: "2 cantrips and 2 spells per unlocked level",
    counts: {
      "0": 2,
      "1": 2,
      "2": 2,
      "3": 2,
      "4": 2,
      "5": 2,
      "6": 2,
      "7": 2,
      "8": 2,
      "9": 2,
    },
  },
};

export function casterLevelToMaxSpellLevel(casterLevel: number): number {
  const clamped = Math.max(1, Math.min(20, Math.round(casterLevel)));
  return Math.min(9, Math.ceil(clamped / 2));
}

export const DEFAULT_CONFIG: RandomizerConfig = {
  casterLevel: 5,
  maxSpellLevel: casterLevelToMaxSpellLevel(5),
  levelCounts: { ...RULE_PRESETS.standard_121.counts },
  classWeights: createUniformWeights(DND_CLASSES, 1),
  multiClassRule: "lowest",
  includeOptionalClasses: true,
  schoolWeights: createUniformWeights(MAGIC_SCHOOLS, 1),
  excludeWeaponComponents: true,
  excludeCostlyMaterials: false,
  excludeConcentration: false,
  excludeRituals: false,
  excludedSources: [],
  activePreset: "standard_121",
};

export const LOCAL_STORAGE_KEY = "arcane_ledger_grimoire_v1";
export const CUSTOM_CATALOG_KEY = "arcane_ledger_custom_csv_v1";
export const THEME_STORAGE_KEY = "arcane_ledger_theme_v1";
