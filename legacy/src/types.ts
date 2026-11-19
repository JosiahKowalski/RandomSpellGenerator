export interface Spell {
  name: string;
  source: string;
  page: string;
  level: string; // "Cantrip", "1st", etc.
  castingTime: string;
  duration: string;
  school: string;
  range: string;
  components: string;
  classes: string;
  optionalVariantClasses: string;
  subclasses: string;
  text: string;
  atHigherLevels: string;
  isPermanent?: boolean;
}

export interface CharacterStats {
  name: string;
  class: string;
  level: number | "";
  background: string;
  playerName: string;
  race: string;
  alignment: string;
  xp: string;
  
  charisma: number | "";
  strength: number | "";
  dexterity: number | "";
  constitution: number | "";
  intelligence: number | "";
  wisdom: number | "";

  proficiencies: string[]; // List of skill/save keys the character is proficient in
  inspiration: boolean;
  
  hpMax: number | "";
  hpCurrent: number | "";
  hpTemp: number | "";
  hitDiceMax: string;
  hitDiceCurrent: number | "";
  
  armorClass: number | "";
  mageArmor?: boolean;
  initiative: number | "";
  speed: string;
  passivePerception?: number | "";

  deathSaves: {
    successes: number;
    failures: number;
  };

  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  features: string;
  backstory: string;

  attacks: {
    name: string;
    bonus: string;
    damage: string;
  }[];
  equipment: string;
  currency: {
    cp: number | "";
    sp: number | "";
    ep: number | "";
    gp: number | "";
    pp: number | "";
  };
  otherProficiencies: string;

  proficiencyBonus: number | "";
  spellSaveDC: number | "";
  spellAttackBonus: number | "";
  sorceryPointsMax: number | "";
  sorceryPointsCurrent: number | "";
  tidesOfChaosUsed: boolean;
  slotsMax: Record<string, number>;
  slotsCurrent: Record<string, number>;
}

export interface GeneratorSettings {
  classes: string[];
  schools: string[];
  excludeClasses: boolean;
  excludeSchools: boolean;
  excludeWeaponComponents: boolean;
  dailyCantrips: number | "";
  dailyLeveledSpells: number | ""; // base per unlocked level
}

export interface WildMagicEffect {
  roll: string;
  effect: string;
}
