import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from "firebase/auth";
import { X } from "lucide-react";
import {
  AppView,
  GrimoireSnapshot,
  LevelShortfall,
  RandomizerConfig,
  RollHistoryEntry,
  Spell,
  SpellSlotState,
  StoredRingSpell,
  ThemeMode,
} from "./types/spell";
import {
  createZeroSlotMap,
  CUSTOM_CATALOG_KEY,
  DEFAULT_CONFIG,
  DEFAULT_SPELL_SLOTS,
  getDefaultSpellSlots,
  LOCAL_STORAGE_KEY,
  SPELL_LEVELS,
  THEME_STORAGE_KEY,
} from "./lib/constants";
import {
  filterSpellPool,
  getEffectiveMaxSlots,
  getRingUsedLevels,
  MAX_ROLL_HISTORY,
  parseSpellsCSV,
  rerollSingleSpell,
  RING_MAX_LEVELS,
  rollRandomSpells,
  sanitizeConcentrationSpell,
  sanitizeConfig,
  sanitizeRingSpells,
  sanitizeRollHistory,
  sanitizeSpellSlots,
  sanitizeStringList,
  validateImportPayload,
} from "./lib/spellEngine";
import {
  auth,
  isCloudSyncConfigured,
  isUnauthorizedDomainError,
  loadCloudGrimoire,
  loadLegacyPermanentSpells,
  saveCloudGrimoire,
  testFirestoreConnection,
} from "./lib/firebaseClient";
import { TopBar } from "./components/TopBar";
import { SpellbookView } from "./components/SpellbookView";
import { RingOfSpellStoringView } from "./components/RingOfSpellStoringView";
import { RulesView } from "./components/RulesView";
import { SpellPoolView } from "./components/SpellPoolView";
import { SpellReaderModal } from "./components/SpellReaderModal";

interface ToastMessage {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

function areSpellListsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].toLowerCase() !== b[i].toLowerCase()) return false;
  }
  return true;
}

