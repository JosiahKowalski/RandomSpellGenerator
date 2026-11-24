import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import {
  parseSpellRolls,
  type ParsedSpellRollProfile,
  type SpellDieTerm,
  type SpellRollAction,
  type SupportedDieSides,
} from "../src/lib/spellRollParser";
import type { Spell } from "../src/types/spell";

const VALID_SIDES = new Set<number>([4, 6, 8, 10, 12, 20, 100]);
const VALID_ABILITIES = new Set<string>([
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
]);
const VALID_KINDS = new Set<string>(["damage", "healing", "penalty", "effect"]);

export interface ParseSpellRollsInput {
  name: string;
  levelIndex: number;
  school?: string;
  text: string;
  atHigherLevels?: string;
}

const SYSTEM_INSTRUCTION = `You convert a tabletop RPG spell's description into structured clickable dice-tray actions.

Follow these general principles:
1. Table-accurate discrete rolls: Each roll action must represent a single discrete roll a player actually makes when resolving one trigger, attack, saving throw, healing effect, or random table lookup. Never multiply dice across separate turns, charges, targets, or triggers that resolve one at a time.
2. Playable dice only: Include only dice rolled during play (attacks, damage, healing, temp HP, bonus/penalty dice, HP pools, or random effect tables). Exclude pure narrative duration or travel-time dice unless rolled tactically during an encounter.
3. Supported polyhedra ONLY: 4, 6, 8, 10, 12, 20, 100. Count per term must be 1 to 24.
4. Clear labels: Give every roll a concise, human-friendly label (2-4 words) and an optional short sublabel stating its trigger or context. If a spell offers multiple distinct options or table entries (e.g., different creature sizes or modes), create clearly labeled roll entries (max 8 rolls total) and include fixed attack bonuses in sublabel if applicable.
5. Upcast scaling: Attach upcastAddCount/upcastSides ONLY to a specific roll whose dice count directly increases per higher slot. If higher slots instead add extra targets, charges, ammunition, or duration without changing the dice per trigger, leave upcastAddCount at 0 and mention that scaling briefly in "notes".
6. Cantrip scaling: If a cantrip (levelIndex 0) scales at higher character tiers, output ONLY the base tier dice with scalesWithCantripTier: true. Do not duplicate higher tiers as separate buttons.
7. Critical hits: Set canCrit: true ONLY on damage rolls resolved via an attack roll. Never set canCrit: true on saving throw damage, automatic hits, healing, or random table rolls.
8. Simultaneous combined multi-hit rolls: Set dartBaseCount and dartExtraPerLevel ONLY when a single casting resolves multiple identical hits simultaneously in one combined damage roll; whenever you include a combined simultaneous-hit roll, also include a separate single-hit roll (with dartBaseCount: 0). For pools of charges, ammunition, or separate sequential attacks, keep dartBaseCount and dartExtraPerLevel at 0.
9. Baseline reference: You will also see an automated regex parse of the spell. Treat it as a starting hint — preserve anything it already captured accurately, and focus on improving labels, fixing misapplied scaling, or adding rolls it missed.
10. Concise notes: Keep "notes" <= 140 characters for key mechanical details not captured by buttons (e.g., extra charges/targets on upcast, repeat-turn triggers, or special riders). Use an empty string if unnecessary.
11. Utility spells: If the spell genuinely requires no dice rolls, attacks, saving throws, or random tables, return rolls: [], attackType: "none", saveAbility: "none", and a brief note.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    attackType: {
      type: Type.STRING,
      enum: ["ranged", "melee", "none"],
      description:
        "Whether the caster makes a ranged or melee spell attack roll, or none.",
    },
    saveAbility: {
      type: Type.STRING,
      enum: [
        "Strength",
        "Dexterity",
        "Constitution",
        "Intelligence",
        "Wisdom",
        "Charisma",
        "none",
      ],
      description: "Primary saving throw ability forced by the spell, or none.",
    },
    halfOnSave: {
      type: Type.BOOLEAN,
      description:
        "True if targets take half damage on a successful saving throw.",
    },
    notes: {
      type: Type.STRING,
      description:
        "Optional brief 1-sentence reminder of special dice mechanics (<= 140 chars), or empty string.",
    },
    rolls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: {
            type: Type.STRING,
            description: "Concise button label (e.g. 'Cold Explosion', 'Tiny Object Slam').",
          },
          sublabel: {
            type: Type.STRING,
            description:
              "Short trigger or context (e.g. '5-ft radius · DEX save', '+8 to hit'), or empty string.",
          },
          kind: {
            type: Type.STRING,
            enum: ["damage", "healing", "penalty", "effect"],
          },
          damageType: {
            type: Type.STRING,
            description: "Damage type like 'Fire' or 'Psychic', or empty string.",
          },
          terms: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                count: { type: Type.INTEGER },
                sides: { type: Type.INTEGER },
              },
              required: ["count", "sides"],
            },
          },
          flatBonus: {
            type: Type.INTEGER,
            description: "Static integer modifier added to this roll (0 if none).",
          },
          addsSpellMod: {
            type: Type.BOOLEAN,
            description:
              "True if the caster's spellcasting ability modifier is added to this roll.",
          },
          scalesWithCantripTier: {
            type: Type.BOOLEAN,
            description:
              "True if this cantrip damage scales at caster levels 5, 11, and 17.",
          },
          canCrit: {
            type: Type.BOOLEAN,
            description:
              "True if damage dice double on a critical hit (attack roll damage only).",
          },
          upcastAddCount: {
            type: Type.INTEGER,
            description:
              "Extra dice added per upcast step for THIS specific roll, or 0 if it does not upcast.",
          },
          upcastSides: {
            type: Type.INTEGER,
            description:
              "Die sides for upcast dice (4,6,8,10,12,20,100), or 0 if it does not upcast.",
          },
          upcastSlotStep: {
            type: Type.INTEGER,
            description: "Slot levels required per upcast step (1 normally, 2 for every two levels).",
          },
          dartBaseCount: {
            type: Type.INTEGER,
            description:
              "Only if multiple identical hits resolve simultaneously in one combined roll; when > 0, provide PER-HIT dice in terms/flatBonus (the app multiplies automatically) and leave upcastAddCount at 0. Otherwise 0.",
          },
          dartExtraPerLevel: {
            type: Type.INTEGER,
            description:
              "Extra simultaneous hits per slot level above base (only when dartBaseCount > 0); otherwise 0.",
          },
        },
        required: [
          "label",
          "sublabel",
          "kind",
          "damageType",
          "terms",
          "flatBonus",
          "addsSpellMod",
          "scalesWithCantripTier",
          "canCrit",
          "upcastAddCount",
          "upcastSides",
          "upcastSlotStep",
          "dartBaseCount",
          "dartExtraPerLevel",
        ],
      },
    },
  },
  required: ["attackType", "saveAbility", "halfOnSave", "notes", "rolls"],
};

let cachedClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error(
      "Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets."
    ) as Error & { statusCode?: number };
    err.statusCode = 503;
    throw err;
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return cachedClient;
}

function clampInt(val: unknown, min: number, max: number, fallback = 0): number {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeAiProfile(
  raw: Record<string, unknown>,
  levelIndex: number
): ParsedSpellRollProfile {
  const attackRaw = String(raw.attackType ?? "none").toLowerCase();
  const attackType: "ranged" | "melee" | null =
    attackRaw === "ranged" || attackRaw === "melee" ? attackRaw : null;

  const saveRaw = String(raw.saveAbility ?? "none");
  const saveAbility = VALID_ABILITIES.has(saveRaw)
    ? (saveRaw as ParsedSpellRollProfile["saveAbility"])
    : null;

  const halfOnSave = Boolean(raw.halfOnSave);
  const notesRaw = typeof raw.notes === "string" ? raw.notes.trim() : "";
  const notes = notesRaw ? notesRaw.slice(0, 180) : undefined;

  const rawRolls = Array.isArray(raw.rolls) ? raw.rolls : [];
  const rolls: SpellRollAction[] = [];

  for (let i = 0; i < rawRolls.length && rolls.length < 8; i++) {
    const item = rawRolls[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;

    const rawTerms = Array.isArray(rec.terms) ? rec.terms : [];
    const terms: SpellDieTerm[] = [];
    for (const t of rawTerms) {
      if (!t || typeof t !== "object") continue;
      const tRec = t as Record<string, unknown>;
      const count = clampInt(tRec.count, 1, 24, 0);
      const sides = Math.round(Number(tRec.sides));
      if (count >= 1 && VALID_SIDES.has(sides)) {
        terms.push({ count, sides: sides as SupportedDieSides });
      }
    }
    if (terms.length === 0) continue;

    const kindRaw = String(rec.kind ?? "effect").toLowerCase();
    const kind = (
      VALID_KINDS.has(kindRaw) ? kindRaw : "effect"
    ) as SpellRollAction["kind"];

    const label =
      typeof rec.label === "string" && rec.label.trim()
        ? rec.label.trim().slice(0, 48)
        : "Spell Roll";
    const sublabel =
      typeof rec.sublabel === "string" && rec.sublabel.trim()
        ? rec.sublabel.trim().slice(0, 72)
        : undefined;
    const damageType =
      typeof rec.damageType === "string" && rec.damageType.trim()
        ? rec.damageType.trim().slice(0, 24)
        : undefined;

    const flatBonus = clampInt(rec.flatBonus, -50, 200, 0);
    const addsSpellMod = Boolean(rec.addsSpellMod);
    const scalesWithCantripTier =
      levelIndex === 0 && Boolean(rec.scalesWithCantripTier);
    const canCrit = kind === "damage" && Boolean(rec.canCrit);

    const upcastAddCount = clampInt(rec.upcastAddCount, 0, 12, 0);
    const upcastSidesRaw = Math.round(Number(rec.upcastSides));
    const upcastSlotStep = clampInt(rec.upcastSlotStep, 1, 3, 1);
    const upcastPerLevel =
      levelIndex > 0 && upcastAddCount > 0 && VALID_SIDES.has(upcastSidesRaw)
        ? {
            addCount: upcastAddCount,
            sides: upcastSidesRaw as SupportedDieSides,
            slotStep: upcastSlotStep,
          }
        : undefined;

    const dartBaseCount = clampInt(rec.dartBaseCount, 0, 12, 0);
    const dartExtraPerLevel = clampInt(rec.dartExtraPerLevel, 0, 6, 0);
    const dartScale =
      levelIndex > 0 && dartBaseCount > 0 && dartExtraPerLevel > 0
        ? { baseDarts: dartBaseCount, extraPerLevel: dartExtraPerLevel }
        : undefined;

    rolls.push({
      id: `ai-roll-${i}`,
      label,
      sublabel,
      kind,
      damageType,
      terms,
      flatBonus,
      addsSpellMod,
      scalesWithCantripTier,
      upcastPerLevel: dartScale ? undefined : upcastPerLevel,
      dartScale,
      canCrit,
    });
  }

  return {
    attackType,
    saveAbility,
    halfOnSave,
    rolls,
    hasAnyRoll: Boolean(attackType || saveAbility || rolls.length > 0),
    notes,
    source: "ai",
  };
}

interface ParsedApiError {
  status: number;
  message: string;
  retryable: boolean;
}

function extractGeminiError(err: unknown): ParsedApiError {
  const errObj = err as Error & { status?: number; statusCode?: number };
  let status = errObj?.statusCode || errObj?.status || 500;
  let message = errObj?.message || "Failed to analyze spell rolls with AI.";

  // @google/genai often wraps upstream JSON errors inside err.message
  const trimmed = message.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed?.error) {
        if (typeof parsed.error.code === "number") {
          status = parsed.error.code;
        }
        if (typeof parsed.error.message === "string" && parsed.error.message) {
          message = parsed.error.message;
        }
      }
    } catch {
      // keep original message
    }
  }

  const lower = message.toLowerCase();
  if (
    status === 403 ||
    lower.includes("api_key_invalid") ||
    lower.includes("permission_denied")
  ) {
    return {
      status: 403,
      message:
        "Gemini API key could not be verified. Please check your API key in Settings > Secrets.",
      retryable: false,
    };
  }

  if (status === 429 || lower.includes("resource_exhausted")) {
    return {
      status: 429,
      message:
        "AI rate limit reached. Please wait a moment and try again, or check your API key tier in Settings > Secrets.",
      retryable: true,
    };
  }

  if (
    status === 503 ||
    status === 502 ||
    status === 504 ||
    lower.includes("high demand") ||
    lower.includes("unavailable") ||
    lower.includes("overloaded")
  ) {
    return {
      status: 503,
      message:
        "The AI model is temporarily experiencing high demand. Please try again in a few seconds.",
      retryable: true,
    };
  }

  return {
    status,
    message,
    retryable: status >= 500 || status === 408 || status === 404,
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function backoffDelayMs(attemptIndex: number): number {
  const base = [700, 1400, 2000][attemptIndex] ?? 2000;
  const jitter = Math.floor(Math.random() * 350);
  return base + jitter;
}

const MODEL_ATTEMPTS: Array<{
  model: string;
  thinkingLevel: ThinkingLevel;
}> = [
  { model: "gemini-3.5-flash-lite", thinkingLevel: ThinkingLevel.LOW },
  { model: "gemini-3.5-flash-lite", thinkingLevel: ThinkingLevel.LOW },
  { model: "gemini-4-hydrogen", thinkingLevel: ThinkingLevel.LOW },
  { model: "gemini-3.1-flash-lite", thinkingLevel: ThinkingLevel.LOW },
];

const SERVER_CACHE_MAX = 250;
const parsedProfileCache = new Map<string, ParsedSpellRollProfile>();
const inflightParses = new Map<string, Promise<ParsedSpellRollProfile>>();

function makeCacheKey(input: ParseSpellRollsInput): string {
  return `${input.name.trim().toLowerCase()}|${input.levelIndex}|${input.text.length}|${(input.atHigherLevels || "").length}|${input.text.slice(0, 80)}`;
}

function saveServerCache(key: string, profile: ParsedSpellRollProfile): void {
  if (parsedProfileCache.size >= SERVER_CACHE_MAX) {
    const oldestKey = parsedProfileCache.keys().next().value;
    if (oldestKey !== undefined) {
      parsedProfileCache.delete(oldestKey);
    }
  }
  parsedProfileCache.set(key, profile);
}

function summarizeRegexBaseline(input: ParseSpellRollsInput): string {
  const syntheticSpell: Spell = {
    id: "baseline",
    name: input.name,
    source: "",
    page: "",
    level: input.levelIndex === 0 ? "Cantrip" : String(input.levelIndex),
    levelIndex: input.levelIndex,
    castingTime: "",
    duration: "",
    school: input.school || "",
    schoolBase: input.school || "",
    range: "",
    components: "",
    classes: "",
    optionalVariantClasses: "",
    subclasses: "",
    text: input.text,
    atHigherLevels: input.atHigherLevels || "",
    isConcentration: false,
    isRitual: false,
    hasWeaponComponent: false,
    hasCostlyMaterial: false,
  };

  const baseline = parseSpellRolls(syntheticSpell);
  const compact = {
    attackType: baseline.attackType ?? "none",
    saveAbility: baseline.saveAbility ?? "none",
    halfOnSave: baseline.halfOnSave,
    rolls: baseline.rolls.map((r) => ({
      label: r.label,
      sublabel: r.sublabel || "",
      kind: r.kind,
      damageType: r.damageType || "",
      dice: r.terms.map((t) => `${t.count}d${t.sides}`).join("+"),
      flatBonus: r.flatBonus,
      addsSpellMod: r.addsSpellMod,
      scalesWithCantripTier: r.scalesWithCantripTier,
      canCrit: r.canCrit,
      upcastPerLevel: r.upcastPerLevel ?? null,
      dartScale: r.dartScale ?? null,
    })),
  };

  return JSON.stringify(compact);
}

async function runGeminiSpellParse(
  input: ParseSpellRollsInput,
  signal?: AbortSignal
): Promise<ParsedSpellRollProfile> {
  const ai = getGeminiClient();

  const levelLabel =
    input.levelIndex === 0 ? "Cantrip (levelIndex 0)" : `Level ${input.levelIndex}`;
  const baselineJson = summarizeRegexBaseline(input);

  const prompt = [
    `Spell Name: ${input.name}`,
    `Spell Level: ${levelLabel}`,
    input.school ? `School: ${input.school}` : null,
    "",
    "Description:",
    input.text,
    input.atHigherLevels
      ? `\nAt Higher Levels:\n${input.atHigherLevels}`
      : null,
    "",
    "Automated Regex Baseline (verify against the spell text above; keep accurate fields and fix gaps, labels, or scaling):",
    baselineJson,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  let lastError: ParsedApiError | null = null;
  let rawText = "";

  for (let attempt = 0; attempt < MODEL_ATTEMPTS.length; attempt++) {
    if (signal?.aborted) {
      const abortErr = new Error("Request cancelled.") as Error & {
        statusCode?: number;
      };
      abortErr.statusCode = 499;
      throw abortErr;
    }

    const { model, thinkingLevel } = MODEL_ATTEMPTS[attempt];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel },
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      rawText = (response.text ?? "").trim();
      if (rawText) {
        lastError = null;
        break;
      }

      lastError = {
        status: 500,
        message: "Model returned an empty response while analyzing this spell.",
        retryable: true,
      };
    } catch (err) {
      const parsed = extractGeminiError(err);
      lastError = parsed;
      if (!parsed.retryable) {
        break;
      }
      if (attempt < MODEL_ATTEMPTS.length - 1) {
        await sleep(backoffDelayMs(attempt), signal);
      }
    }
  }

  if (lastError || !rawText) {
    const err = new Error(
      lastError?.message ||
        "Could not analyze spell rolls right now. Please try again."
    ) as Error & { statusCode?: number };
    err.statusCode = lastError?.status || 500;
    throw err;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new Error("Could not parse structured roll data returned by AI.");
  }

  if (!parsedJson || typeof parsedJson !== "object") {
    throw new Error("Unexpected response shape from AI roll parser.");
  }

  return sanitizeAiProfile(
    parsedJson as Record<string, unknown>,
    input.levelIndex
  );
}

export async function parseSpellRollsWithGemini(
  input: ParseSpellRollsInput,
  options?: { forceRefresh?: boolean; signal?: AbortSignal }
): Promise<ParsedSpellRollProfile> {
  const cacheKey = makeCacheKey(input);

  if (!options?.forceRefresh) {
    const cached = parsedProfileCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const existing = inflightParses.get(cacheKey);
    if (existing) {
      return existing;
    }
  }

  const job = runGeminiSpellParse(input, options?.signal)
    .then((profile) => {
      saveServerCache(cacheKey, profile);
      return profile;
    })
    .finally(() => {
      if (inflightParses.get(cacheKey) === job) {
        inflightParses.delete(cacheKey);
      }
    });

  inflightParses.set(cacheKey, job);
  return job;
}
