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

export type FilterMode = "include" | "exclude";

export type RulePresetId =
  | "standard_121"
  | "one_per_level"
  | "two_per_level"
  | "custom";

export interface RandomizerConfig {
  casterLevel: number;
  maxSpellLevel: number;
  levelCounts: Record<string, number>;
  classes: string[];
  classMode: FilterMode;
  includeOptionalClasses: boolean;
  schools: string[];
  schoolMode: FilterMode;
  excludeWeaponComponents: boolean;
  excludeCostlyMaterials: boolean;
  excludeConcentration: boolean;
  excludeRituals: boolean;
  excludedSources: string[];
  activePreset: RulePresetId;
}

export interface GrimoireSnapshot {
  knownSpellNames: string[];
  rolledSpellNames: string[];
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

export type AppView = "spellbook" | "rules" | "pool";
export type SpellFilterTab = "all" | "rolled" | "known";
export type ThemeMode = "light" | "dark";
