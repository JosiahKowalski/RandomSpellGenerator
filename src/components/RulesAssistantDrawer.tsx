import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Loader2,
  MessageSquare,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import {
  AppView,
  RandomizerConfig,
  SorceryState,
  Spell,
  SpellSlotState,
  StoredRingSpell,
} from "../types/spell";
import {
  getDefaultSorceryPoints,
  METAMAGIC_OPTIONS,
  SPELL_LEVELS,
} from "../lib/constants";
import { getEffectiveMaxSlots } from "../lib/spellEngine";
import {
  AssistantChatMessage,
  AssistantContextPayload,
  findReferencedSpells,
  streamAssistantChat,
} from "../lib/aiAssistantClient";
import { useAiAvailability } from "../lib/useAiAvailability";

export interface RulesAssistantDrawerProps {
  catalog: Spell[];
  knownSpells: Spell[];
  rolledSpells: Spell[];
  ringSpells: StoredRingSpell[];
  config: RandomizerConfig;
  slotState: SpellSlotState;
  sorcery: SorceryState;
  concentrationSpell: string | null;
  activeView: AppView;
  openSpell: Spell | null;
}

export const RulesAssistantDrawer: React.FC<RulesAssistantDrawerProps> = ({
  catalog,
  knownSpells,
  rolledSpells,
  ringSpells,
  config,
  slotState,
  sorcery,
  concentrationSpell,
  activeView,
  openSpell,
}) => {
  const aiAvailable = useAiAvailability();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Close on Escape when panel is open
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // Focus composer when opening
  useEffect(() => {
    if (isOpen) {
      window.setTimeout(() => textareaRef.current?.focus(), 60);
    }
  }, [isOpen]);

  // Auto-scroll during conversation / streaming
  useEffect(() => {
    if (isOpen) {
      scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Cleanup any in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Build concise live character state summary
  const characterStatsSummary = useMemo(() => {
    const effectiveMax = getEffectiveMaxSlots(slotState, config.casterLevel);
    const slotParts: string[] = [];
    let totalRemaining = 0;
    for (let lvl = 1; lvl <= 9; lvl++) {
      const key = String(lvl);
      const max = effectiveMax[key] ?? 0;
      if (max <= 0) continue;
      const used = Math.min(max, Math.max(0, slotState.used[key] ?? 0));
      const rem = Math.max(0, max - used);
      totalRemaining += rem;
      slotParts.push(`${SPELL_LEVELS[lvl]?.shortLabel}: ${rem}/${max}`);
    }

    const maxSp = sorcery.useCustomMax
      ? sorcery.maxPoints
      : getDefaultSorceryPoints(config.casterLevel);
    const remSp = Math.max(0, maxSp - Math.min(maxSp, Math.max(0, sorcery.usedPoints)));
    const knownMetaNames = sorcery.knownMetamagics
      .map((id) => METAMAGIC_OPTIONS.find((m) => m.id === id)?.name)
      .filter((n): n is string => Boolean(n));

    return {
      totalRemainingSlots: totalRemaining,
      slotsSummary: slotParts.length > 0 ? slotParts.join(", ") : "None",
      sorcerySummary: maxSp > 0 ? `${remSp}/${maxSp} SP` : "0 SP",
      knownMetamagics: knownMetaNames,
    };
  }, [slotState, config.casterLevel, sorcery]);

  const activeSpellCount = useMemo(() => {
    const seen = new Set<string>();
    for (const s of [...knownSpells, ...rolledSpells]) {
      seen.add(s.name.toLowerCase());
    }
    return seen.size;
  }, [knownSpells, rolledSpells]);

  // Contextual starter prompts tailored to what the user actually has right now
  const starterPrompts = useMemo(() => {
    const prompts: Array<{ label: string; prompt: string }> = [];

    if (openSpell) {
      prompts.push({
        label: `Rule check: ${openSpell.name}`,
        prompt: `Give me a quick 5e rules check on ${openSpell.name} — key restrictions, edge cases, and metamagic interactions.`,
      });
    } else {
      const sampleSpell = rolledSpells[0] || knownSpells[0];
      prompts.push({
        label: sampleSpell
          ? `Can I Twin ${sampleSpell.name}?`
          : "Bonus action spell rule",
        prompt: sampleSpell
          ? `Can I use Twinned Spell with ${sampleSpell.name} under 5e RAW?`
          : "Explain the 5e Bonus Action spellcasting rule with Quickened Spell.",
      });
    }

    prompts.push({
      label: "Metamagic & spellbook combos",
      prompt:
        "Looking at my active spells and metamagic, what are the strongest legal combos or rules gotchas to watch out for?",
    });

    prompts.push({
      label: "Concentration & slot advice",
      prompt: concentrationSpell
        ? `I'm currently concentrating on ${concentrationSpell}. What good non-concentration options do I have in my active spellbook right now?`
        : "What are the best combat opener spells from my active spellbook right now?",
    });

    return prompts;
  }, [openSpell, rolledSpells, knownSpells, concentrationSpell]);

  // Do not render anything when AI is unavailable or still checking
  if (aiAvailable !== true) {
    return null;
  }

  const buildContextPayload = (recentText: string): AssistantContextPayload => {
    const referencedSpells = findReferencedSpells(
      recentText,
      catalog,
      openSpell,
      4
    );
    return {
      casterLevel: config.casterLevel,
      canRitualCast: config.canRitualCast,
      activeView,
      concentrationSpell,
      slotsSummary: characterStatsSummary.slotsSummary,
      sorcerySummary: characterStatsSummary.sorcerySummary,
      knownMetamagics: characterStatsSummary.knownMetamagics,
      knownSpells: knownSpells.map((s) => s.name),
      rolledSpells: rolledSpells.map((s) => s.name),
      ringSpells: ringSpells.map(
        (r) => `${r.spellName} (${SPELL_LEVELS[r.castLevel]?.shortLabel || r.castLevel})`
      ),
      openSpellName: openSpell?.name ?? null,
      referencedSpells,
    };
  };

  const sendMessage = async (
    rawText: string,
    baseHistory?: AssistantChatMessage[]
  ) => {
    const trimmed = rawText.trim();
    if (!trimmed || isStreaming) return;

    setErrorMsg(null);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMsg: AssistantChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    const assistantMsgId = `m-${Date.now() + 1}`;
    const assistantPlaceholder: AssistantChatMessage = {
      id: assistantMsgId,
      role: "model",
      content: "",
    };

    const nextHistory = [...(baseHistory ?? messages), userMsg];
    setMessages([...nextHistory, assistantPlaceholder]);
    setIsStreaming(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Ground spell lookup using the latest 2 messages
    const lookupText = nextHistory
      .slice(-2)
      .map((m) => m.content)
      .join("\n");

    const apiMessages = nextHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      await streamAssistantChat(
        apiMessages,
        buildContextPayload(lookupText),
        (delta) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: msg.content + delta }
                : msg
            )
          );
        },
        controller.signal
      );
    } catch (err) {
      if (controller.signal.aborted) {
        setMessages((prev) =>
          prev.filter(
            (msg) => !(msg.id === assistantMsgId && !msg.content.trim())
          )
        );
        return;
      }
      const msg =
        err instanceof Error
          ? err.message
          : "Could not get a response right now.";
      setErrorMsg(msg);
      setMessages((prev) =>
        prev.filter((m) => !(m.id === assistantMsgId && !m.content.trim()))
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  const handleClear = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages([]);
    setErrorMsg(null);
  };

  const handleRetryLast = () => {
    if (isStreaming) return;
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const retryText = messages[lastUserIdx].content;
    const priorHistory = messages.slice(0, lastUserIdx);
    void sendMessage(retryText, priorHistory);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <>
      {/* Minimal floating trigger when collapsed */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open Rules Assistant"
          className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 h-10 px-3 sm:px-3.5 inline-flex items-center gap-2 rounded-md border border-limestone dark:border-charcoal-border bg-paper/95 dark:bg-soot/95 backdrop-blur-sm text-ink dark:text-parchment shadow-md hover:border-lapis dark:hover:border-lapis-dark hover:text-lapis dark:hover:text-lapis-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
        >
          <MessageSquare className="w-4 h-4 text-lapis dark:text-lapis-dark shrink-0" />
          <span className="hidden sm:inline text-xs font-medium whitespace-nowrap">
            Rules Assistant
          </span>
        </button>
      )}

      {/* Docked minimal chat panel when open */}
      {isOpen && (
        <aside
          aria-label="Rules Assistant"
          className="fixed bottom-3 right-3 left-3 sm:left-auto sm:bottom-5 sm:right-5 z-40 sm:w-[410px] h-[min(78vh,580px)] rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot shadow-2xl flex flex-col overflow-hidden animate-toast-in"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-limestone dark:border-charcoal-border flex items-center justify-between gap-2 shrink-0 bg-paper dark:bg-soot">
            <div className="min-w-0">
              <h2 className="font-serif text-base font-semibold text-ink dark:text-parchment leading-tight">
                Rules Assistant
              </h2>
              <p className="text-[11px] text-ink-muted dark:text-ash truncate mt-0.5">
                5e rules · Lv. {config.casterLevel} · {activeSpellCount} active{" "}
                {activeSpellCount === 1 ? "spell" : "spells"}
                {openSpell ? ` · Viewing ${openSpell.name}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  title="New conversation"
                  aria-label="Clear conversation"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-obsidian transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close Rules Assistant"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-obsidian transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages / Empty State */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="space-y-4 pt-1">
                <p className="text-sm text-ink-muted dark:text-ash leading-relaxed">
                  Ask a D&amp;D 5e rule check, metamagic legality question, or
                  spell interaction. I automatically read your active spellbook,
                  remaining slots, and exact spell text.
                </p>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-ink-muted dark:text-ash">
                    Quick checks
                  </p>
                  <div className="space-y-1.5">
                    {starterPrompts.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => void sendMessage(item.prompt)}
                        className="w-full text-left px-3 py-2 rounded-md border border-limestone dark:border-charcoal-border bg-linen/50 dark:bg-obsidian/60 hover:border-lapis dark:hover:border-lapis-dark text-xs font-medium text-ink dark:text-parchment transition-colors"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.role === "user") {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-md border border-limestone dark:border-charcoal-border bg-linen dark:bg-obsidian px-3 py-2 text-sm text-ink dark:text-parchment leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                const isPending = isStreaming && !msg.content;
                return (
                  <div
                    key={msg.id}
                    className="text-sm text-ink dark:text-parchment leading-relaxed"
                  >
                    {isPending ? (
                      <div className="flex items-center gap-2 text-xs text-ink-muted dark:text-ash py-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-lapis dark:text-lapis-dark" />
                        <span>Checking rules...</span>
                      </div>
                    ) : (
                      <div className="space-y-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_strong]:font-semibold [&_code]:font-mono [&_code]:text-[12px] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-linen [&_code]:dark:bg-obsidian [&_h3]:font-serif [&_h3]:font-semibold [&_h3]:text-sm [&_h3]:mt-2 [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:text-left [&_th]:py-1 [&_th]:px-2 [&_th]:border-b [&_th]:border-limestone [&_th]:dark:border-charcoal-border [&_td]:py-1 [&_td]:px-2 [&_td]:border-b [&_td]:border-limestone/60 [&_td]:dark:border-charcoal-border/60">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {errorMsg && (
              <div className="pt-2 border-t border-limestone/80 dark:border-charcoal-border/80 flex items-start justify-between gap-2 text-xs text-sienna dark:text-brass">
                <span className="leading-snug">{errorMsg}</span>
                <button
                  type="button"
                  onClick={handleRetryLast}
                  className="font-medium underline underline-offset-2 whitespace-nowrap shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-limestone dark:border-charcoal-border bg-paper dark:bg-soot shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask a 5e rule or spell question..."
                aria-label="Ask a 5e rule or spell question"
                className="flex-1 min-h-[38px] max-h-[120px] resize-none rounded-md border border-limestone dark:border-charcoal-border bg-linen/50 dark:bg-obsidian px-3 py-2 text-sm text-ink dark:text-parchment placeholder:text-ink-muted/70 dark:placeholder:text-ash/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  aria-label="Stop generating"
                  title="Stop generating"
                  className="h-[38px] w-[38px] inline-flex items-center justify-center rounded-md border border-sienna/50 dark:border-brass/50 text-sienna dark:text-brass hover:bg-linen dark:hover:bg-obsidian transition-colors shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void sendMessage(input)}
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="h-[38px] w-[38px] inline-flex items-center justify-center rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </aside>
      )}
    </>
  );
};
