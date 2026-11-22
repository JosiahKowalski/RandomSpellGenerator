import {
  MetamagicOption,
  RandomizerConfig,
  RulePresetId,
  SorceryState,
  SpellSlotState,
} from "../types/spell";

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

// Official D&D 5e full-caster spell slots per caster level (1..20), indexed 1st..9th
export const FULL_CASTER_SPELL_SLOTS: Record<number, number[]> = {
  1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

export function createZeroSlotMap(): Record<string, number> {
  return {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
    "6": 0,
    "7": 0,
    "8": 0,
    "9": 0,
  };
}

export function getDefaultSpellSlots(
  casterLevel: number
): Record<string, number> {
  const clamped = Math.max(1, Math.min(20, Math.round(casterLevel)));
  const row = FULL_CASTER_SPELL_SLOTS[clamped] || FULL_CASTER_SPELL_SLOTS[1];
  const map: Record<string, number> = {};
  for (let lvl = 1; lvl <= 9; lvl++) {
    map[String(lvl)] = row[lvl - 1] ?? 0;
  }
  return map;
}

export const DEFAULT_SPELL_SLOTS: SpellSlotState = {
  useCustomMax: false,
  max: getDefaultSpellSlots(5),
  used: createZeroSlotMap(),
  bonus: createZeroSlotMap(),
};

export function getDefaultSorceryPoints(casterLevel: number): number {
  const clamped = Math.max(1, Math.min(20, Math.round(casterLevel)));
  return clamped >= 2 ? clamped : 0;
}

export const DEFAULT_SORCERY: SorceryState = {
  useCustomMax: false,
  maxPoints: getDefaultSorceryPoints(5),
  usedPoints: 0,
  knownMetamagics: [],
};

// Official D&D 5e PHB Flexible Casting: Sorcery Points needed to create a spell slot (1st–5th)
export const FLEXIBLE_CASTING_SLOT_COSTS: Array<{
  level: number;
  label: string;
  cost: number;
}> = [
  { level: 1, label: "1st-Level Slot", cost: 2 },
  { level: 2, label: "2nd-Level Slot", cost: 3 },
  { level: 3, label: "3rd-Level Slot", cost: 5 },
  { level: 4, label: "4th-Level Slot", cost: 6 },
  { level: 5, label: "5th-Level Slot", cost: 7 },
];

// All official D&D 5e Metamagic options (PHB + Tasha's Cauldron of Everything)
export const METAMAGIC_OPTIONS: MetamagicOption[] = [
  {
    id: "careful",
    name: "Careful Spell",
    source: "PHB",
    costLabel: "1 SP",
    fixedCost: 1,
    combinable: false,
    summary: "Allies automatically succeed on the spell's saving throw.",
    rules:
      "When you cast a spell that forces other creatures to make a saving throw, spend 1 sorcery point and choose a number of those creatures up to your Charisma modifier (minimum of 1). A chosen creature automatically succeeds on its saving throw against the spell.",
  },
  {
    id: "distant",
    name: "Distant Spell",
    source: "PHB",
    costLabel: "1 SP",
    fixedCost: 1,
    combinable: false,
    summary: "Double the spell's range, or turn Touch into 30 feet.",
    rules:
      "When you cast a spell that has a range of 5 feet or greater, spend 1 sorcery point to double the range of the spell. When you cast a spell that has a range of touch, spend 1 sorcery point to make the range of the spell 30 feet.",
  },
  {
    id: "empowered",
    name: "Empowered Spell",
    source: "PHB",
    costLabel: "1 SP",
    fixedCost: 1,
    combinable: true,
    summary: "Reroll up to your Cha modifier in damage dice.",
    rules:
      "When you roll damage for a spell, spend 1 sorcery point to reroll a number of the damage dice up to your Charisma modifier (minimum of 1). You must use the new rolls. You can use Empowered Spell even if you have already used a different Metamagic option during the casting of the spell.",
  },
  {
    id: "extended",
    name: "Extended Spell",
    source: "PHB",
    costLabel: "1 SP",
    fixedCost: 1,
    combinable: false,
    summary: "Double a spell's duration (1 minute or longer, max 24 hours).",
    rules:
      "When you cast a spell that has a duration of 1 minute or longer, spend 1 sorcery point to double its duration, to a maximum duration of 24 hours.",
  },
  {
    id: "heightened",
    name: "Heightened Spell",
    source: "PHB",
    costLabel: "3 SP",
    fixedCost: 3,
    combinable: false,
    summary: "Give one target disadvantage on its first saving throw.",
    rules:
      "When you cast a spell that forces a creature to make a saving throw to resist its effects, spend 3 sorcery points to give one target of the spell disadvantage on its first saving throw made against the spell.",
  },
  {
    id: "quickened",
    name: "Quickened Spell",
    source: "PHB",
    costLabel: "2 SP",
    fixedCost: 2,
    combinable: false,
    summary: "Cast a 1-action spell as a bonus action.",
    rules:
      "When you cast a spell that has a casting time of 1 action, spend 2 sorcery points to change the casting time to 1 bonus action for this casting.",
  },
  {
    id: "seeking",
    name: "Seeking Spell",
    source: "TCE",
    costLabel: "2 SP",
    fixedCost: 2,
    combinable: true,
    summary: "Reroll a missed spell attack roll.",
    rules:
      "If you make an attack roll for a spell and miss, spend 2 sorcery points to reroll the d20, and you must use the new roll. You can use Seeking Spell even if you have already used a different Metamagic option during the casting of the spell.",
  },
  {
    id: "subtle",
    name: "Subtle Spell",
    source: "PHB",
    costLabel: "1 SP",
    fixedCost: 1,
    combinable: false,
    summary: "Cast without verbal or somatic components.",
    rules:
      "When you cast a spell, spend 1 sorcery point to cast it without any somatic or verbal components.",
  },
  {
    id: "transmuted",
    name: "Transmuted Spell",
    source: "TCE",
    costLabel: "1 SP",
    fixedCost: 1,
    combinable: false,
    summary: "Swap acid, cold, fire, lightning, poison, or thunder damage.",
    rules:
      "When you cast a spell that deals a type of damage from the following list, spend 1 sorcery point to change that damage type to one of the other listed types: acid, cold, fire, lightning, poison, thunder.",
  },
  {
    id: "twinned",
    name: "Twinned Spell",
    source: "PHB",
    costLabel: "Spell Lv. SP (min 1)",
    fixedCost: null,
    combinable: false,
    summary: "Target a second creature with a single-target spell.",
    rules:
      "When you cast a spell that targets only one creature and doesn't have a range of self, spend a number of sorcery points equal to the spell's level (1 sorcery point if the spell is a cantrip) to target a second creature in range with the same spell.",
  },
];

export const DEFAULT_CONFIG: RandomizerConfig = {
  casterLevel: 5,
  maxSpellLevel: casterLevelToMaxSpellLevel(5),
  canRitualCast: false,
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
