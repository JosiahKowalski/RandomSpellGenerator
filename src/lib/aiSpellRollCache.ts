import { Spell } from "../types/spell";
import {
  hasPlayerRoll,
  ParsedSpellRollProfile,
  parseSpellRolls,
} from "./spellRollParser";

const AI_ROLL_CACHE_KEY = "arcane_ledger_ai_spell_rolls_v1";
const MAX_CACHED_SPELLS = 120;

interface CachedEntry {
  profile: ParsedSpellRollProfile;
  savedAt: number;
}

type CacheMap = Record<string, CachedEntry>;

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function getSpellRollFingerprint(spell: Spell): string {
  const payload = `${spell.text || ""}|${spell.atHigherLevels || ""}`;
  return `${spell.name.trim().toLowerCase()}|${spell.levelIndex}|${simpleHash(
    payload
  )}`;
}

function readCache(): CacheMap {
  try {
    const raw = localStorage.getItem(AI_ROLL_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CacheMap;
  } catch {
    return {};
  }
}

function writeCache(map: CacheMap): void {
  try {
    const entries = Object.entries(map);
    if (entries.length > MAX_CACHED_SPELLS) {
      entries.sort((a, b) => (b[1]?.savedAt ?? 0) - (a[1]?.savedAt ?? 0));
      const trimmed: CacheMap = {};
      for (const [k, v] of entries.slice(0, MAX_CACHED_SPELLS)) {
        trimmed[k] = v;
      }
      localStorage.setItem(AI_ROLL_CACHE_KEY, JSON.stringify(trimmed));
      return;
    }
    localStorage.setItem(AI_ROLL_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export function getCachedAiSpellProfile(
  spell: Spell
): ParsedSpellRollProfile | null {
  const key = getSpellRollFingerprint(spell);
  const map = readCache();
  const entry = map[key];
  if (!entry || !entry.profile) return null;
  return { ...entry.profile, source: "ai" };
}

export function saveCachedAiSpellProfile(
  spell: Spell,
  profile: ParsedSpellRollProfile
): void {
  const key = getSpellRollFingerprint(spell);
  const map = readCache();
  map[key] = {
    profile: { ...profile, source: "ai" },
    savedAt: Date.now(),
  };
  writeCache(map);
}

export function clearCachedAiSpellProfile(spell: Spell): void {
  const key = getSpellRollFingerprint(spell);
  const map = readCache();
  if (key in map) {
    delete map[key];
    writeCache(map);
  }
}

export function isPlayerRollableSpell(
  spell: Spell,
  aiEnabled: boolean
): boolean {
  const profile =
    (aiEnabled ? getCachedAiSpellProfile(spell) : null) ??
    parseSpellRolls(spell);
  return hasPlayerRoll(profile);
}

export async function analyzeSpellRollsWithAi(
  spell: Spell,
  signal?: AbortSignal,
  options?: { forceRefresh?: boolean }
): Promise<ParsedSpellRollProfile> {
  const res = await fetch("/api/ai/parse-spell-rolls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      name: spell.name,
      levelIndex: spell.levelIndex,
      school: spell.schoolBase || spell.school,
      text: spell.text,
      atHigherLevels: spell.atHigherLevels,
      forceRefresh: Boolean(options?.forceRefresh),
    }),
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "The AI service was temporarily busy or warming up. Please try again."
    );
  }

  const data = (await res.json().catch(() => null)) as
    | { profile?: ParsedSpellRollProfile; error?: string }
    | null;

  if (!res.ok || !data?.profile) {
    throw new Error(
      data?.error ||
        `AI roll analysis failed (HTTP ${res.status}). Please try again.`
    );
  }

  const profile: ParsedSpellRollProfile = {
    ...data.profile,
    source: "ai",
  };
  saveCachedAiSpellProfile(spell, profile);
  return profile;
}
