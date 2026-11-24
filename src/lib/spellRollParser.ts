import { Spell } from "../types/spell";

export type SupportedDieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export interface SpellDieTerm {
  count: number;
  sides: SupportedDieSides;
}

export interface SpellRollAction {
  id: string;
  label: string;
  sublabel?: string;
  kind: "damage" | "healing" | "penalty" | "effect";
  damageType?: string;
  terms: SpellDieTerm[];
  flatBonus: number;
  addsSpellMod: boolean;
  scalesWithCantripTier: boolean;
  upcastPerLevel?: {
    addCount: number;
    sides: SupportedDieSides;
    slotStep: number; // usually 1, sometimes 2 (e.g., "every two slot levels")
  };
  /** For multi-dart spells like Magic Missile where all darts can be rolled together */
  dartScale?: {
    baseDarts: number;
    extraPerLevel: number;
  };
  canCrit: boolean;
}

export interface ParsedSpellRollProfile {
  attackType: "ranged" | "melee" | null;
  saveAbility:
    | "Strength"
    | "Dexterity"
    | "Constitution"
    | "Intelligence"
    | "Wisdom"
    | "Charisma"
    | null;
  halfOnSave: boolean;
  rolls: SpellRollAction[];
  hasAnyRoll: boolean;
  notes?: string;
  source?: "regex" | "ai";
}

/**
 * True only when the player rolls a spell attack or direct dice (damage, healing,
 * bonus/penalty dice, or random tables). Excludes pure save-only and utility spells.
 */
export function hasPlayerRoll(profile: ParsedSpellRollProfile): boolean {
  return Boolean(profile.attackType || profile.rolls.length > 0);
}

/**
 * Returns true when a spell's regex parse looks incomplete or ambiguous
 * (e.g. missed table dice, unlabeled Damage/Effect Roll buttons, or stat tables),
 * so the UI can gently suggest the AI parser.
 */
export function shouldSuggestAiFallback(
  spell: Spell,
  profile: ParsedSpellRollProfile
): boolean {
  if (profile.source === "ai") return false;
  const combinedText = `${spell.text || ""} ${spell.atHigherLevels || ""}`;
  const mentionsDiceOrTable =
    /\b(?:d4|d6|d8|d10|d12|d20|d100|roll a d\d+|dice|die)\b/i.test(
      combinedText
    ) || combinedText.includes("| --- |");

  if (profile.rolls.length === 0 && mentionsDiceOrTable) {
    return true;
  }

  const genericCount = profile.rolls.filter(
    (r) => r.label === "Effect Roll" || r.label === "Damage"
  ).length;
  if (genericCount >= 2) return true;

  if (
    profile.rolls.length > 0 &&
    profile.rolls.some((r) => r.label === "Effect Roll") &&
    combinedText.includes("| --- |")
  ) {
    return true;
  }

  return false;
}

const VALID_SIDES = new Set<number>([4, 6, 8, 10, 12, 20, 100]);

const DAMAGE_TYPES =
  "acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder";

