import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Dices,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  DICE_FINISHES,
  DiceFinishId,
  DieKind,
} from "../lib/diceGeometry";
import {
  DiceTrayScene,
  LandedDieResult,
  RollDieRequest,
  TrayInteractionEvent,
} from "../lib/diceScene";
import {
  DiceTraySettings,
  loadDiceSettings,
  saveDiceSettings,
} from "../lib/diceRandomness";
import { diceAudio } from "../lib/diceAudio";
import { DiceCastHandoff, Spell, SpellSlotState } from "../types/spell";
import { SpellCastTrayPanel } from "./SpellCastTrayPanel";
import { DiceSettingsModal } from "./DiceSettingsModal";

interface DiceRollerViewProps {
  catalog: Spell[];
  knownSpells: Spell[];
  rolledSpells: Spell[];
  casterLevel: number;
  slotState: SpellSlotState;
  initialCastHandoff: DiceCastHandoff | null;
  onClearInitialCastHandoff: () => void;
  onCastSpell: (spell: Spell, slotLevel: number | null) => void;
  onOpenSpell: (spell: Spell) => void;
}

type BuilderDieType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";
type RollAdvantageMode = "normal" | "advantage" | "disadvantage";
type ControlDeckTab = "manual" | "spell";

interface RollTermSpec {
  id: string;
  die: BuilderDieType;
  count: number;
  sign: 1 | -1;
  keep?: { mode: "kh" | "kl"; count: number };
}

interface ParsedRollPlan {
  label: string;
  source: ControlDeckTab;
  showHalf?: boolean;
  terms: RollTermSpec[];
  modifier: number;
  requests: RollDieRequest[];
  groupMeta: Record<
    string,
    {
      termId: string;
      die: BuilderDieType;
      sign: 1 | -1;
      order: number;
    }
  >;
}

interface ResolvedDieDisplay {
  groupId: string;
  die: BuilderDieType;
  value: number;
  dropped: boolean;
  sign: 1 | -1;
  isCritMax: boolean;
  isCritMin: boolean;
  detailLabel?: string;
}

interface ResolvedRollRecord {
  id: string;
  label: string;
  total: number;
  showHalf?: boolean;
  modifier: number;
  dice: ResolvedDieDisplay[];
  nat20: boolean;
  nat1: boolean;
  rolledAt: string;
  plan: ParsedRollPlan;
}

const BUILDER_DICE: Array<{ type: BuilderDieType; label: string; sides: number }> = [
  { type: "d4", label: "d4", sides: 4 },
  { type: "d6", label: "d6", sides: 6 },
  { type: "d8", label: "d8", sides: 8 },
  { type: "d10", label: "d10", sides: 10 },
  { type: "d12", label: "d12", sides: 12 },
  { type: "d20", label: "d20", sides: 20 },
  { type: "d100", label: "d100", sides: 100 },
];

const FINISH_LIST: DiceFinishId[] = ["lapis", "ivory", "obsidian", "sienna"];
const MAX_PHYSICAL_DICE = 24;
const MAX_HISTORY = 10;
const DICE_PREFS_STORAGE_KEY = "arcane_ledger_dice_prefs_v1";
const DICE_HISTORY_STORAGE_KEY = "arcane_ledger_dice_history_v1";

function loadDicePrefs(): { finishId: DiceFinishId; muted: boolean } {
  try {
    const raw = localStorage.getItem(DICE_PREFS_STORAGE_KEY);
    if (!raw) return { finishId: "lapis", muted: false };
    const parsed = JSON.parse(raw);
    const finishId: DiceFinishId = FINISH_LIST.includes(parsed.finishId)
      ? parsed.finishId
      : "lapis";
    return {
      finishId,
      muted: Boolean(parsed.muted),
    };
  } catch {
    return { finishId: "lapis", muted: false };
  }
}

