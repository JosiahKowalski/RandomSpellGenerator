export interface Spell {
  id: string;
  name: string;
  source: string;
  page: string;
  level: string;
  levelIndex: number; // 0 = Cantrip, 1..9 = 1st..9th
  castingTime: string;
  duration: string;
  school: string;
  schoolBase: string;
  range: string;
  components: string;
  classes: string;
  optionalVariantClasses: string;
  subclasses: string;
  text: string;
  atHigherLevels: string;
  isRitual: boolean;
  isConcentration: boolean;
  hasWeaponComponent: boolean;
  hasCostlyMaterial: boolean;
}

export interface DiceCastHandoff {
  spell: Spell;
  castLevel: number | null;
  alreadyCast: boolean;
}

export interface StoredRingSpell {
  id: string;
  spellName: string;
  castLevel: number; // 1..5
  casterName: string;
  saveDC: string;
  attackBonus: string;
  notes: string;
}

export type MultiClassRule = "lowest" | "average" | "highest";

export type RulePresetId =
  | "standard_121"
  | "one_per_level"
  | "two_per_level"
  | "custom";

export interface RandomizerConfig {
  casterLevel: number;
  maxSpellLevel: number;
  canRitualCast: boolean;
  levelCounts: Record<string, number>;
  classWeights: Record<string, number>;
  multiClassRule: MultiClassRule;
  includeOptionalClasses: boolean;
  schoolWeights: Record<string, number>;
  excludeWeaponComponents: boolean;
  excludeCostlyMaterials: boolean;
  excludeConcentration: boolean;
  excludeRituals: boolean;
  excludedSources: string[];
  activePreset: RulePresetId;
}

export interface SpellSlotState {
  useCustomMax: boolean;
  max: Record<string, number>; // "1".."9"
  used: Record<string, number>; // "1".."9"
  bonus: Record<string, number>; // "1".."9" temporary slots from Flexible Casting
}

export interface SorceryState {
  useCustomMax: boolean;
  maxPoints: number; // 0..30
  usedPoints: number; // 0..30
  knownMetamagics: string[]; // IDs of pinned metamagic options
}

export interface MetamagicOption {
  id: string;
  name: string;
  source: "PHB" | "TCE";
  costLabel: string;
  fixedCost: number | null; // null for variable cost (Twinned Spell)
  combinable: boolean;
  summary: string;
  rules: string;
}

export interface RollHistoryEntry {
  id: string;
  rolledSpellNames: string[];
  rolledAt: string;
}

export interface GrimoireSnapshot {
  knownSpellNames: string[];
  rolledSpellNames: string[];
  ringSpells: StoredRingSpell[];
  spellSlots: SpellSlotState;
  sorcery: SorceryState;
  concentrationSpell: string | null;
  rollHistory: RollHistoryEntry[];
  config: RandomizerConfig;
  updatedAt: string;
}

export interface LevelShortfall {
  levelIndex: number;
  requested: number;
  available: number;
}

export interface RollResult {
  rolledNames: string[];
  shortfalls: LevelShortfall[];
}

export type AppView =
  | "spellbook"
  | "metamagic"
  | "dice"
  | "ring"
  | "rules"
  | "pool";
export type SpellFilterTab = "all" | "rolled" | "known";
export type ThemeMode = "light" | "dark";
