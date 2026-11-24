import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { parseSpellRollsWithGemini } from "./server/aiSpellParser";
import {
  AssistantCharacterContext,
  AssistantMessageInput,
  streamRulesAssistantReply,
} from "./server/aiAssistant";

const app = express();
app.use(cors());
app.use(express.json({ limit: "128kb" }));

const PORT = Number(process.env.PORT) || 3000;

app.get("/api/ai/status", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    available: Boolean(process.env.GEMINI_API_KEY?.trim()),
  });
});

app.post("/api/ai/parse-spell-rolls", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown> | undefined;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const atHigherLevels =
      typeof body?.atHigherLevels === "string"
        ? body.atHigherLevels.trim()
        : "";
    const school =
      typeof body?.school === "string" ? body.school.trim() : undefined;
    const levelIndex = Math.max(
      0,
      Math.min(9, Math.round(Number(body?.levelIndex ?? 0)))
    );

    if (!name || !text) {
      return res
        .status(400)
        .json({ error: "Spell name and description text are required." });
    }
    if (name.length > 120 || text.length > 12000 || atHigherLevels.length > 3000) {
      return res
        .status(400)
        .json({ error: "Spell payload exceeds allowed size limits." });
    }

    const abortController = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const profile = await parseSpellRollsWithGemini(
      {
        name,
        levelIndex: Number.isFinite(levelIndex) ? levelIndex : 0,
        school,
        text,
        atHigherLevels,
      },
      {
        forceRefresh: Boolean(body?.forceRefresh),
        signal: abortController.signal,
      }
    );

    if (res.writableEnded) return;
    return res.json({ profile });
  } catch (err) {
    if (res.writableEnded) return;
    const errorObj = err as Error & { status?: number; statusCode?: number };
    const upstreamStatus = errorObj.statusCode || errorObj.status || 500;
    const message =
      errorObj.message || "Failed to analyze spell rolls with AI.";
    if (upstreamStatus !== 499 && upstreamStatus !== 503 && upstreamStatus !== 429) {
      console.error("[/api/ai/parse-spell-rolls] error:", upstreamStatus, message);
    }
    // Avoid 403/502/503/504 which the reverse proxy intercepts and rewrites to HTML (200 OK)
    const safeStatus =
      upstreamStatus === 400 || upstreamStatus === 429 ? upstreamStatus : 500;
    return res
      .status(safeStatus)
      .json({ error: message, upstreamStatus });
  }
});

app.post("/api/ai/chat", async (req, res) => {
  const body = req.body as Record<string, unknown> | undefined;
  const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
  const messages: AssistantMessageInput[] = [];

  for (const item of rawMessages.slice(-20)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const role = rec.role === "model" ? "model" : rec.role === "user" ? "user" : null;
    const content =
      typeof rec.content === "string" ? rec.content.trim().slice(0, 4000) : "";
    if (role && content) {
      messages.push({ role, content });
    }
  }

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return res
      .status(400)
      .json({ error: "A user message is required." });
  }

  const rawCtx =
    body?.context && typeof body.context === "object"
      ? (body.context as Record<string, unknown>)
      : undefined;

  const context: AssistantCharacterContext | undefined = rawCtx
    ? {
        casterLevel: Math.max(
          1,
          Math.min(20, Math.round(Number(rawCtx.casterLevel) || 1))
        ),
        canRitualCast: Boolean(rawCtx.canRitualCast),
        activeView:
          typeof rawCtx.activeView === "string"
            ? rawCtx.activeView.slice(0, 32)
            : undefined,
        concentrationSpell:
          typeof rawCtx.concentrationSpell === "string"
            ? rawCtx.concentrationSpell.slice(0, 120)
            : null,
        slotsSummary:
          typeof rawCtx.slotsSummary === "string"
            ? rawCtx.slotsSummary.slice(0, 240)
            : undefined,
        sorcerySummary:
          typeof rawCtx.sorcerySummary === "string"
            ? rawCtx.sorcerySummary.slice(0, 64)
            : undefined,
        knownMetamagics: Array.isArray(rawCtx.knownMetamagics)
          ? rawCtx.knownMetamagics
              .filter((x): x is string => typeof x === "string")
              .slice(0, 16)
              .map((s) => s.slice(0, 48))
          : undefined,
        knownSpells: Array.isArray(rawCtx.knownSpells)
          ? rawCtx.knownSpells
              .filter((x): x is string => typeof x === "string")
              .slice(0, 60)
              .map((s) => s.slice(0, 80))
          : undefined,
        rolledSpells: Array.isArray(rawCtx.rolledSpells)
          ? rawCtx.rolledSpells
              .filter((x): x is string => typeof x === "string")
              .slice(0, 60)
              .map((s) => s.slice(0, 80))
          : undefined,
        ringSpells: Array.isArray(rawCtx.ringSpells)
          ? rawCtx.ringSpells
              .filter((x): x is string => typeof x === "string")
              .slice(0, 12)
              .map((s) => s.slice(0, 80))
          : undefined,
        openSpellName:
          typeof rawCtx.openSpellName === "string"
            ? rawCtx.openSpellName.slice(0, 120)
            : null,
        referencedSpells: Array.isArray(rawCtx.referencedSpells)
          ? rawCtx.referencedSpells
              .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
              .slice(0, 4)
              .map((s) => ({
                name: String(s.name ?? "").slice(0, 100),
                level: String(s.level ?? "").slice(0, 24),
                school: String(s.school ?? "").slice(0, 48),
                castingTime: String(s.castingTime ?? "").slice(0, 64),
                range: String(s.range ?? "").slice(0, 64),
                components: String(s.components ?? "").slice(0, 120),
                duration: String(s.duration ?? "").slice(0, 64),
                text: String(s.text ?? "").slice(0, 3000),
                atHigherLevels:
                  typeof s.atHigherLevels === "string"
                    ? s.atHigherLevels.slice(0, 800)
                    : undefined,
              }))
              .filter((s) => s.name && s.text)
          : undefined,
      }
    : undefined;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    await streamRulesAssistantReply(
      { messages, context },
      (deltaText) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ text: deltaText })}\n\n`);
        }
      },
      abortController.signal
    );

    if (!res.writableEnded) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (err) {
    const errorObj = err as Error & { status?: number; statusCode?: number };
    const upstreamStatus = errorObj.statusCode || errorObj.status || 500;
    const message =
      errorObj.message || "Could not generate a response right now.";
    if (upstreamStatus !== 499 && upstreamStatus !== 503 && upstreamStatus !== 429) {
      console.error("[/api/ai/chat] error:", upstreamStatus, message);
    }
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
