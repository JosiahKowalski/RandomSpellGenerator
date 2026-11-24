import { Spell } from "../types/spell";
import { SPELL_LEVELS } from "./constants";

export interface AssistantChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
}

export interface ReferencedSpellPayload {
  name: string;
  level: string;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  text: string;
  atHigherLevels?: string;
}

export interface AssistantContextPayload {
  casterLevel: number;
  canRitualCast: boolean;
  activeView?: string;
  concentrationSpell?: string | null;
  slotsSummary?: string;
  sorcerySummary?: string;
  knownMetamagics?: string[];
  knownSpells?: string[];
  rolledSpells?: string[];
  ringSpells?: string[];
  openSpellName?: string | null;
  referencedSpells?: ReferencedSpellPayload[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toReferencedPayload(spell: Spell): ReferencedSpellPayload {
  return {
    name: spell.name,
    level: SPELL_LEVELS[spell.levelIndex]?.shortLabel || spell.level,
    school: spell.school,
    castingTime: spell.castingTime,
    range: spell.range,
    components: spell.components,
    duration: spell.duration,
    text: spell.text,
    atHigherLevels: spell.atHigherLevels || undefined,
  };
}

/**
 * Finds spells from the loaded catalog referenced in recent conversation text
 * (plus any currently open spell) so the server receives verbatim rules text.
 */
export function findReferencedSpells(
  recentText: string,
  catalog: Spell[],
  openSpell: Spell | null,
  maxMatches = 4
): ReferencedSpellPayload[] {
  const results: ReferencedSpellPayload[] = [];
  const seen = new Set<string>();

  if (openSpell) {
    seen.add(openSpell.name.toLowerCase());
    results.push(toReferencedPayload(openSpell));
  }

  const normalized = recentText.toLowerCase();
  if (!normalized.trim() || catalog.length === 0) {
    return results;
  }

  // Prefer longer spell names first so "Delayed Blast Fireball" beats "Fireball"
  const candidates = catalog
    .filter((s) => s.name.length >= 4 && normalized.includes(s.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);

  for (const spell of candidates) {
    if (results.length >= maxMatches) break;
    const key = spell.name.toLowerCase();
    if (seen.has(key)) continue;

    // Require word boundaries so short names like "Bane" or "Wish" don't match substrings
    const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");
    if (pattern.test(recentText)) {
      seen.add(key);
      results.push(toReferencedPayload(spell));
    }
  }

  return results;
}

export async function streamAssistantChat(
  messages: Array<{ role: "user" | "model"; content: string }>,
  context: AssistantContextPayload,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    signal,
    body: JSON.stringify({ messages, context }),
  });

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    if (contentType.includes("application/json")) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(
        data?.error || `Assistant request failed (HTTP ${res.status}).`
      );
    }
    throw new Error(
      "The assistant was temporarily busy or warming up. Please try again."
    );
  }

  if (!contentType.includes("text/event-stream") || !res.body) {
    throw new Error(
      "The assistant was temporarily busy or warming up. Please try again."
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const processBlock = (block: string) => {
    const lines = block.split("\n");
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join("\n");
    if (rawData === "[DONE]") return;

    let parsed: { text?: string; error?: string } | null = null;
    try {
      parsed = JSON.parse(rawData) as { text?: string; error?: string };
    } catch {
      return;
    }

    if (eventName === "error" || parsed?.error) {
      throw new Error(
        parsed?.error || "Could not complete response. Please try again."
      );
    }

    if (parsed?.text) {
      onDelta(parsed.text);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx = buffer.indexOf("\n\n");
    while (sepIdx !== -1) {
      const block = buffer.slice(0, sepIdx).trim();
      buffer = buffer.slice(sepIdx + 2);
      if (block) processBlock(block);
      sepIdx = buffer.indexOf("\n\n");
    }
  }

  const tail = buffer.trim();
  if (tail) {
    processBlock(tail);
  }
}