function pushRollSnapshot(
  history: RollHistoryEntry[],
  names: string[]
): RollHistoryEntry[] {
  if (names.length === 0) return history;
  if (
    history.length > 0 &&
    areSpellListsEqual(history[0].rolledSpellNames, names)
  ) {
    return history;
  }
  const entry: RollHistoryEntry = {
    id: `roll-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    rolledSpellNames: [...names],
    rolledAt: new Date().toISOString(),
  };
  return [entry, ...history].slice(0, MAX_ROLL_HISTORY);
}

function cloneSlotState(slots: SpellSlotState): SpellSlotState {
  return {
    useCustomMax: slots.useCustomMax,
    max: { ...slots.max },
    used: { ...slots.used },
  };
}

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function createEmptyLocalSnapshot(): GrimoireSnapshot {
  return {
    knownSpellNames: [],
    rolledSpellNames: [],
    ringSpells: [],
    spellSlots: cloneSlotState(DEFAULT_SPELL_SLOTS),
    concentrationSpell: null,
    rollHistory: [],
    config: { ...DEFAULT_CONFIG },
    updatedAt: new Date().toISOString(),
  };
}

function loadLocalSnapshot(): GrimoireSnapshot {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return createEmptyLocalSnapshot();
    }
    const parsed = JSON.parse(raw);
    const cleanConfig = sanitizeConfig(parsed.config);
    return {
      knownSpellNames: sanitizeStringList(parsed.knownSpellNames, 400),
      rolledSpellNames: sanitizeStringList(parsed.rolledSpellNames, 100),
      ringSpells: sanitizeRingSpells(parsed.ringSpells),
      spellSlots: sanitizeSpellSlots(
        parsed.spellSlots,
        cleanConfig.casterLevel
      ),
      concentrationSpell: sanitizeConcentrationSpell(parsed.concentrationSpell),
      rollHistory: sanitizeRollHistory(parsed.rollHistory),
      config: cleanConfig,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return createEmptyLocalSnapshot();
  }
}

export default function App() {
  const initialLocal = useMemo(() => loadLocalSnapshot(), []);

  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [activeView, setActiveView] = useState<AppView>("spellbook");

  // Spell Catalog
  const [catalog, setCatalog] = useState<Spell[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isCustomCatalog, setIsCustomCatalog] = useState(false);

  // Spellbook, Slots, History & Ring State
  const [knownSpellNames, setKnownSpellNames] = useState<string[]>(
    initialLocal.knownSpellNames
  );
  const [rolledSpellNames, setRolledSpellNames] = useState<string[]>(
    initialLocal.rolledSpellNames
  );
  const [ringSpells, setRingSpells] = useState<StoredRingSpell[]>(
    initialLocal.ringSpells
  );
  const [spellSlots, setSpellSlots] = useState<SpellSlotState>(
    initialLocal.spellSlots
  );
  const [concentrationSpell, setConcentrationSpell] = useState<string | null>(
    initialLocal.concentrationSpell
  );
  const [rollHistory, setRollHistory] = useState<RollHistoryEntry[]>(
    initialLocal.rollHistory
  );
  const [config, setConfig] = useState<RandomizerConfig>(initialLocal.config);
  const [shortfalls, setShortfalls] = useState<LevelShortfall[]>([]);
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(null);
  const [lastSlotFlash, setLastSlotFlash] = useState<{
    level: number;
    seq: number;
  } | null>(null);

  // Cloud Auth & Sync State
  const [cloudSyncAvailable, setCloudSyncAvailable] = useState<boolean>(
    isCloudSyncConfigured
  );
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string | null>(null);
  const [legacyCloudSpells, setLegacyCloudSpells] = useState<string[] | null>(
    null
  );

  // Toast feedback
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback(
    (text: string, actionLabel?: string, onAction?: () => void) => {
      const id = Date.now();
      setToast({ id, text, actionLabel, onAction });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Sync light/dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Load bundled or custom CSV catalog
  const loadBundledCatalog = useCallback(async () => {
    setIsCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}spells.csv`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseSpellsCSV(text);
      if (parsed.length === 0) {
        throw new Error("Bundled spells CSV did not contain any valid rows.");
      }
      setCatalog(parsed);
      setIsCustomCatalog(false);
    } catch (err) {
      console.error("Failed to load bundled spells CSV:", err);
      setCatalogError(
        "Unable to load the bundled spell catalog. You can retry or upload a 5eTools CSV in Rules."
      );
    } finally {
      setIsCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedCsv = localStorage.getItem(CUSTOM_CATALOG_KEY);
    if (storedCsv) {
      try {
        const parsed = parseSpellsCSV(storedCsv);
        if (parsed.length > 0) {
          setCatalog(parsed);
          setIsCustomCatalog(true);
          setIsCatalogLoading(false);
          return;
        }
      } catch {
        localStorage.removeItem(CUSTOM_CATALOG_KEY);
      }
    }
    loadBundledCatalog();
  }, [loadBundledCatalog]);

  // Keep default spell slot table aligned with casterLevel when not customized
  useEffect(() => {
    setSpellSlots((prev) => {
      if (prev.useCustomMax) return prev;
      const nextMax = getDefaultSpellSlots(config.casterLevel);
      let changed = false;
      const nextUsed: Record<string, number> = { ...prev.used };
      for (let lvl = 1; lvl <= 9; lvl++) {
        const key = String(lvl);
        if (prev.max[key] !== nextMax[key]) changed = true;
        const clampedUsed = Math.min(
          nextMax[key] ?? 0,
          Math.max(0, prev.used[key] ?? 0)
        );
        if (clampedUsed !== (prev.used[key] ?? 0)) {
          nextUsed[key] = clampedUsed;
          changed = true;
        }
      }
      if (!changed) return prev;
      return {
        useCustomMax: false,
        max: nextMax,
        used: nextUsed,
      };
    });
  }, [config.casterLevel]);

  // Persist local state automatically
  useEffect(() => {
    const snapshot: GrimoireSnapshot = {
      knownSpellNames,
      rolledSpellNames,
      ringSpells,
      spellSlots,
      concentrationSpell,
      rollHistory,
      config,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      console.error("Failed to save state locally:", err);
    }
  }, [
    knownSpellNames,
    rolledSpellNames,
    ringSpells,
    spellSlots,
    concentrationSpell,
    rollHistory,
    config,
  ]);

  // Validate Firestore connection once on boot & subscribe to auth state
  useEffect(() => {
    if (!auth || !isCloudSyncConfigured) return;

    testFirestoreConnection();

    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setLegacyCloudSpells(null);

      if (!user) {
        setLastSyncedLabel(null);
        return;
      }

      try {
        const [cloudSave, legacySpells] = await Promise.all([
          loadCloudGrimoire(user.uid),
          loadLegacyPermanentSpells(user.uid).catch(() => null),
        ]);

        if (legacySpells && legacySpells.length > 0) {
          setLegacyCloudSpells(legacySpells);
        }

        if (cloudSave) {
          const ts = new Date(cloudSave.updatedAt);
          setLastSyncedLabel(
            Number.isNaN(ts.getTime())
              ? "Cloud save found"
              : ts.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
          );

          // Auto-hydrate if local workspace is empty so mobile/tablet pickup is seamless
          const localIsEmpty =
            knownSpellNames.length === 0 &&
            rolledSpellNames.length === 0 &&
            ringSpells.length === 0;
          if (localIsEmpty) {
            setKnownSpellNames(cloudSave.knownSpellNames);
            setRolledSpellNames(cloudSave.rolledSpellNames);
            setRingSpells(cloudSave.ringSpells);
            setSpellSlots(cloudSave.spellSlots);
            setConcentrationSpell(cloudSave.concentrationSpell);
            setRollHistory(cloudSave.rollHistory);
            setConfig(cloudSave.config);
            showToast("Loaded saved spells from Google Cloud.");
          }
        }
      } catch (err) {
        console.error("Error checking cloud save:", err);
      }
    });

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fast catalog lookup map by lowercase spell name
  const catalogByName = useMemo(() => {
    const map = new Map<string, Spell>();
    for (const spell of catalog) {
      const key = spell.name.toLowerCase();
      if (!map.has(key)) map.set(key, spell);
    }
    return map;
  }, [catalog]);

  const knownSpells = useMemo(() => {
    return knownSpellNames
      .map((name) => catalogByName.get(name.toLowerCase()))
      .filter((s): s is Spell => Boolean(s));
  }, [knownSpellNames, catalogByName]);

  const rolledSpells = useMemo(() => {
    const knownSet = new Set(knownSpellNames.map((n) => n.toLowerCase()));
    return rolledSpellNames
      .filter((name) => !knownSet.has(name.toLowerCase()))
      .map((name) => catalogByName.get(name.toLowerCase()))
      .filter((s): s is Spell => Boolean(s));
  }, [rolledSpellNames, knownSpellNames, catalogByName]);

  const eligiblePool = useMemo(
    () => filterSpellPool(catalog, config),
    [catalog, config]
  );

  // Handlers
  const handleRollAll = () => {
    if (catalog.length === 0) {
      showToast("No spell catalog loaded yet.");
      return;
    }
    const previousRolled = [...rolledSpellNames];
    const previousShortfalls = [...shortfalls];
    const previousHistory = [...rollHistory];

    const result = rollRandomSpells(catalog, knownSpellNames, config);
    const nextHistory =
      previousRolled.length > 0
        ? pushRollSnapshot(rollHistory, previousRolled)
        : rollHistory;

    setRolledSpellNames(result.rolledNames);
    setShortfalls(result.shortfalls);
    setRollHistory(nextHistory);

    if (activeView !== "spellbook") {
      setActiveView("spellbook");
    }

    const undoRoll = () => {
      setRolledSpellNames(previousRolled);
      setShortfalls(previousShortfalls);
      setRollHistory(previousHistory);
    };

    if (result.rolledNames.length === 0) {
      if (previousRolled.length > 0) {
        showToast(
          "No spells rolled — check your level quotas or filters.",
          "Undo",
          undoRoll
        );
      } else {
        showToast("No spells rolled — check your level quotas or filters.");
      }
    } else {
      showToast(
        `Rolled ${result.rolledNames.length} spell${
          result.rolledNames.length === 1 ? "" : "s"
        }.`,
        "Undo",
        undoRoll
      );
    }
  };

  const handleClearRolled = () => {
    const previous = [...rolledSpellNames];
    const previousShortfalls = [...shortfalls];
    setRolledSpellNames([]);
    setShortfalls([]);
    showToast("Cleared rolled spells.", "Undo", () => {
      setRolledSpellNames(previous);
      setShortfalls(previousShortfalls);
    });
  };

  const handleRerollSingle = (spellName: string) => {
    const previousRolled = [...rolledSpellNames];
    const previousSelected = selectedSpell;

    const { nextRolledNames, replacedSpell } = rerollSingleSpell(
      catalog,
      knownSpellNames,
      rolledSpellNames,
      spellName,
      config
    );

    if (!replacedSpell) {
      showToast(
        `No other eligible spells remain at that level to replace ${spellName}.`
      );
      return;
    }

    setRolledSpellNames(nextRolledNames);
    const wasSelected = Boolean(
      selectedSpell &&
        selectedSpell.name.toLowerCase() === spellName.toLowerCase()
    );
    if (wasSelected) {
      setSelectedSpell(replacedSpell);
    }
    showToast(`Rerolled ${spellName} → ${replacedSpell.name}`, "Undo", () => {
      setRolledSpellNames(previousRolled);
      if (wasSelected && previousSelected) {
        setSelectedSpell((current) =>
          current &&
          current.name.toLowerCase() === replacedSpell.name.toLowerCase()
            ? previousSelected
            : current
        );
      }
    });
  };

  const handleRestoreRollHistory = (entryId: string) => {
    const target = rollHistory.find((entry) => entry.id === entryId);
    if (!target) return;

    const previousRolled = [...rolledSpellNames];
    const previousHistory = [...rollHistory];
    const remainingHistory = rollHistory.filter((entry) => entry.id !== entryId);
    const nextHistory =
      previousRolled.length > 0
        ? pushRollSnapshot(remainingHistory, previousRolled)
        : remainingHistory;

    setRolledSpellNames(target.rolledSpellNames);
    setShortfalls([]);
    setRollHistory(nextHistory);

    showToast(
      `Restored ${target.rolledSpellNames.length} rolled spell${
        target.rolledSpellNames.length === 1 ? "" : "s"
      }.`,
      "Undo",
      () => {
        setRolledSpellNames(previousRolled);
        setRollHistory(previousHistory);
      }
    );
  };

  const handleClearRollHistory = () => {
    const previousHistory = [...rollHistory];
    setRollHistory([]);
    showToast("Cleared roll history.", "Undo", () => {
      setRollHistory(previousHistory);
    });
  };

  const handleToggleKnown = (spellName: string) => {
    const lower = spellName.toLowerCase();
    const exists = knownSpellNames.some((n) => n.toLowerCase() === lower);

    if (exists) {
      setKnownSpellNames((prev) =>
        prev.filter((n) => n.toLowerCase() !== lower)
      );
      showToast(`Removed ${spellName} from Known Spells.`, "Undo", () => {
        setKnownSpellNames((prev) =>
          prev.some((n) => n.toLowerCase() === lower)
            ? prev
            : [...prev, spellName]
        );
      });
    } else {
      setKnownSpellNames((prev) => [...prev, spellName]);
      setRolledSpellNames((prev) =>
        prev.filter((n) => n.toLowerCase() !== lower)
      );
      showToast(`Locked ${spellName} as a Known Spell.`);
    }
  };

  const handleAddKnownSpell = (spellName: string) => {
    const lower = spellName.toLowerCase();
    if (knownSpellNames.some((n) => n.toLowerCase() === lower)) return;
    setKnownSpellNames((prev) => [...prev, spellName]);
    setRolledSpellNames((prev) =>
      prev.filter((n) => n.toLowerCase() !== lower)
    );
    showToast(`Added ${spellName} to Known Spells.`);
  };

  const triggerSlotFlash = (level: number) => {
    const seq = Date.now() + Math.random();
    setLastSlotFlash({ level, seq });
    window.setTimeout(() => {
      setLastSlotFlash((curr) => (curr?.seq === seq ? null : curr));
    }, 650);
  };

  // Spell Slot & Concentration Handlers
  const handleExpendSlot = (level: number) => {
    const key = String(level);
    const effectiveMax = getEffectiveMaxSlots(spellSlots, config.casterLevel);
    const max = effectiveMax[key] ?? 0;
    const currentUsed = Math.min(max, Math.max(0, spellSlots.used[key] ?? 0));
    if (currentUsed >= max) return;

    setSpellSlots((prev) => ({
      ...prev,
      used: {
        ...prev.used,
        [key]: currentUsed + 1,
      },
    }));
    triggerSlotFlash(level);
  };

  const handleRecoverSlot = (level: number) => {
    const key = String(level);
    setSpellSlots((prev) => {
      const currentUsed = prev.used[key] ?? 0;
      if (currentUsed <= 0) return prev;
      return {
        ...prev,
        used: {
          ...prev.used,
          [key]: currentUsed - 1,
        },
      };
    });
  };

  const handleSetCustomMaxSlot = (level: number, nextMax: number) => {
    const key = String(level);
    const clamped = Math.max(0, Math.min(9, Math.round(nextMax)));
    setSpellSlots((prev) => {
      const baseMax = getEffectiveMaxSlots(prev, config.casterLevel);
      const updatedMax = {
        ...baseMax,
        [key]: clamped,
      };
      const updatedUsed = {
        ...prev.used,
        [key]: Math.min(clamped, Math.max(0, prev.used[key] ?? 0)),
      };
      return {
        useCustomMax: true,
        max: updatedMax,
        used: updatedUsed,
      };
    });
  };

  const handleResetSlotDefaults = () => {
    const nextMax = getDefaultSpellSlots(config.casterLevel);
    setSpellSlots((prev) => {
      const nextUsed: Record<string, number> = {};
      for (let lvl = 1; lvl <= 9; lvl++) {
        const key = String(lvl);
        nextUsed[key] = Math.min(
          nextMax[key] ?? 0,
          Math.max(0, prev.used[key] ?? 0)
        );
      }
      return {
        useCustomMax: false,
        max: nextMax,
        used: nextUsed,
      };
    });
    showToast(`Reset max slots to Level ${config.casterLevel} defaults.`);
  };

  const handleLongRest = () => {
    const previousSlots = cloneSlotState(spellSlots);
    const previousConc = concentrationSpell;

    setSpellSlots((prev) => ({
      ...prev,
      used: createZeroSlotMap(),
    }));
    setConcentrationSpell(null);

    const msg = previousConc
      ? `Long rest complete — slots restored and dropped ${previousConc}.`
      : "Long rest complete — all spell slots restored.";
    showToast(msg, "Undo", () => {
      setSpellSlots(previousSlots);
      setConcentrationSpell(previousConc);
    });
  };

  const handleSetConcentration = (spellName: string | null) => {
    const previousConc = concentrationSpell;
    setConcentrationSpell(spellName);

    if (spellName) {
      const replaced =
        previousConc && previousConc.toLowerCase() !== spellName.toLowerCase();
      showToast(
        replaced
          ? `Concentrating on ${spellName} (dropped ${previousConc}).`
          : `Concentrating on ${spellName}.`,
        "Undo",
        () => setConcentrationSpell(previousConc)
      );
    } else if (previousConc) {
      showToast(`Dropped concentration on ${previousConc}.`, "Undo", () =>
        setConcentrationSpell(previousConc)
      );
    }
  };

  const handleDropConcentration = () => {
    handleSetConcentration(null);
  };

  const handleCastSpell = (spell: Spell, slotLevel: number | null) => {
    const previousSlots = cloneSlotState(spellSlots);
    const previousConc = concentrationSpell;

    if (slotLevel !== null) {
      const key = String(slotLevel);
      const effectiveMax = getEffectiveMaxSlots(spellSlots, config.casterLevel);
      const max = effectiveMax[key] ?? 0;
      const currentUsed = Math.min(max, Math.max(0, spellSlots.used[key] ?? 0));
      if (currentUsed >= max) {
        showToast(
          `No ${SPELL_LEVELS[slotLevel]?.shortLabel}-level spell slots remaining.`
        );
        return;
      }
      setSpellSlots((prev) => ({
        ...prev,
        used: {
          ...prev.used,
          [key]: currentUsed + 1,
        },
      }));
      triggerSlotFlash(slotLevel);
    }

    if (spell.isConcentration) {
      setConcentrationSpell(spell.name);
    }

    const baseMessage =
      spell.levelIndex === 0
        ? `Cast ${spell.name} (cantrip).`
        : slotLevel === null
        ? `Cast ${spell.name} as a ritual.`
        : `Cast ${spell.name} (${SPELL_LEVELS[slotLevel]?.shortLabel}-level slot).`;
    const replacedConc =
      spell.isConcentration &&
      previousConc &&
      previousConc.toLowerCase() !== spell.name.toLowerCase();
    const fullMessage = replacedConc
      ? `${baseMessage} Dropped ${previousConc}.`
      : baseMessage;

    const stateChanged = slotLevel !== null || spell.isConcentration;
    if (stateChanged) {
      showToast(fullMessage, "Undo", () => {
        setSpellSlots(previousSlots);
        setConcentrationSpell(previousConc);
      });
    } else {
      showToast(fullMessage);
    }
  };

  // Ring of Spell Storing Handlers
  const ringUsedLevels = useMemo(
    () => getRingUsedLevels(ringSpells),
    [ringSpells]
  );
  const ringRemainingLevels = Math.max(0, RING_MAX_LEVELS - ringUsedLevels);

  const handleStoreRingSpell = (entry: Omit<StoredRingSpell, "id">) => {
    if (ringUsedLevels + entry.castLevel > RING_MAX_LEVELS) {
      showToast("Not enough spell levels left in the Ring of Spell Storing.");
      return;
    }
    const id = `ring-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setRingSpells((prev) => [...prev, { ...entry, id }]);
    showToast(`Stored ${entry.spellName} in Ring of Spell Storing.`);
  };

  const handleQuickStoreInRing = (spell: Spell) => {
    if (spell.levelIndex < 1 || spell.levelIndex > RING_MAX_LEVELS) return;
    if (spell.levelIndex > ringRemainingLevels) {
      showToast("Not enough spell levels left in the Ring of Spell Storing.");
      return;
    }
    handleStoreRingSpell({
      spellName: spell.name,
      castLevel: spell.levelIndex,
      casterName: "",
      saveDC: "",
      attackBonus: "",
      notes: "",
    });
  };

  const handleCastRingSpell = (entryId: string) => {
    const target = ringSpells.find((s) => s.id === entryId);
    if (!target) return;
    const previousRing = [...ringSpells];
    const previousConc = concentrationSpell;
    const spellObj = catalogByName.get(target.spellName.toLowerCase());

    setRingSpells((prev) => prev.filter((s) => s.id !== entryId));
    if (spellObj?.isConcentration) {
      setConcentrationSpell(spellObj.name);
    }

    const replacedConc =
      spellObj?.isConcentration &&
      previousConc &&
      previousConc.toLowerCase() !== spellObj.name.toLowerCase();
    const message = replacedConc
      ? `Cast ${target.spellName} from the ring. Dropped ${previousConc}.`
      : spellObj?.isConcentration
      ? `Cast ${target.spellName} from the ring (concentrating).`
      : `Cast ${target.spellName} from the ring.`;

    showToast(message, "Undo", () => {
      setRingSpells(previousRing);
      setConcentrationSpell(previousConc);
    });
  };

  const handleClearRing = () => {
    const previous = [...ringSpells];
    setRingSpells([]);
    showToast("Cleared Ring of Spell Storing.", "Undo", () => {
      setRingSpells(previous);
    });
  };

  // CSV Upload & Reset
  const handleUploadCsv = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseSpellsCSV(text);
      if (parsed.length === 0) {
        showToast("That CSV didn't contain any recognized 5eTools spell rows.");
        return;
      }
      setCatalog(parsed);
      setIsCustomCatalog(true);
      try {
        localStorage.setItem(CUSTOM_CATALOG_KEY, text);
      } catch {
        // Large CSVs may exceed localStorage quota; keep in session memory
      }
      showToast(`Loaded ${parsed.length} spells from ${file.name}.`);
    } catch {
      showToast("Could not read that CSV file.");
    }
  };

  const handleResetCatalog = () => {
    localStorage.removeItem(CUSTOM_CATALOG_KEY);
    loadBundledCatalog();
    showToast("Restored bundled 5eTools spell catalog.");
  };

  // Cloud Sync Handlers
  const handleSignIn = async () => {
    if (!auth || !cloudSyncAvailable) return;
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      if (isUnauthorizedDomainError(err)) {
        setCloudSyncAvailable(false);
        showToast(
          "Google sign-in is not authorized for this domain. Local auto-save and JSON backup remain active."
        );
        return;
      }
      console.error("Google sign-in failed:", err);
      showToast("Google sign-in was cancelled or blocked.");
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    await signOut(auth);
    showToast("Signed out. Local auto-save remains active.");
  };

  const handleSaveCloud = async () => {
    if (!authUser) return;
    setIsSyncing(true);
    try {
      await saveCloudGrimoire(authUser.uid, {
        knownSpellNames,
        rolledSpellNames,
        ringSpells,
        spellSlots,
        concentrationSpell,
        rollHistory,
        config,
        updatedAt: new Date().toISOString(),
      });
      const nowLabel = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      setLastSyncedLabel(nowLabel);
      showToast("Saved to Google Cloud.");
    } catch (err) {
      console.error("Cloud save failed:", err);
      showToast("Cloud save failed. Check your connection and try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLoadCloud = async () => {
    if (!authUser) return;
    setIsSyncing(true);
    try {
      const cloudSave = await loadCloudGrimoire(authUser.uid);
      if (!cloudSave) {
        showToast("No cloud save found yet. Save first to create one.");
        return;
      }
      setKnownSpellNames(cloudSave.knownSpellNames);
      setRolledSpellNames(cloudSave.rolledSpellNames);
      setRingSpells(cloudSave.ringSpells);
      setSpellSlots(cloudSave.spellSlots);
      setConcentrationSpell(cloudSave.concentrationSpell);
      setRollHistory(cloudSave.rollHistory);
      setConfig(cloudSave.config);
      setShortfalls([]);
      const ts = new Date(cloudSave.updatedAt);
      setLastSyncedLabel(
        Number.isNaN(ts.getTime())
          ? "Synced"
          : ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
      showToast("Loaded from Google Cloud.");
    } catch (err) {
      console.error("Cloud load failed:", err);
      showToast("Could not load cloud save.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportLegacyCloud = () => {
    if (!legacyCloudSpells || legacyCloudSpells.length === 0) return;
    const existingLower = new Set(knownSpellNames.map((n) => n.toLowerCase()));
    const toAdd = legacyCloudSpells.filter(
      (name) => !existingLower.has(name.toLowerCase())
    );
    if (toAdd.length === 0) {
      showToast("All legacy locked spells are already in your Known Spells.");
      return;
    }
    setKnownSpellNames((prev) => [...prev, ...toAdd]);
    showToast(
      `Imported ${toAdd.length} locked spell${
        toAdd.length === 1 ? "" : "s"
      } from your previous save.`
    );
  };

  // JSON Export & Import
  const handleExportJson = () => {
    const snapshot: GrimoireSnapshot = {
      knownSpellNames,
      rolledSpellNames,
      ringSpells,
      spellSlots,
      concentrationSpell,
      rollHistory,
      config,
      updatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `spell-randomizer-${dateStamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded JSON backup.");
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validated = validateImportPayload(parsed);
      if (!validated) {
        showToast("That file is not a valid backup.");
        return;
      }
      setKnownSpellNames(validated.knownSpellNames);
      setRolledSpellNames(validated.rolledSpellNames);
      setRingSpells(validated.ringSpells);
      setSpellSlots(validated.spellSlots);
      setConcentrationSpell(validated.concentrationSpell);
      setRollHistory(validated.rollHistory);
      setConfig(validated.config);
      setShortfalls([]);
      showToast("Restored backup from JSON.");
    } catch {
      showToast("Could not parse that JSON backup file.");
    }
  };

  const selectedIsKnown = selectedSpell
    ? knownSpellNames.some(
        (n) => n.toLowerCase() === selectedSpell.name.toLowerCase()
      )
    : false;
  const selectedIsRolled = selectedSpell
    ? rolledSpellNames.some(
        (n) => n.toLowerCase() === selectedSpell.name.toLowerCase()
      )
    : false;

  return (
    <div className="min-h-screen bg-paper dark:bg-obsidian text-ink dark:text-parchment flex flex-col">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onRollAll={handleRollAll}
        theme={theme}
        onToggleTheme={() =>
          setTheme((prev) => (prev === "dark" ? "light" : "dark"))
        }
        cloudSyncAvailable={cloudSyncAvailable}
        authUser={authUser}
        isSyncing={isSyncing}
        lastSyncedLabel={lastSyncedLabel}
        hasLegacyCloudSave={Boolean(
          legacyCloudSpells && legacyCloudSpells.length > 0
        )}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onSaveCloud={handleSaveCloud}
        onLoadCloud={handleLoadCloud}
        onImportLegacyCloud={handleImportLegacyCloud}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        poolCount={eligiblePool.length}
        ringUsedLevels={ringUsedLevels}
      />

      <main className="flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {isCatalogLoading ? (
          <div className="space-y-6 py-8" aria-busy="true">
            <div className="h-9 w-64 rounded bg-linen dark:bg-soot animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-24 rounded-lg border border-limestone dark:border-charcoal-border bg-linen/50 dark:bg-soot/60 animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : catalogError ? (
          <div className="max-w-lg mx-auto my-12 p-6 rounded-lg border border-limestone dark:border-charcoal-border bg-linen dark:bg-soot space-y-4">
            <h2 className="font-serif text-xl font-semibold">
              Spell Catalog Unavailable
            </h2>
            <p className="text-sm text-ink-muted dark:text-ash leading-relaxed">
              {catalogError}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={loadBundledCatalog}
                className="h-10 px-4 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian text-sm font-medium transition-colors"
              >
                Retry Loading
              </button>
              <button
                type="button"
                onClick={() => setActiveView("rules")}
                className="h-10 px-4 rounded-md border border-limestone dark:border-charcoal-border text-sm font-medium hover:bg-paper dark:hover:bg-obsidian transition-colors"
              >
                Upload Custom CSV
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeView === "spellbook" && (
              <SpellbookView
                catalog={catalog}
                knownSpells={knownSpells}
                rolledSpells={rolledSpells}
                eligiblePoolCount={eligiblePool.length}
                config={config}
                shortfalls={shortfalls}
                slotState={spellSlots}
                concentrationSpell={concentrationSpell}
                rollHistory={rollHistory}
                lastSlotFlash={lastSlotFlash}
                onRollAll={handleRollAll}
                onClearRolled={handleClearRolled}
                onRerollSingle={handleRerollSingle}
                onToggleKnown={handleToggleKnown}
                onAddKnownSpell={handleAddKnownSpell}
                onOpenSpell={setSelectedSpell}
                onUpdateConfig={setConfig}
                onOpenRules={() => setActiveView("rules")}
                onCastSpell={handleCastSpell}
                onExpendSlot={handleExpendSlot}
                onRecoverSlot={handleRecoverSlot}
                onSetCustomMaxSlot={handleSetCustomMaxSlot}
                onResetSlotDefaults={handleResetSlotDefaults}
                onLongRest={handleLongRest}
                onDropConcentration={handleDropConcentration}
                onRestoreRollHistory={handleRestoreRollHistory}
                onClearRollHistory={handleClearRollHistory}
              />
            )}

            {activeView === "ring" && (
              <RingOfSpellStoringView
                catalog={catalog}
                knownSpells={knownSpells}
                rolledSpells={rolledSpells}
                ringSpells={ringSpells}
                onStoreSpell={handleStoreRingSpell}
                onCastStoredSpell={handleCastRingSpell}
                onClearRing={handleClearRing}
                onOpenSpell={setSelectedSpell}
              />
            )}

            {activeView === "rules" && (
              <RulesView
                config={config}
                catalog={catalog}
                eligiblePool={eligiblePool}
                knownSpellNames={knownSpellNames}
                isCustomCatalog={isCustomCatalog}
                onUpdateConfig={setConfig}
                onUploadCsv={handleUploadCsv}
                onResetCatalog={handleResetCatalog}
              />
            )}

            {activeView === "pool" && (
              <SpellPoolView
                eligiblePool={eligiblePool}
                knownSpellNames={knownSpellNames}
                config={config}
                onOpenSpell={setSelectedSpell}
                onToggleKnown={handleToggleKnown}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-limestone dark:border-charcoal-border py-5 px-4 sm:px-6">
        <div className="max-w-[1320px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-ink-muted dark:text-ash">
          <p>D&amp;D 5e Spell Randomizer</p>
          <p className="font-mono tabular-nums">
            {catalog.length} spells loaded ·{" "}
            {authUser ? "Cloud Sync Ready" : "Saved Locally"}
          </p>
        </div>
      </footer>

      <SpellReaderModal
        spell={selectedSpell}
        isKnown={selectedIsKnown}
        isRolled={selectedIsRolled}
        ringRemainingLevels={ringRemainingLevels}
        casterLevel={config.casterLevel}
        canRitualCast={config.canRitualCast}
        slotState={spellSlots}
        concentrationSpell={concentrationSpell}
        onClose={() => setSelectedSpell(null)}
        onToggleKnown={handleToggleKnown}
        onReroll={handleRerollSingle}
        onQuickStoreInRing={handleQuickStoreInRing}
        onCastSpell={handleCastSpell}
        onSetConcentration={handleSetConcentration}
      />

      {/* Non-intrusive Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-limestone dark:border-charcoal-border bg-ink text-paper dark:bg-parchment dark:text-obsidian shadow-xl px-4 py-3 flex items-center gap-3 text-sm"
        >
          <span className="flex-1 leading-snug">{toast.text}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                setToast(null);
              }}
              className="font-semibold underline underline-offset-2 whitespace-nowrap"
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="p-0.5 opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
