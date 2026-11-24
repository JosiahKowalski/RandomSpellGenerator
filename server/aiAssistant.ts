import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export interface AssistantMessageInput {
  role: "user" | "model";
  content: string;
}

export interface ReferencedSpellContext {
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

export interface AssistantCharacterContext {
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
  referencedSpells?: ReferencedSpellContext[];
}

export interface AssistantChatInput {
  messages: AssistantMessageInput[];
  context?: AssistantCharacterContext;
}

const SYSTEM_INSTRUCTION = `You are a concise, accurate D&D 5e (2014 PHB / XGE / TCE ruleset) Rules & Spellbook Assistant embedded inside a spellbook manager app.

Your primary job is fast, table-ready rules checks, spell interaction rulings, metamagic legality checks, and tactical spellbook advice grounded in the player's actual character state.

Guidelines:
1. Lead with a direct verdict first (e.g., **Yes**, **No**, or **Depends on DM**) before explaining why.
2. Keep answers tight and scannable for mid-combat table use — short paragraphs or concise bullet points, bolding key rules terms (e.g., **Concentration**, **Bonus Action spell rule**, **Twinned Spell**, **Sight**).
3. Ground rulings strictly in 5e RAW (and briefly note common RAI / Sage Advice clarifications only when genuinely helpful). If spell text is provided in the character context below, rely on that exact wording.
4. When checking Metamagic legality (especially Twinned Spell, Quickened Spell, Subtle Spell, Careful Spell, Empowered Spell, Extended Spell, Heightened Spell, Seeking Spell, Transmuted Spell), verify exact RAW requirements (e.g., Twinned Spell requires a range other than Self, incapable of targeting more than one creature, and not targeting objects; Quickened Spell + Bonus Action spellcasting rule limits the Action spell to a cantrip with a casting time of 1 action; Careful Spell only grants an automatic save, not zero damage on half-damage spells).
5. Reference the player's actual known/rolled spells, remaining spell slots, sorcery points, concentration spell, and Ring of Spell Storing when relevant — never invent spells they don't have unless clearly suggesting options outside their current spellbook.
6. Keep responses focused and concise (typically under 180 words unless the user asks for a deep breakdown).`;

let cachedClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error(
      "AI assistant is currently unavailable because no server API key is configured."
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

interface ParsedApiError {
  status: number;
  message: string;
  retryable: boolean;
}

function extractGeminiError(err: unknown): ParsedApiError {
  const errObj = err as Error & { status?: number; statusCode?: number };
  let status = errObj?.statusCode || errObj?.status || 500;
  let message = errObj?.message || "Failed to generate a response.";

  const trimmed = message.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { code?: number; message?: string };
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
      // keep raw message
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
        "API key could not be verified. Check your key in Settings > Secrets.",
      retryable: false,
    };
  }
  if (status === 429 || lower.includes("resource_exhausted")) {
    return {
      status: 429,
      message: "Rate limit reached. Please wait a moment and try again.",
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
        "The AI model is experiencing high demand right now. Please try again in a moment.",
      retryable: true,
    };
  }

  return {
    status,
    message,
    retryable: status >= 500 || status === 408 || status === 404,
  };
}

function formatCharacterContext(ctx?: AssistantCharacterContext): string {
  if (!ctx) return "";
  const lines: string[] = ["--- Current Character & Spellbook Context ---"];
  lines.push(
    `Caster Level: ${ctx.casterLevel} | Ritual Casting: ${
      ctx.canRitualCast ? "Enabled" : "Disabled (rituals require a slot)"
    }`
  );
  if (ctx.concentrationSpell) {
    lines.push(`Currently Concentrating On: ${ctx.concentrationSpell}`);
  } else {
    lines.push("Currently Concentrating On: None");
  }
  if (ctx.slotsSummary) {
    lines.push(`Spell Slots Remaining: ${ctx.slotsSummary}`);
  }
  if (ctx.sorcerySummary) {
    lines.push(`Sorcery Points: ${ctx.sorcerySummary}`);
  }
  if (ctx.knownMetamagics && ctx.knownMetamagics.length > 0) {
    lines.push(`Known Metamagic: ${ctx.knownMetamagics.join(", ")}`);
  }
  if (ctx.knownSpells && ctx.knownSpells.length > 0) {
    lines.push(`Permanent Known Spells: ${ctx.knownSpells.slice(0, 60).join(", ")}`);
  }
  if (ctx.rolledSpells && ctx.rolledSpells.length > 0) {
    lines.push(`Rolled Active Spells: ${ctx.rolledSpells.slice(0, 60).join(", ")}`);
  }
  if (ctx.ringSpells && ctx.ringSpells.length > 0) {
    lines.push(`Ring of Spell Storing: ${ctx.ringSpells.join(", ")}`);
  }
  if (ctx.openSpellName) {
    lines.push(`User Currently Viewing Spell: ${ctx.openSpellName}`);
  }

  if (ctx.referencedSpells && ctx.referencedSpells.length > 0) {
    lines.push("");
    lines.push("--- Exact Spell Text From Loaded Catalog ---");
    for (const s of ctx.referencedSpells.slice(0, 4)) {
      lines.push(
        `\n### ${s.name} (${s.level} ${s.school})`,
        `Casting Time: ${s.castingTime} | Range: ${s.range} | Components: ${s.components} | Duration: ${s.duration}`,
        s.text.slice(0, 2200)
      );
      if (s.atHigherLevels) {
        lines.push(`At Higher Levels: ${s.atHigherLevels.slice(0, 600)}`);
      }
    }
  }

  return lines.join("\n");
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
  const base = [650, 1300, 1900][attemptIndex] ?? 1900;
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

export async function streamRulesAssistantReply(
  input: AssistantChatInput,
  onChunk: (deltaText: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const ai = getGeminiClient();

  const contextBlock = formatCharacterContext(input.context);
  const fullSystemInstruction = contextBlock
    ? `${SYSTEM_INSTRUCTION}\n\n${contextBlock}`
    : SYSTEM_INSTRUCTION;

  const contents = input.messages.slice(-14).map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  let lastError: ParsedApiError | null = null;

  for (let attempt = 0; attempt < MODEL_ATTEMPTS.length; attempt++) {
    if (signal?.aborted) return;
    const { model, thinkingLevel } = MODEL_ATTEMPTS[attempt];
    let emittedAny = false;

    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: fullSystemInstruction,
          thinkingConfig: { thinkingLevel },
        },
      });

      for await (const chunk of stream) {
        if (signal?.aborted) return;
        const delta = chunk.text ?? "";
        if (delta) {
          emittedAny = true;
          onChunk(delta);
        }
      }

      if (emittedAny) {
        return;
      }

      lastError = {
        status: 500,
        message: "The assistant returned an empty response. Please try again.",
        retryable: true,
      };
    } catch (err) {
      if (signal?.aborted) return;
      const parsed = extractGeminiError(err);
      lastError = parsed;
      // Do not retry if we already streamed partial output to the user
      if (emittedAny || !parsed.retryable) {
        break;
      }
      if (attempt < MODEL_ATTEMPTS.length - 1) {
        await sleep(backoffDelayMs(attempt), signal);
      }
    }
  }

  const err = new Error(
    lastError?.message || "Could not get a response right now. Please try again."
  ) as Error & { statusCode?: number };
  err.statusCode = lastError?.status || 500;
  throw err;
}