function loadDiceHistory(): ResolvedRollRecord[] {
  try {
    const raw = localStorage.getItem(DICE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is ResolvedRollRecord =>
          Boolean(
            item &&
              typeof item.id === "string" &&
              typeof item.total === "number" &&
              Array.isArray(item.dice) &&
              item.plan &&
              Array.isArray(item.plan.requests)
          )
      )
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

const QUICK_INSTANT_ROLLS: Array<{ label: string; formula: string }> = [
  { label: "1d20", formula: "1d20" },
  { label: "Adv", formula: "2d20kh1" },
  { label: "Dis", formula: "2d20kl1" },
  { label: "1d100", formula: "1d100" },
  { label: "4d6kh3", formula: "4d6kh3" },
  { label: "8d6", formula: "8d6" },
];

function createEmptyHand(): Record<BuilderDieType, number> {
  return {
    d4: 0,
    d6: 0,
    d8: 0,
    d10: 0,
    d12: 0,
    d20: 0,
    d100: 0,
  };
}

function buildPlanFromTerms(
  terms: RollTermSpec[],
  modifier: number,
  source: ControlDeckTab,
  customLabel?: string,
  showHalf?: boolean
): { plan?: ParsedRollPlan; error?: string } {
  const requests: RollDieRequest[] = [];
  const groupMeta: ParsedRollPlan["groupMeta"] = {};
  let order = 0;

  for (const term of terms) {
    for (let i = 0; i < term.count; i++) {
      const groupId = `${term.id}-g${i}`;
      groupMeta[groupId] = {
        termId: term.id,
        die: term.die,
        sign: term.sign,
        order: order++,
      };
      if (term.die === "d100") {
        requests.push({
          id: `${groupId}-tens`,
          kind: "d10_tens",
          groupId,
        });
        requests.push({
          id: `${groupId}-ones`,
          kind: "d10",
          groupId,
        });
      } else {
        requests.push({
          id: `${groupId}-die`,
          kind: term.die as DieKind,
          groupId,
        });
      }
    }
  }

  if (requests.length === 0) {
    return { error: "Add at least one die to roll." };
  }
  if (requests.length > MAX_PHYSICAL_DICE) {
    return {
      error: `Tray supports up to ${MAX_PHYSICAL_DICE} physical dice at once (d100 uses 2 dice).`,
    };
  }

  let label = customLabel;
  if (!label) {
    const parts: string[] = [];
    terms.forEach((t, idx) => {
      const prefix =
        t.sign === -1 ? (idx === 0 ? "−" : " − ") : idx === 0 ? "" : " + ";
      const keepSuffix = t.keep ? `${t.keep.mode}${t.keep.count}` : "";
      parts.push(`${prefix}${t.count}${t.die}${keepSuffix}`);
    });
    if (modifier !== 0) {
      parts.push(modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`);
    }
    label = parts.join("");
  }

  return {
    plan: {
      label,
      source,
      showHalf,
      terms,
      modifier,
      requests,
      groupMeta,
    },
  };
}

function parseFormula(
  input: string,
  source: ControlDeckTab = "manual",
  customLabel?: string,
  showHalf?: boolean
): { plan?: ParsedRollPlan; error?: string } {
  const cleaned = input.replace(/\s+/g, "").toLowerCase();
  if (!cleaned) {
    return { error: "Enter a formula like 8d6, 2d20kh1+5, or 1d8+4." };
  }

  const tokenRegex = /([+-]?[^+-]+)/g;
  const rawTokens = cleaned.match(tokenRegex);
  if (!rawTokens || rawTokens.length === 0) {
    return { error: "Could not parse formula." };
  }

  const terms: RollTermSpec[] = [];
  let modifier = 0;

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];
    const diceMatch = token.match(
      /^([+-]?)(\d*)d(4|6|8|10|12|20|100)(?:(kh|kl)(\d+))?$/
    );
    if (diceMatch) {
      const sign: 1 | -1 = diceMatch[1] === "-" ? -1 : 1;
      const count = diceMatch[2] ? parseInt(diceMatch[2], 10) : 1;
      const sides = diceMatch[3];
      const keepMode = diceMatch[4] as "kh" | "kl" | undefined;
      const keepCount = diceMatch[5] ? parseInt(diceMatch[5], 10) : undefined;

      if (!Number.isFinite(count) || count < 1 || count > MAX_PHYSICAL_DICE) {
        return {
          error: `Dice count must be between 1 and ${MAX_PHYSICAL_DICE}.`,
        };
      }

      const die = `d${sides}` as BuilderDieType;
      let keep: { mode: "kh" | "kl"; count: number } | undefined;
      if (keepMode && keepCount !== undefined) {
        if (keepCount < 1 || keepCount > count) {
          return {
            error: `Keep count (${keepMode}${keepCount}) must be between 1 and ${count}.`,
          };
        }
        keep = { mode: keepMode, count: keepCount };
      }

      terms.push({
        id: `t${i}`,
        die,
        count,
        sign,
        keep,
      });
      continue;
    }

    const flatMatch = token.match(/^([+-]?\d+)$/);
    if (flatMatch) {
      const val = parseInt(flatMatch[1], 10);
      if (!Number.isFinite(val) || Math.abs(val) > 999) {
        return { error: "Modifier out of range." };
      }
      modifier += val;
      continue;
    }

    return {
      error: `Unrecognized term "${token}". Try e.g. 2d20kh1+7, 8d6, or 1d8+1d6+4.`,
    };
  }

  if (terms.length === 0) {
    return { error: "Formula must include at least one die (e.g. 1d20+5)." };
  }

  return buildPlanFromTerms(terms, modifier, source, customLabel, showHalf);
}

function buildPlanFromHand(
  hand: Record<BuilderDieType, number>,
  modifier: number,
  advMode: RollAdvantageMode
): { plan?: ParsedRollPlan; error?: string } {
  const terms: RollTermSpec[] = [];
  let termIdx = 0;

  for (const spec of BUILDER_DICE) {
    const count = hand[spec.type];
    if (count <= 0) continue;

    if (spec.type === "d20" && count === 1 && advMode !== "normal") {
      terms.push({
        id: `h${termIdx++}`,
        die: "d20",
        count: 2,
        sign: 1,
        keep: { mode: advMode === "advantage" ? "kh" : "kl", count: 1 },
      });
    } else {
      terms.push({
        id: `h${termIdx++}`,
        die: spec.type,
        count,
        sign: 1,
      });
    }
  }

  if (terms.length === 0) {
    terms.push({
      id: "h0",
      die: "d20",
      count: advMode === "normal" ? 1 : 2,
      sign: 1,
      keep:
        advMode === "normal"
          ? undefined
          : { mode: advMode === "advantage" ? "kh" : "kl", count: 1 },
    });
  }

  return buildPlanFromTerms(terms, modifier, "manual");
}

function resolveRollResults(
  plan: ParsedRollPlan,
  landed: LandedDieResult[]
): ResolvedRollRecord {
  const byGroup = new Map<string, LandedDieResult[]>();
  for (const res of landed) {
    const arr = byGroup.get(res.groupId) ?? [];
    arr.push(res);
    byGroup.set(res.groupId, arr);
  }

  const resolvedDice: ResolvedDieDisplay[] = [];

  for (const [groupId, meta] of Object.entries(plan.groupMeta)) {
    const groupResults = byGroup.get(groupId) ?? [];
    if (groupResults.length === 0) continue;

    let value = 1;
    let detailLabel: string | undefined;

    if (meta.die === "d100") {
      const tensDie = groupResults.find((r) => r.kind === "d10_tens");
      const onesDie = groupResults.find((r) => r.kind === "d10");
      const tens = tensDie ? tensDie.value : 0;
      const onesRaw = onesDie ? onesDie.value : 1;
      const onesDigit = onesRaw === 10 ? 0 : onesRaw;
      value = tens === 0 && onesDigit === 0 ? 100 : tens + onesDigit;
      const tensStr = tens === 0 ? "00" : String(tens);
      detailLabel = `${tensStr} + ${onesDigit}`;
    } else {
      value = groupResults[0].value;
    }

    const maxFace =
      BUILDER_DICE.find((d) => d.type === meta.die)?.sides ?? 20;

    resolvedDice.push({
      groupId,
      die: meta.die,
      value,
      dropped: false,
      sign: meta.sign,
      isCritMax: value === maxFace,
      isCritMin: value === 1,
      detailLabel,
    });
  }

  resolvedDice.sort(
    (a, b) =>
      (plan.groupMeta[a.groupId]?.order ?? 0) -
      (plan.groupMeta[b.groupId]?.order ?? 0)
  );

  for (const term of plan.terms) {
    if (!term.keep) continue;
    const termDice = resolvedDice.filter(
      (d) => plan.groupMeta[d.groupId]?.termId === term.id
    );
    const sorted = [...termDice].sort((a, b) =>
      term.keep!.mode === "kh" ? b.value - a.value : a.value - b.value
    );
    const keptIds = new Set(
      sorted.slice(0, term.keep.count).map((d) => d.groupId)
    );
    for (const d of termDice) {
      d.dropped = !keptIds.has(d.groupId);
    }
  }

  let total = plan.modifier;
  for (const d of resolvedDice) {
    if (!d.dropped) {
      total += d.sign * d.value;
    }
  }

  const keptD20s = resolvedDice.filter((d) => d.die === "d20" && !d.dropped);
  const nat20 = keptD20s.length === 1 && keptD20s[0].value === 20;
  const nat1 = keptD20s.length === 1 && keptD20s[0].value === 1;

  return {
    id: `dice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: plan.label,
    total,
    showHalf: plan.showHalf,
    modifier: plan.modifier,
    dice: resolvedDice,
    nat20,
    nat1,
    rolledAt: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    plan,
  };
}

export const DiceRollerView: React.FC<DiceRollerViewProps> = ({
  catalog,
  knownSpells,
  rolledSpells,
  casterLevel,
  slotState,
  initialCastHandoff,
  onClearInitialCastHandoff,
  onCastSpell,
  onOpenSpell,
}) => {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DiceTrayScene | null>(null);
  const activePlanRef = useRef<ParsedRollPlan | null>(null);
  const lastSpellPlanRef = useRef<ParsedRollPlan | null>(null);

  const [deckTab, setDeckTab] = useState<ControlDeckTab>(
    initialCastHandoff ? "spell" : "manual"
  );
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(
    initialCastHandoff?.spell ?? null
  );
  const [handoffMeta, setHandoffMeta] = useState<{
    castLevel: number | null;
    alreadyCast: boolean;
    seq: number;
  } | null>(() =>
    initialCastHandoff
      ? {
          castLevel: initialCastHandoff.castLevel,
          alreadyCast: initialCastHandoff.alreadyCast,
          seq: Date.now(),
        }
      : null
  );

  const initialPrefs = useRef(loadDicePrefs()).current;
  const [finishId, setFinishId] = useState<DiceFinishId>(initialPrefs.finishId);
  const [muted, setMuted] = useState<boolean>(initialPrefs.muted);
  const [diceSettings, setDiceSettings] = useState<DiceTraySettings>(() =>
    loadDiceSettings()
  );
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [hand, setHand] = useState<Record<BuilderDieType, number>>(() =>
    createEmptyHand()
  );
  const [modifier, setModifier] = useState<number>(0);
  const [advMode, setAdvMode] = useState<RollAdvantageMode>("normal");
  const [formulaInput, setFormulaInput] = useState<string>("");
  const [formulaError, setFormulaError] = useState<string | null>(null);

  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [isHoldingDie, setIsHoldingDie] = useState<boolean>(false);
  const [isHeldConcealed, setIsHeldConcealed] = useState<boolean>(false);
  const [hoveredTrayGroupId, setHoveredTrayGroupId] = useState<string | null>(
    null
  );
  const [trayStatusNote, setTrayStatusNote] = useState<string | null>(null);
  const statusTimerRef = useRef<number | null>(null);
  const [activeLabel, setActiveLabel] = useState<string>("");
  const [latestRoll, setLatestRoll] = useState<ResolvedRollRecord | null>(null);
  const [history, setHistory] = useState<ResolvedRollRecord[]>(() =>
    loadDiceHistory()
  );
  const [recentRollsOpen, setRecentRollsOpen] = useState<boolean>(false);

  // Sync audio mute and persist dice finish + mute preferences
  useEffect(() => {
    diceAudio.setMuted(muted);
    try {
      localStorage.setItem(
        DICE_PREFS_STORAGE_KEY,
        JSON.stringify({ finishId, muted })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [finishId, muted]);

  // Persist recent dice roll history across tab switches and page reloads
  useEffect(() => {
    try {
      localStorage.setItem(DICE_HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // ignore storage quota errors
    }
  }, [history]);

  const handleUpdateDiceSettings = useCallback((next: DiceTraySettings) => {
    setDiceSettings(next);
    saveDiceSettings(next);
    sceneRef.current?.setSettings(next);
  }, []);

  const flashTrayStatusNote = useCallback((msg: string) => {
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
    setTrayStatusNote(msg);
    statusTimerRef.current = window.setTimeout(() => {
      setTrayStatusNote(null);
      statusTimerRef.current = null;
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  // If routed from Spellbook, Spell Reader Modal, or Ring ("Cast & Roll" / "Tray Only"),
  // switch cleanly to Cast Spell tab with the exact cast slot level
  useEffect(() => {
    if (initialCastHandoff) {
      setSelectedSpell(initialCastHandoff.spell);
      setHandoffMeta({
        castLevel: initialCastHandoff.castLevel,
        alreadyCast: initialCastHandoff.alreadyCast,
        seq: Date.now(),
      });
      setDeckTab("spell");
      onClearInitialCastHandoff();
    }
  }, [initialCastHandoff, onClearInitialCastHandoff]);

  const handleSelectSpellManual = useCallback((spell: Spell | null) => {
    setHandoffMeta(null);
    setSelectedSpell(spell);
  }, []);

  const handleSettledRef = useRef<(results: LandedDieResult[]) => void>(() => {});
  handleSettledRef.current = (results: LandedDieResult[]) => {
    const plan = activePlanRef.current;
    if (!plan) {
      setIsRolling(false);
      setIsHoldingDie(false);
      return;
    }
    const record = resolveRollResults(plan, results);
    if (record.nat20) {
      diceAudio.playNat20Chime();
    }
    sceneRef.current?.setDroppedGroups(
      record.dice.filter((d) => d.dropped).map((d) => d.groupId)
    );
    setLatestRoll(record);
    setHistory((prev) => [record, ...prev].slice(0, MAX_HISTORY));
    setIsRolling(false);
    setIsHoldingDie(false);
  };

  const handleTrayInteractionRef = useRef<(ev: TrayInteractionEvent) => void>(
    () => {}
  );

  // Mount Three.js + Cannon-es Dice Tray once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const tray = new DiceTrayScene(
      container,
      finishId,
      (results) => {
        handleSettledRef.current(results);
      },
      (ev) => {
        handleTrayInteractionRef.current(ev);
      },
      diceSettings
    );
    sceneRef.current = tray;

    return () => {
      tray.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setFinish(finishId);
  }, [finishId]);

  useEffect(() => {
    sceneRef.current?.setSettings(diceSettings);
  }, [diceSettings]);

  const executePlan = useCallback(
    (plan: ParsedRollPlan, throwDir?: { x: number; z: number }) => {
      if (!sceneRef.current) return;
      setFormulaError(null);
      setTrayStatusNote(null);
      setHoveredTrayGroupId(null);
      activePlanRef.current = plan;
      if (plan.source === "spell") {
        lastSpellPlanRef.current = plan;
      }
      setActiveLabel(plan.label);
      setIsRolling(true);
      sceneRef.current.rollDice(plan.requests, throwDir);
    },
    []
  );

  const handleRollHand = useCallback(
    (throwDir?: { x: number; z: number }) => {
      const { plan, error } = buildPlanFromHand(hand, modifier, advMode);
      if (error || !plan) {
        setFormulaError(error ?? "Unable to roll hand.");
        return;
      }
      executePlan(plan, throwDir);
    },
    [hand, modifier, advMode, executePlan]
  );

  const handleFormulaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulaInput.trim()) return;
    const { plan, error } = parseFormula(formulaInput, "manual");
    if (error || !plan) {
      setFormulaError(error ?? "Invalid formula.");
      return;
    }
    executePlan(plan);
  };

  const handleInstantPreset = (formula: string) => {
    const { plan, error } = parseFormula(formula, "manual");
    if (error || !plan) {
      setFormulaError(error ?? "Invalid preset.");
      return;
    }
    executePlan(plan);
  };

  const handleSpellFormulaRoll = useCallback(
    (formula: string, label: string, options?: { showHalf?: boolean }) => {
      const { plan, error } = parseFormula(
        formula,
        "spell",
        label,
        options?.showHalf
      );
      if (error || !plan) {
        setFormulaError(error ?? "Could not roll spell formula.");
        return;
      }
      executePlan(plan);
    },
    [executePlan]
  );

  const handleRerollSingleDie = (groupId: string) => {
    if (!sceneRef.current || isRolling) return;
    const started = sceneRef.current.rerollDieByGroup(groupId);
    if (started) {
      setIsRolling(true);
    }
  };

  const handleClearTray = () => {
    sceneRef.current?.clearTray();
    activePlanRef.current = null;
    setIsRolling(false);
    setIsHoldingDie(false);
    setHoveredTrayGroupId(null);
    setLatestRoll(null);
    setActiveLabel("");
  };

  const handleToggleMute = () => {
    setMuted((prev) => !prev);
  };

  const adjustHandDie = (type: BuilderDieType, delta: number) => {
    setFormulaError(null);
    setHand((prev) => {
      const nextVal = Math.max(0, Math.min(20, prev[type] + delta));
      const candidate = { ...prev, [type]: nextVal };
      const physicalCount = BUILDER_DICE.reduce(
        (sum, d) => sum + candidate[d.type] * (d.type === "d100" ? 2 : 1),
        0
      );
      if (physicalCount > MAX_PHYSICAL_DICE) {
        setFormulaError(
          `Tray holds up to ${MAX_PHYSICAL_DICE} physical dice at once.`
        );
        return prev;
      }
      return candidate;
    });
  };

  // Reroll all dice in the tray:
  // Re-throws the currently active roll if dice are on the felt (matching the active tab),
  // or rolls the active hand / last spell when starting fresh.
  const handleTrayRoll = useCallback(
    (throwDir?: { x: number; z: number }) => {
      if (
        activePlanRef.current &&
        activePlanRef.current.source === deckTab
      ) {
        executePlan(activePlanRef.current, throwDir);
        return;
      }
      if (deckTab === "spell" && lastSpellPlanRef.current) {
        executePlan(lastSpellPlanRef.current, throwDir);
        return;
      }
      handleRollHand(throwDir);
    },
    [deckTab, executePlan, handleRollHand]
  );

  handleTrayInteractionRef.current = (ev: TrayInteractionEvent) => {
    if (ev.kind === "hover-die") {
      setHoveredTrayGroupId(ev.groupId ?? null);
    } else if (ev.kind === "grab-die") {
      setTrayStatusNote(null);
      setIsHeldConcealed(Boolean(ev.concealed));
      setIsHoldingDie(true);
    } else if (ev.kind === "toss-die") {
      setIsHoldingDie(false);
      setIsHeldConcealed(false);
      setIsRolling(true);
    } else if (ev.kind === "cancel-grab") {
      setIsHoldingDie(false);
      setIsHeldConcealed(false);
      flashTrayStatusNote("Returned to tray · flick to toss");
    } else if (ev.kind === "reroll-die") {
      setTrayStatusNote(null);
      setIsRolling(true);
    } else if (ev.kind === "toss-all") {
      handleTrayRoll(ev.throwDir);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (settingsOpen || document.querySelector('[role="dialog"]')) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON"
      ) {
        return;
      }
      e.preventDefault();
      handleTrayRoll();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleTrayRoll, settingsOpen]);

  const handSummary =
    buildPlanFromHand(hand, modifier, advMode).plan?.label ?? "1d20";
  const hasCustomHand =
    BUILDER_DICE.some((d) => hand[d.type] > 0) ||
    modifier !== 0 ||
    advMode !== "normal";

  const trayReadyHint =
    deckTab === "spell" && lastSpellPlanRef.current
      ? lastSpellPlanRef.current.label
      : handSummary;

  const hasDiceInTray = Boolean(latestRoll || isRolling || isHoldingDie);

  return (
    <div className="space-y-6">
      {/* Clean Side-by-Side Tabletop Workbench: Tray + Breakdown on Left, Control Deck on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 cols): 3D Dice Tray + Live Breakdown */}
        <div className="lg:col-span-7 space-y-5">
          {/* 3D Physical Dice Tray Stage (Unobstructed Viewport with Integrated Top & Bottom Frame Bars) */}
          <section
            aria-label="3D physical dice tray"
            className="rounded-lg border border-limestone dark:border-charcoal-border bg-[#181614] overflow-hidden shadow-sm"
          >
            {/* Integrated Top Readout & Utility Bar — fixed single-row height so UI never shifts */}
            <div className="h-12 px-3 sm:px-3.5 border-b border-white/10 bg-[#1B1816] flex items-center justify-between gap-2.5 flex-nowrap text-[#FBF9F5]">
              {/* Live Result Readout */}
              <div className="min-w-0 flex-1 flex items-baseline gap-2 overflow-hidden">
                {isHoldingDie ? (
                  <>
                    <span className="font-serif text-base font-semibold leading-none text-amber-300 whitespace-nowrap shrink-0">
                      Holding die
                    </span>
                    <span className="text-xs text-stone-400 truncate min-w-0">
                      {isHeldConcealed
                        ? diceSettings.gentleDropMode === "put-back"
                          ? "Numbers hidden · flick to toss, drop gently to put back"
                          : "Numbers hidden · release or flick to roll"
                        : "Flick to toss · drop gently to put back"}
                    </span>
                  </>
                ) : isRolling ? (
                  <>
                    <span className="text-xs font-mono text-stone-400 whitespace-nowrap shrink-0">
                      Rolling
                    </span>
                    <span className="font-serif text-base font-semibold leading-none truncate min-w-0">
                      {activeLabel || trayReadyHint}
                    </span>
                  </>
                ) : latestRoll ? (
                  <>
                    <span className="font-serif text-2xl font-semibold tabular-nums leading-none whitespace-nowrap shrink-0">
                      {latestRoll.total}
                    </span>
                    {trayStatusNote ? (
                      <span className="text-xs text-amber-300/90 truncate min-w-0">
                        {trayStatusNote}
                      </span>
                    ) : (
                      <>
                        {latestRoll.showHalf && (
                          <span className="text-xs font-mono text-stone-300 whitespace-nowrap shrink-0">
                            Half {Math.floor(latestRoll.total / 2)}
                          </span>
                        )}
                        {latestRoll.nat20 && (
                          <span className="text-xs font-semibold text-amber-400 whitespace-nowrap shrink-0">
                            Nat 20
                          </span>
                        )}
                        {latestRoll.nat1 && (
                          <span className="text-xs font-semibold text-orange-400 whitespace-nowrap shrink-0">
                            Nat 1
                          </span>
                        )}
                        <span className="text-xs font-mono text-stone-400 truncate min-w-0">
                          {latestRoll.label}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-serif text-base font-semibold leading-none whitespace-nowrap shrink-0">
                      Dice Tray
                    </span>
                    <span className="text-xs text-stone-400 truncate min-w-0">
                      {trayStatusNote || trayReadyHint}
                    </span>
                  </>
                )}
              </div>

              {/* Reroll All, Settings, Mute & Clear Controls */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => latestRoll && executePlan(latestRoll.plan)}
                  disabled={!latestRoll || isRolling}
                  title="Reroll all dice (Space)"
                  className="h-7 px-2 sm:px-2.5 inline-flex items-center gap-1.5 rounded border border-white/18 bg-white/8 text-xs font-medium text-[#FBF9F5] hover:bg-white/15 disabled:opacity-35 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="sm:hidden">Reroll</span>
                  <span className="hidden sm:inline">Reroll All</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Dice randomness and drop settings"
                  title="Dice settings"
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-stone-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-label={muted ? "Unmute dice sound" : "Mute dice sound"}
                  title={muted ? "Sound muted" : "Sound on"}
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-stone-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleClearTray}
                  disabled={!hasDiceInTray}
                  aria-label="Clear dice from tray"
                  title="Clear tray"
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-stone-300 hover:text-white hover:bg-white/10 disabled:opacity-35 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Dedicated 100% Unobstructed WebGL Canvas Container */}
            <div
              ref={canvasMountRef}
              className="w-full h-[310px] sm:h-[395px] lg:h-[420px] select-none touch-none"
            />

            {/* Fixed Single-Row Footer: Mode Summary, Gesture Guide & Dice Finishes */}
            <div className="h-9 px-3 sm:px-3.5 border-t border-white/8 bg-[#151311] flex items-center justify-between gap-3 flex-nowrap text-[11px] text-stone-400">
              <div className="min-w-0 flex-1 flex items-center gap-2 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  title="Change randomness engine or drop behavior"
                  className="font-mono text-stone-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
                >
                  {diceSettings.randomnessEngine === "hybrid"
                    ? "Crypto Hybrid"
                    : "Pure Physics"}
                  {" · "}
                  {diceSettings.gentleDropMode === "put-back"
                    ? "Put Back"
                    : "Concealed Drop"}
                </button>
                <span className="hidden md:inline text-stone-600" aria-hidden="true">
                  /
                </span>
                <span className="hidden md:inline truncate min-w-0">
                  {hasDiceInTray
                    ? "Click die to reroll · Hold to drag · Swipe felt to roll"
                    : `Click or swipe felt to roll ${trayReadyHint}`}
                </span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div
                  className="flex items-center gap-1.5"
                  role="group"
                  aria-label="Dice finish"
                >
                  {FINISH_LIST.map((id) => {
                    const theme = DICE_FINISHES[id];
                    const active = finishId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFinishId(id)}
                        aria-label={`Dice finish: ${theme.label}`}
                        title={theme.label}
                        className={`h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border transition-transform ${
                          active
                            ? "border-amber-300 scale-110 ring-1 ring-amber-300"
                            : "border-white/30 hover:scale-105"
                        }`}
                        style={{ backgroundColor: theme.swatchHex }}
                      />
                    );
                  })}
                </div>

                <span className="hidden md:inline font-mono text-stone-500 pl-2.5 border-l border-white/10 whitespace-nowrap">
                  Space · Reroll
                </span>
              </div>
            </div>
          </section>

          {/* Current Roll Breakdown (Always right under the tray) */}
          <section
            aria-label="Current roll breakdown"
            className="rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian p-4 space-y-3"
          >
            <div className="min-w-0">
              <h2 className="font-serif text-base font-semibold text-ink dark:text-parchment">
                Roll Breakdown
              </h2>
              <p className="text-xs text-ink-muted dark:text-ash">
                {latestRoll
                  ? "Click any die here or in the tray to reroll just that die."
                  : "Roll dice or cast a spell to inspect individual dice here."}
              </p>
            </div>

            {latestRoll && (
              <>
                <div className="flex flex-wrap gap-2">
                  {latestRoll.dice.map((die) => {
                    const isTrayHovered = hoveredTrayGroupId === die.groupId;
                    return (
                      <button
                        key={die.groupId}
                        type="button"
                        disabled={isRolling}
                        onClick={() => handleRerollSingleDie(die.groupId)}
                        onMouseEnter={() =>
                          sceneRef.current?.setHighlightedGroup(die.groupId)
                        }
                        onMouseLeave={() =>
                          sceneRef.current?.setHighlightedGroup(null)
                        }
                        onFocus={() =>
                          sceneRef.current?.setHighlightedGroup(die.groupId)
                        }
                        onBlur={() =>
                          sceneRef.current?.setHighlightedGroup(null)
                        }
                        title={`Click to reroll this ${die.die}`}
                        className={`group rounded-md border px-2.5 py-1.5 text-left transition-colors disabled:opacity-50 ${
                          isTrayHovered
                            ? "border-lapis dark:border-lapis-dark ring-1 ring-lapis/50 dark:ring-lapis-dark/50 bg-linen/90 dark:bg-soot"
                            : die.dropped
                            ? "border-limestone/60 dark:border-charcoal-border/60 bg-linen/30 dark:bg-soot/40 opacity-55 hover:opacity-85"
                            : die.isCritMax
                            ? "border-lapis dark:border-lapis-dark bg-linen/70 dark:bg-soot"
                            : die.isCritMin
                            ? "border-sienna/60 dark:border-brass/60 bg-linen/50 dark:bg-soot"
                            : "border-limestone dark:border-charcoal-border bg-linen/40 dark:bg-soot/70 hover:border-lapis dark:hover:border-lapis-dark"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-ink-muted dark:text-ash">
                          <span>
                            {die.sign === -1 ? `−${die.die}` : die.die}
                          </span>
                          <RotateCcw
                            className={`w-3 h-3 transition-opacity text-lapis dark:text-lapis-dark ${
                              isTrayHovered
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100"
                            }`}
                          />
                        </div>
                      <div
                        className={`font-serif text-xl font-semibold tabular-nums leading-tight ${
                          die.dropped
                            ? "line-through text-ink-muted dark:text-ash"
                            : die.isCritMax
                            ? "text-lapis dark:text-lapis-dark"
                            : die.isCritMin
                            ? "text-sienna dark:text-brass"
                            : "text-ink dark:text-parchment"
                        }`}
                      >
                        {die.value}
                      </div>
                        {die.detailLabel && (
                          <div className="text-[10px] font-mono text-ink-muted dark:text-ash">
                            {die.detailLabel}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2.5 border-t border-limestone/80 dark:border-charcoal-border/80 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="font-mono text-ink-muted dark:text-ash truncate">
                    {latestRoll.label}
                    {latestRoll.modifier !== 0
                      ? ` (mod ${
                          latestRoll.modifier > 0
                            ? `+${latestRoll.modifier}`
                            : latestRoll.modifier
                        })`
                      : ""}
                  </span>
                  <div className="flex items-baseline gap-3 font-mono tabular-nums">
                    {latestRoll.showHalf && (
                      <span className="text-ink-muted dark:text-ash">
                        Half = {Math.floor(latestRoll.total / 2)}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-ink dark:text-parchment">
                      Total = {latestRoll.total}
                    </span>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN (5 cols, sticky): Unified 2-Mode Control Deck */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24 rounded-lg border border-limestone dark:border-charcoal-border bg-linen/60 dark:bg-soot overflow-hidden">
          {/* Mode Switcher Tabs: Manual Dice | Cast Spell */}
          <div
            role="tablist"
            aria-label="Dice roller mode"
            className="grid grid-cols-2 border-b border-limestone dark:border-charcoal-border bg-paper/60 dark:bg-obsidian/60"
          >
            <button
              type="button"
              role="tab"
              aria-selected={deckTab === "manual"}
              onClick={() => {
                setDeckTab("manual");
                setFormulaError(null);
              }}
              className={`h-11 px-3 inline-flex items-center justify-center gap-2 text-sm font-medium border-b-2 transition-colors ${
                deckTab === "manual"
                  ? "border-lapis dark:border-lapis-dark text-ink dark:text-parchment bg-linen/60 dark:bg-soot"
                  : "border-transparent text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
              }`}
            >
              <Dices className="w-4 h-4" />
              <span>Manual Dice</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={deckTab === "spell"}
              onClick={() => {
                setDeckTab("spell");
                setFormulaError(null);
              }}
              className={`h-11 px-3 inline-flex items-center justify-center gap-2 text-sm font-medium border-b-2 transition-colors ${
                deckTab === "spell"
                  ? "border-sienna dark:border-brass text-ink dark:text-parchment bg-linen/60 dark:bg-soot"
                  : "border-transparent text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Cast Spell</span>
            </button>
          </div>

          <div className="p-4">
            {deckTab === "manual" ? (
              <div className="space-y-4">
                {/* Polyhedra Grid */}
                <div className="grid grid-cols-4 gap-2">
                  {BUILDER_DICE.map((die) => {
                    const count = hand[die.type];
                    const isSelected = count > 0;
                    return (
                      <div
                        key={die.type}
                        className={`relative rounded-md border transition-colors ${
                          isSelected
                            ? "border-lapis dark:border-lapis-dark bg-paper dark:bg-obsidian"
                            : "border-limestone dark:border-charcoal-border bg-paper/70 dark:bg-obsidian/70 hover:border-lapis/60 dark:hover:border-lapis-dark/60"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => adjustHandDie(die.type, 1)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            adjustHandDie(die.type, -1);
                          }}
                          title={`Click to add ${die.label}, right-click to remove`}
                          className="w-full h-11 px-2 flex flex-col items-center justify-center leading-tight"
                        >
                          <span
                            className={`font-mono text-sm font-semibold ${
                              isSelected
                                ? "text-lapis dark:text-lapis-dark"
                                : "text-ink dark:text-parchment"
                            }`}
                          >
                            {count > 0 ? `${count}${die.label}` : die.label}
                          </span>
                        </button>
                        {count > 0 && (
                          <button
                            type="button"
                            onClick={() => adjustHandDie(die.type, -1)}
                            aria-label={`Remove one ${die.label}`}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot text-[11px] font-mono text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment flex items-center justify-center shadow-xs"
                          >
                            −
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Clear Hand tile in the 8th slot */}
                  <button
                    type="button"
                    onClick={() => {
                      setHand(createEmptyHand());
                      setModifier(0);
                      setAdvMode("normal");
                      setFormulaError(null);
                    }}
                    disabled={!hasCustomHand}
                    title="Clear selected dice and modifier"
                    className="h-11 px-2 rounded-md border border-dashed border-limestone dark:border-charcoal-border text-xs font-medium text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-paper/60 dark:hover:bg-obsidian/60 disabled:opacity-40 transition-colors"
                  >
                    Clear
                  </button>
                </div>

                {/* Advantage / Normal / Disadvantage + Modifier Row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    role="group"
                    aria-label="d20 roll mode"
                    className="inline-flex rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian p-0.5"
                  >
                    {(
                      [
                        { id: "advantage", label: "Adv" },
                        { id: "normal", label: "Normal" },
                        { id: "disadvantage", label: "Dis" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setAdvMode(m.id)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          advMode === m.id
                            ? "bg-lapis text-white dark:bg-lapis-dark dark:text-obsidian"
                            : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="inline-flex items-center gap-1.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian px-2 py-1">
                    <span className="text-xs text-ink-muted dark:text-ash pr-0.5">
                      Mod
                    </span>
                    <button
                      type="button"
                      onClick={() => setModifier((m) => Math.max(-20, m - 1))}
                      aria-label="Decrease roll modifier"
                      className="h-6 w-6 rounded border border-limestone dark:border-charcoal-border text-xs font-mono text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot"
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-mono tabular-nums text-xs font-semibold text-ink dark:text-parchment">
                      {modifier >= 0 ? `+${modifier}` : modifier}
                    </span>
                    <button
                      type="button"
                      onClick={() => setModifier((m) => Math.min(30, m + 1))}
                      aria-label="Increase roll modifier"
                      className="h-6 w-6 rounded border border-limestone dark:border-charcoal-border text-xs font-mono text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Primary Roll Button right inside the deck */}
                <button
                  type="button"
                  onClick={() => handleRollHand()}
                  className="w-full h-11 px-4 inline-flex items-center justify-center gap-2 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-sm font-medium transition-colors"
                >
                  <Dices className="w-4 h-4" />
                  <span>Roll {handSummary}</span>
                </button>

                {/* Instant 1-Click Quick Rolls */}
                <div className="pt-3 border-t border-limestone/80 dark:border-charcoal-border/80 space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted dark:text-ash">
                    Instant Rolls
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_INSTANT_ROLLS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleInstantPreset(preset.formula)}
                        className="h-7 px-2.5 rounded border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-mono font-medium text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:border-lapis dark:hover:border-lapis-dark transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Formula Input */}
                <form
                  onSubmit={handleFormulaSubmit}
                  className="pt-3 border-t border-limestone/80 dark:border-charcoal-border/80 space-y-1.5"
                >
                  <label
                    htmlFor="custom-dice-formula"
                    className="block text-[11px] font-medium uppercase tracking-wider text-ink-muted dark:text-ash"
                  >
                    Custom Formula
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="custom-dice-formula"
                      type="text"
                      value={formulaInput}
                      onChange={(e) => {
                        setFormulaInput(e.target.value);
                        if (formulaError) setFormulaError(null);
                      }}
                      placeholder="e.g. 2d20kh1+7 or 1d8+1d6+4"
                      className="flex-1 h-9 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian px-2.5 text-xs font-mono text-ink dark:text-parchment placeholder:text-ink-muted/70 dark:placeholder:text-ash/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
                    />
                    <button
                      type="submit"
                      disabled={!formulaInput.trim()}
                      className="h-9 px-3 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-medium text-ink dark:text-parchment hover:border-lapis dark:hover:border-lapis-dark hover:text-lapis dark:hover:text-lapis-dark disabled:opacity-40 transition-colors whitespace-nowrap"
                    >
                      Go
                    </button>
                  </div>
                </form>

                {formulaError && (
                  <p className="text-xs text-sienna dark:text-brass">
                    {formulaError}
                  </p>
                )}
              </div>
            ) : (
              <SpellCastTrayPanel
                catalog={catalog}
                knownSpells={knownSpells}
                rolledSpells={rolledSpells}
                casterLevel={casterLevel}
                slotState={slotState}
                advMode={advMode}
                onChangeAdvMode={setAdvMode}
                selectedSpell={selectedSpell}
                onSelectSpell={handleSelectSpellManual}
                initialCastLevel={handoffMeta?.castLevel}
                castAlreadySpent={handoffMeta?.alreadyCast}
                handoffSeq={handoffMeta?.seq}
                onRollFormula={handleSpellFormulaRoll}
                onCastSpell={onCastSpell}
                onOpenSpell={onOpenSpell}
              />
            )}
          </div>
        </aside>
      </div>

      {/* Collapsible Recent Rolls Log (Appears last, defaults to collapsed) */}
      {history.length > 0 && (
        <section
          aria-label="Recent dice rolls"
          className="rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian overflow-hidden"
        >
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <button
              type="button"
              aria-expanded={recentRollsOpen}
              onClick={() => setRecentRollsOpen((prev) => !prev)}
              className="flex-1 min-w-0 flex items-center gap-2 text-left group"
            >
              <ChevronDown
                className={`w-4 h-4 text-ink-muted dark:text-ash transition-transform shrink-0 ${
                  recentRollsOpen ? "rotate-0" : "-rotate-90"
                }`}
              />
              <h2 className="font-serif text-base font-semibold text-ink dark:text-parchment group-hover:text-lapis dark:group-hover:text-lapis-dark transition-colors">
                Recent Rolls
              </h2>
              <span className="text-xs font-mono text-ink-muted dark:text-ash tabular-nums">
                ({history.length})
              </span>
            </button>

            {recentRollsOpen && (
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  setRecentRollsOpen(false);
                }}
                className="text-xs font-medium text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment transition-colors shrink-0"
              >
                Clear
              </button>
            )}
          </div>

          {recentRollsOpen && (
            <ul className="px-4 pb-3 border-t border-limestone/70 dark:border-charcoal-border/70 divide-y divide-limestone/70 dark:divide-charcoal-border/70">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-serif text-base font-semibold tabular-nums text-ink dark:text-parchment">
                        {entry.total}
                      </span>
                      <span className="text-xs font-mono text-ink-muted dark:text-ash truncate">
                        {entry.label}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-ink-muted dark:text-ash truncate">
                      {entry.rolledAt} · [
                      {entry.dice
                        .map((d) =>
                          d.dropped ? `~${d.value}~` : String(d.value)
                        )
                        .join(", ")}
                      ]
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isRolling}
                    onClick={() => executePlan(entry.plan)}
                    className="h-7 px-2.5 rounded border border-limestone dark:border-charcoal-border text-xs font-medium text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:border-lapis dark:hover:border-lapis-dark disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                  >
                    Roll Again
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <DiceSettingsModal
        isOpen={settingsOpen}
        settings={diceSettings}
        onChange={handleUpdateDiceSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};