const SAVE_ABILITIES = [
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

function toSupportedSides(n: number): SupportedDieSides | null {
  return VALID_SIDES.has(n) ? (n as SupportedDieSides) : null;
}

export function getCantripTierMultiplier(casterLevel: number): number {
  if (casterLevel >= 17) return 4;
  if (casterLevel >= 11) return 3;
  if (casterLevel >= 5) return 2;
  return 1;
}

function titleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function parseUpcastScaling(
  higherText: string
): {
  addCount: number;
  sides: SupportedDieSides;
  slotStep: number;
} | null {
  if (!higherText) return null;

  const slotStep = /every\s+(?:two|2)\s+(?:spell\s+)?slot\s+levels?/i.test(
    higherText
  )
    ? 2
    : 1;

  // e.g. "increases by 1d6 for each slot level above 3rd" or "by 2d6 for each spell slot level above 6"
  const incMatch = higherText.match(
    /(?:increases?|additional|extra|deals?)\s+(?:by\s+)?(\d+)d(\d+)/i
  );
  if (incMatch) {
    const addCount = parseInt(incMatch[1], 10);
    const sides = toSupportedSides(parseInt(incMatch[2], 10));
    if (addCount > 0 && sides) {
      return { addCount, sides, slotStep };
    }
  }
  return null;
}

function parseDartScaling(
  bodyText: string,
  higherText: string
): { baseDarts: number; extraPerLevel: number } | null {
  const higherDart = higherText.match(
    /creates?\s+(one|two|three|\d+)\s+(?:more|additional)\s+(?:dart|missile)/i
  );
  if (!higherDart) return null;

  const extraToken = higherDart[1].toLowerCase();
  const extraPerLevel =
    WORD_NUMBERS[extraToken] ?? parseInt(extraToken, 10) ?? 1;

  const baseMatch = bodyText.match(
    /create[sd]?\s+(one|two|three|four|five|six|\d+)\s+(?:glowing\s+)?darts?/i
  );
  const baseToken = baseMatch?.[1]?.toLowerCase() ?? "three";
  const baseDarts = WORD_NUMBERS[baseToken] ?? parseInt(baseToken, 10) ?? 3;

  return { baseDarts, extraPerLevel };
}

/**
 * Extract playable dice rolls, attack type, saving throw, and upcast/cantrip scaling
 * from a 5eTools spell entry.
 */
export function parseSpellRolls(spell: Spell): ParsedSpellRollProfile {
  const rawBody = spell.text || "";
  let higherText = spell.atHigherLevels || "";

  // Some 2024 XPHB descriptions embed "Using a Higher-Level Spell Slot." inside text
  const embeddedHigherMatch = rawBody.match(
    /(?:At Higher Levels\.|Using a Higher-Level Spell Slot\.)([\s\S]*)$/i
  );
  let mainText = rawBody;
  if (embeddedHigherMatch) {
    if (!higherText) {
      higherText = embeddedHigherMatch[0];
    }
    mainText = rawBody.slice(0, embeddedHigherMatch.index).trim();
  }

  // Detect cantrip scaling and strip its parenthetical tier list so "(2d10), (3d10)" aren't duplicated
  const cantripScaleRegex =
    /(?:This spell's damage increases|The spell's damage increases|The damage increases|Cantrip Upgrade\.[\s\S]*?)(?:when you reach|at higher levels)[\s\S]*?(?:\.|$)/gi;
  const hasCantripScaling =
    spell.levelIndex === 0 &&
    /(?:5th level|level 5|levels 5)/i.test(mainText) &&
    /\(\d+d\d+\)/i.test(mainText);

  const cleanedText = hasCantripScaling
    ? mainText.replace(cantripScaleRegex, " ")
    : mainText;

  // Detect Spell Attack
  let attackType: "ranged" | "melee" | null = null;
  if (/ranged spell attack/i.test(cleanedText)) {
    attackType = "ranged";
  } else if (/melee spell attack/i.test(cleanedText)) {
    attackType = "melee";
  }

  // Detect Saving Throw
  let saveAbility: ParsedSpellRollProfile["saveAbility"] = null;
  for (const ability of SAVE_ABILITIES) {
    const saveRe = new RegExp(
      `\\b${ability}\\s+saving\\s+throw\\b`,
      "i"
    );
    if (saveRe.test(cleanedText)) {
      saveAbility = ability;
      break;
    }
  }
  const halfOnSave =
    /half as much damage on a successful/i.test(cleanedText) ||
    /half as much damage on a success/i.test(cleanedText);

  const upcast = parseUpcastScaling(higherText);
  const dartScale = parseDartScaling(cleanedText, higherText);

  const rolls: SpellRollAction[] = [];
  const seenKeys = new Set<string>();

  // 1. Primary compound dice expressions:
  //    e.g. "8d6 psychic damage", "2d8 + 1d6 damage", "10d6 + 40 force damage",
  //         "1d4 + your spellcasting ability modifier", "5d8 hit points"
  const exprRegex =
    /(\d+d\d+(?:\s*\+\s*\d+d\d+)*)(?:\s*\+\s*(\d+))?(?:\s*\+\s*your\s+spellcasting\s+ability\s+modifier)?/gi;

  let match: RegExpExecArray | null;
  let rollIdx = 0;

  while ((match = exprRegex.exec(cleanedText)) !== null) {
    const fullMatch = match[0];
    const diceCluster = match[1];
    const flatBonus = match[2] ? parseInt(match[2], 10) : 0;
    const addsSpellMod = /spellcasting\s+ability\s+modifier/i.test(fullMatch);

    const matchStart = match.index;
    const matchEnd = matchStart + fullMatch.length;
    const before = cleanedText.slice(Math.max(0, matchStart - 75), matchStart);
    const after = cleanedText.slice(matchEnd, Math.min(cleanedText.length, matchEnd + 75));

    // Skip dice expressions that describe durations or table indices (e.g. "1d4 hours", "roll a d20")
    if (/^\s*(?:minutes?|hours?|days?|rounds?|feet|miles?)\b/i.test(after)) {
      continue;
    }

    // Parse all XdY terms inside diceCluster
    const terms: SpellDieTerm[] = [];
    const termRe = /(\d+)d(\d+)/gi;
    let tm: RegExpExecArray | null;
    let invalidDie = false;
    while ((tm = termRe.exec(diceCluster)) !== null) {
      const count = parseInt(tm[1], 10);
      const sides = toSupportedSides(parseInt(tm[2], 10));
      if (!sides || count < 1 || count > 24) {
        invalidDie = true;
        break;
      }
      terms.push({ count, sides });
    }
    if (invalidDie || terms.length === 0) continue;

    // Classify roll: damage, healing, penalty, or general effect
    const dmgAfter = after.match(
      new RegExp(`^\\s*(?:(${DAMAGE_TYPES})\\s+)?damage\\b`, "i")
    );
    const isHealing =
      /\bregains?\b|\brestores?\b|\bhealing\b|\btemporary hit points\b/i.test(
        before
      ) || /^\s*(?:temporary\s+)?hit points?\b/i.test(after);
    const isTemporaryHp =
      /temporary hit points/i.test(before) ||
      /^\s*temporary hit points/i.test(after);
    const isPenalty = /\bsubtract/i.test(before) || /\bsubtract/i.test(after);

    let kind: SpellRollAction["kind"] = "effect";
    let damageType: string | undefined;
    let label = "Spell Roll";
    let sublabel: string | undefined;

    if (dmgAfter) {
      kind = "damage";
      damageType = dmgAfter[1] ? titleCase(dmgAfter[1]) : undefined;
      label = damageType ? `${damageType} Damage` : "Damage";
      if (/\bmissing any of its hit points\b/i.test(before)) {
        sublabel = "If target is injured";
      } else if (/\bat the start of each of its turns?\b|\bat start of each\b/i.test(after)) {
        sublabel = "Start of turn";
      } else if (/\binstead\b/i.test(before)) {
        sublabel = "Alternate roll";
      }
    } else if (isHealing) {
      kind = "healing";
      label = isTemporaryHp ? "Temporary HP" : "Healing";
    } else if (isPenalty) {
      kind = "penalty";
      label = "Penalty Roll";
    } else if (/hit points of creatures/i.test(after) || /hp/i.test(after)) {
      kind = "effect";
      label = "HP Pool";
    } else {
      kind = "effect";
      label = "Effect Roll";
    }

    const dedupeKey = `${terms.map((t) => `${t.count}d${t.sides}`).join("+")}+${flatBonus}:${addsSpellMod}:${label}:${sublabel ?? ""}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    // Attach upcast scaling to the first damage/healing roll matching the upcast die sides
    const canUpcastHere =
      Boolean(upcast) &&
      (kind === "damage" || kind === "healing") &&
      (rolls.every((r) => !r.upcastPerLevel) ||
        terms.some((t) => t.sides === upcast!.sides));

    // Special convenience for Magic Missile: offer "All N Darts" + "Per Dart"
    if (dartScale && kind === "damage" && rolls.length === 0) {
      rolls.push({
        id: `roll-${rollIdx++}`,
        label: `All Darts (${damageType ?? "Force"})`,
        sublabel: "Combined damage",
        kind: "damage",
        damageType,
        terms,
        flatBonus,
        addsSpellMod,
        scalesWithCantripTier: false,
        dartScale,
        canCrit: false,
      });
      rolls.push({
        id: `roll-${rollIdx++}`,
        label: `Per Dart (${damageType ?? "Force"})`,
        sublabel: "Single dart",
        kind: "damage",
        damageType,
        terms,
        flatBonus,
        addsSpellMod,
        scalesWithCantripTier: false,
        canCrit: false,
      });
      continue;
    }

    rolls.push({
      id: `roll-${rollIdx++}`,
      label,
      sublabel,
      kind,
      damageType,
      terms,
      flatBonus,
      addsSpellMod,
      scalesWithCantripTier: hasCantripScaling && kind === "damage",
      upcastPerLevel: canUpcastHere && upcast ? upcast : undefined,
      canCrit: Boolean(attackType) && kind === "damage",
    });
  }

  // 2. Bare singular dice mentions like "rolls a d6 and subtracts the number rolled" (Synaptic Static, Bane, Bless, Guidance)
  const bareDieRegex = /\brolls?\s+a\s+d(4|6|8|10|12|20|100)\b/gi;
  let bareMatch: RegExpExecArray | null;
  while ((bareMatch = bareDieRegex.exec(cleanedText)) !== null) {
    const sides = toSupportedSides(parseInt(bareMatch[1], 10));
    if (!sides) continue;
    const after = cleanedText.slice(
      bareMatch.index + bareMatch[0].length,
      Math.min(cleanedText.length, bareMatch.index + bareMatch[0].length + 70)
    );
    const isSubtract = /\bsubtract/i.test(after);
    const isAdd = /\badd/i.test(after);
    const label = isSubtract
      ? "Subtract Penalty"
      : isAdd
      ? "Bonus Die"
      : `Roll d${sides}`;
    const sublabel = isSubtract
      ? "From attack, check, or concentration"
      : isAdd
      ? "Add to attack or save"
      : undefined;

    const dedupeKey = `1d${sides}:bare:${label}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    rolls.push({
      id: `roll-${rollIdx++}`,
      label,
      sublabel,
      kind: isSubtract ? "penalty" : "effect",
      terms: [{ count: 1, sides }],
      flatBonus: 0,
      addsSpellMod: false,
      scalesWithCantripTier: false,
      canCrit: false,
    });
  }

  return {
    attackType,
    saveAbility,
    halfOnSave,
    rolls,
    hasAnyRoll: Boolean(attackType || saveAbility || rolls.length > 0),
    source: "regex",
  };
}

export function buildSpellRollFormula(
  action: SpellRollAction,
  options: {
    baseSpellLevel: number;
    castLevel: number;
    casterLevel: number;
    spellMod: number;
    isCrit: boolean;
  }
): {
  formula: string;
  displayLabel: string;
  totalDiceCount: number;
  dartCount?: number;
} {
  const { baseSpellLevel, castLevel, casterLevel, spellMod, isCrit } = options;
  const levelsAbove = Math.max(0, castLevel - Math.max(1, baseSpellLevel));

  // Clone terms so we don't mutate action
  const terms = action.terms.map((t) => ({ ...t }));
  let flat = action.flatBonus + (action.addsSpellMod ? spellMod : 0);
  let dartCount: number | undefined;

  if (action.dartScale) {
    dartCount =
      action.dartScale.baseDarts + levelsAbove * action.dartScale.extraPerLevel;
    for (const t of terms) {
      t.count = t.count * dartCount;
    }
    flat = flat * dartCount;
  } else if (action.scalesWithCantripTier && baseSpellLevel === 0) {
    const mult = getCantripTierMultiplier(casterLevel);
    for (const t of terms) {
      t.count = t.count * mult;
    }
  } else if (action.upcastPerLevel && levelsAbove > 0) {
    const steps = Math.floor(levelsAbove / action.upcastPerLevel.slotStep);
    const added = steps * action.upcastPerLevel.addCount;
    if (added > 0) {
      const existing = terms.find(
        (t) => t.sides === action.upcastPerLevel!.sides
      );
      if (existing) {
        existing.count += added;
      } else {
        terms.push({ count: added, sides: action.upcastPerLevel.sides });
      }
    }
  }

  const applyCrit = isCrit && action.canCrit;
  if (applyCrit) {
    for (const t of terms) {
      t.count = t.count * 2;
    }
  }

  const totalDiceCount = terms.reduce(
    (sum, t) => sum + t.count * (t.sides === 100 ? 2 : 1),
    0
  );

  const diceStr = terms.map((t) => `${t.count}d${t.sides}`).join(" + ");
  const modStr =
    flat > 0 ? ` + ${flat}` : flat < 0 ? ` - ${Math.abs(flat)}` : "";
  const formula = `${diceStr}${modStr}`;

  const displayLabel = dartCount
    ? /\bdarts?\b/i.test(action.label)
      ? `All ${dartCount} Darts (${action.damageType ?? "Force"})`
      : `${action.label} (×${dartCount})`
    : action.label;

  return {
    formula,
    displayLabel,
    totalDiceCount,
    dartCount,
  };
}
