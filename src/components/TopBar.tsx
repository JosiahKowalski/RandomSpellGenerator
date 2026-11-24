import React, { useEffect, useRef, useState } from "react";
import { User as FirebaseUser } from "firebase/auth";
import {
  BookOpen,
  Check,
  ChevronDown,
  Cloud,
  CloudUpload,
  Dices,
  Download,
  Gem,
  History,
  Layers,
  LogIn,
  LogOut,
  Moon,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Upload,
} from "lucide-react";
import { AppView, ThemeMode } from "../types/spell";

interface TopBarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onRollAll: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  cloudSyncAvailable: boolean;
  authUser: FirebaseUser | null;
  isSyncing: boolean;
  lastSyncedLabel: string | null;
  hasLegacyCloudSave: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onSaveCloud: () => void;
  onLoadCloud: () => void;
  onImportLegacyCloud: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  poolCount: number;
  ringUsedLevels: number;
}

const SPELLS_VIEWS: AppView[] = ["spellbook", "metamagic", "ring"];
const SETUP_VIEWS: AppView[] = ["pool", "rules"];

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onSelectView,
  onRollAll,
  theme,
  onToggleTheme,
  cloudSyncAvailable,
  authUser,
  isSyncing,
  lastSyncedLabel,
  hasLegacyCloudSave,
  onSignIn,
  onSignOut,
  onSaveCloud,
  onLoadCloud,
  onImportLegacyCloud,
  onExportJson,
  onImportJson,
  poolCount,
  ringUsedLevels,
}) => {
  const [openMenu, setOpenMenu] = useState<
    "spells" | "setup" | "workspace" | null
  >(null);
  const spellsRef = useRef<HTMLDivElement>(null);
  const setupRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const activeRef =
        openMenu === "spells"
          ? spellsRef
          : openMenu === "setup"
          ? setupRef
          : workspaceRef;
      if (activeRef.current && !activeRef.current.contains(target)) {
        setOpenMenu(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  const isSpellsActive = SPELLS_VIEWS.includes(activeView);
  const isSetupActive = SETUP_VIEWS.includes(activeView);
  const isDiceActive = activeView === "dice";

  const handleSelectNav = (view: AppView) => {
    setOpenMenu(null);
    onSelectView(view);
  };

  return (
    <header className="sticky top-0 z-30 bg-paper/92 dark:bg-obsidian/92 backdrop-blur-md border-b border-limestone dark:border-charcoal-border">
      <div className="max-w-[1320px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Compact Archival Brand Lockup */}
        <button
          type="button"
          onClick={() => handleSelectNav("spellbook")}
          className="group inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
          aria-label="Spell Randomizer home"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="w-[18px] h-[18px] text-lapis dark:text-lapis-dark shrink-0 transition-transform duration-200 group-hover:rotate-12"
          >
            <polygon
              points="12 2.2 20.5 7.1 20.5 16.9 12 21.8 3.5 16.9 3.5 7.1"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <polygon
              points="12 6.6 16.8 14.9 7.2 14.9"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            <line
              x1="12"
              y1="2.2"
              x2="12"
              y2="6.6"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <line
              x1="3.5"
              y1="16.9"
              x2="7.2"
              y2="14.9"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <line
              x1="20.5"
              y1="16.9"
              x2="16.8"
              y2="14.9"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
          <span className="hidden sm:inline font-serif text-lg font-semibold tracking-tight text-ink dark:text-parchment">
            Spell Randomizer
          </span>
        </button>

        {/* Zone 2: Nested 3-Pillar Recessed Switcher (Works cleanly on desktop & mobile) */}
        <nav
          aria-label="Primary workspaces"
          className="inline-flex items-center gap-0.5 sm:gap-1 p-1 rounded-lg bg-linen dark:bg-soot border border-limestone/90 dark:border-charcoal-border"
        >
          {/* Group 1: Spells (Spellbook · Metamagic · Ring) */}
          <div className="relative" ref={spellsRef}>
            <button
              type="button"
              onClick={() =>
                setOpenMenu((prev) => (prev === "spells" ? null : "spells"))
              }
              aria-expanded={openMenu === "spells"}
              aria-haspopup="menu"
              aria-current={isSpellsActive ? "page" : undefined}
              className={`h-8 px-2.5 sm:px-3.5 inline-flex items-center gap-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
                isSpellsActive
                  ? "bg-paper dark:bg-obsidian text-ink dark:text-parchment shadow-xs"
                  : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
              }`}
            >
              <span>Spells</span>
              <ChevronDown
                className={`w-3.5 h-3.5 opacity-70 transition-transform duration-150 ${
                  openMenu === "spells" ? "rotate-180" : "rotate-0"
                }`}
              />
            </button>

            {openMenu === "spells" && (
              <div
                role="menu"
                className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 mt-2.5 w-64 rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot shadow-lg p-1.5 z-50"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectNav("spellbook")}
                  className={`w-full px-3 py-2.5 rounded-md text-left flex items-start justify-between gap-2.5 transition-colors ${
                    activeView === "spellbook"
                      ? "bg-linen dark:bg-obsidian text-ink dark:text-parchment"
                      : "hover:bg-linen/70 dark:hover:bg-obsidian/70 text-ink dark:text-parchment"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <BookOpen className="w-4 h-4 mt-0.5 text-lapis dark:text-lapis-dark shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">
                        Spellbook
                      </p>
                      <p className="text-xs text-ink-muted dark:text-ash mt-0.5 leading-snug">
                        Active spells, slots &amp; concentration
                      </p>
                    </div>
                  </div>
                  {activeView === "spellbook" && (
                    <Check className="w-3.5 h-3.5 mt-0.5 text-lapis dark:text-lapis-dark shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectNav("metamagic")}
                  className={`w-full px-3 py-2.5 rounded-md text-left flex items-start justify-between gap-2.5 transition-colors mt-0.5 ${
                    activeView === "metamagic"
                      ? "bg-linen dark:bg-obsidian text-ink dark:text-parchment"
                      : "hover:bg-linen/70 dark:hover:bg-obsidian/70 text-ink dark:text-parchment"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Sparkles className="w-4 h-4 mt-0.5 text-sienna dark:text-brass shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">
                        Metamagic
                      </p>
                      <p className="text-xs text-ink-muted dark:text-ash mt-0.5 leading-snug">
                        Sorcery points &amp; flexible casting
                      </p>
                    </div>
                  </div>
                  {activeView === "metamagic" && (
                    <Check className="w-3.5 h-3.5 mt-0.5 text-lapis dark:text-lapis-dark shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectNav("ring")}
                  className={`w-full px-3 py-2.5 rounded-md text-left flex items-start justify-between gap-2.5 transition-colors mt-0.5 ${
                    activeView === "ring"
                      ? "bg-linen dark:bg-obsidian text-ink dark:text-parchment"
                      : "hover:bg-linen/70 dark:hover:bg-obsidian/70 text-ink dark:text-parchment"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Gem className="w-4 h-4 mt-0.5 text-lapis dark:text-lapis-dark shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">
                        Ring of Spell Storing
                      </p>
                      <p className="text-xs text-ink-muted dark:text-ash mt-0.5 leading-snug">
                        Stored spells ready to cast
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-ink-muted dark:text-ash shrink-0 pt-0.5">
                    {ringUsedLevels}/5
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Pillar 2: Dice Tray (Direct 1-click access) */}
          <button
            type="button"
            onClick={() => handleSelectNav("dice")}
            aria-current={isDiceActive ? "page" : undefined}
            className={`h-8 px-2.5 sm:px-3.5 inline-flex items-center gap-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
              isDiceActive
                ? "bg-paper dark:bg-obsidian text-ink dark:text-parchment shadow-xs"
                : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
            }`}
          >
            <Dices className="w-3.5 h-3.5 opacity-80 hidden sm:inline" />
            <span>Dice</span>
          </button>

          {/* Group 3: Setup (Spell Pool · Randomizer Rules) */}
          <div className="relative" ref={setupRef}>
            <button
              type="button"
              onClick={() =>
                setOpenMenu((prev) => (prev === "setup" ? null : "setup"))
              }
              aria-expanded={openMenu === "setup"}
              aria-haspopup="menu"
              aria-current={isSetupActive ? "page" : undefined}
              className={`h-8 px-2.5 sm:px-3.5 inline-flex items-center gap-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
                isSetupActive
                  ? "bg-paper dark:bg-obsidian text-ink dark:text-parchment shadow-xs"
                  : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
              }`}
            >
              <span>Setup</span>
              <ChevronDown
                className={`w-3.5 h-3.5 opacity-70 transition-transform duration-150 ${
                  openMenu === "setup" ? "rotate-180" : "rotate-0"
                }`}
              />
            </button>

            {openMenu === "setup" && (
              <div
                role="menu"
                className="absolute right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 mt-2.5 w-64 rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot shadow-lg p-1.5 z-50"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectNav("pool")}
                  className={`w-full px-3 py-2.5 rounded-md text-left flex items-start justify-between gap-2.5 transition-colors ${
                    activeView === "pool"
                      ? "bg-linen dark:bg-obsidian text-ink dark:text-parchment"
                      : "hover:bg-linen/70 dark:hover:bg-obsidian/70 text-ink dark:text-parchment"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Layers className="w-4 h-4 mt-0.5 text-lapis dark:text-lapis-dark shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">
                        Spell Pool
                      </p>
                      <p className="text-xs text-ink-muted dark:text-ash mt-0.5 leading-snug">
                        Browse &amp; filter eligible catalog
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-ink-muted dark:text-ash shrink-0 pt-0.5">
                    {poolCount}
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectNav("rules")}
                  className={`w-full px-3 py-2.5 rounded-md text-left flex items-start justify-between gap-2.5 transition-colors mt-0.5 ${
                    activeView === "rules"
                      ? "bg-linen dark:bg-obsidian text-ink dark:text-parchment"
                      : "hover:bg-linen/70 dark:hover:bg-obsidian/70 text-ink dark:text-parchment"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <SlidersHorizontal className="w-4 h-4 mt-0.5 text-sienna dark:text-brass shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">
                        Randomizer Rules
                      </p>
                      <p className="text-xs text-ink-muted dark:text-ash mt-0.5 leading-snug">
                        Level quotas, weights &amp; CSV
                      </p>
                    </div>
                  </div>
                  {activeView === "rules" && (
                    <Check className="w-3.5 h-3.5 mt-0.5 text-lapis dark:text-lapis-dark shrink-0" />
                  )}
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Zone 3: Unified Workspace Menu (Theme + Cloud Sync + Backup) + Primary CTA */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="relative" ref={workspaceRef}>
            <button
              type="button"
              onClick={() =>
                setOpenMenu((prev) =>
                  prev === "workspace" ? null : "workspace"
                )
              }
              className={`h-9 w-9 sm:w-auto sm:px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark ${
                openMenu === "workspace"
                  ? "bg-linen dark:bg-soot text-ink dark:text-parchment"
                  : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot"
              }`}
              aria-expanded={openMenu === "workspace"}
              aria-haspopup="menu"
              aria-label="Sync, backup, and appearance"
              title="Sync, backup, and appearance"
            >
              <Cloud className="w-4 h-4" />
              <ChevronDown
                className={`hidden sm:inline w-3 h-3 opacity-70 transition-transform duration-150 ${
                  openMenu === "workspace" ? "rotate-180" : "rotate-0"
                }`}
              />
            </button>

            {openMenu === "workspace" && (
              <div
                role="menu"
                className="absolute right-0 mt-2.5 w-72 rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot shadow-lg p-3 space-y-3 z-50"
              >
                {/* Appearance Switch nested cleanly inside Workspace Menu */}
                <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-limestone dark:border-charcoal-border">
                  <span className="text-xs font-medium text-ink dark:text-parchment">
                    Appearance
                  </span>
                  <div
                    role="group"
                    aria-label="Color theme"
                    className="inline-flex items-center rounded-md bg-linen dark:bg-obsidian p-0.5 border border-limestone/80 dark:border-charcoal-border"
                  >
                    <button
                      type="button"
                      onClick={() => theme === "dark" && onToggleTheme()}
                      className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded text-xs font-medium transition-colors ${
                        theme === "light"
                          ? "bg-paper text-ink shadow-xs"
                          : "text-ash hover:text-parchment"
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>Light</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => theme === "light" && onToggleTheme()}
                      className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded text-xs font-medium transition-colors ${
                        theme === "dark"
                          ? "bg-soot text-parchment shadow-xs"
                          : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Dark</span>
                    </button>
                  </div>
                </div>

                {/* Sync Status Header */}
                <div className="px-1">
                  <p className="text-xs font-medium text-ink dark:text-parchment">
                    {cloudSyncAvailable && authUser
                      ? "Google Cloud Sync"
                      : "Local Auto-Save Active"}
                  </p>
                  <p className="text-xs text-ink-muted dark:text-ash truncate mt-0.5">
                    {cloudSyncAvailable
                      ? authUser
                        ? authUser.email
                        : "Sign in to sync across devices"
                      : "Saved in this browser · Export JSON to transfer"}
                  </p>
                  {cloudSyncAvailable && authUser && lastSyncedLabel && (
                    <p className="text-[11px] font-mono text-ink-muted dark:text-ash mt-1">
                      Last synced: {lastSyncedLabel}
                    </p>
                  )}
                </div>

                {cloudSyncAvailable && (
                  <div className="space-y-1">
                    {authUser ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onSaveCloud();
                            setOpenMenu(null);
                          }}
                          disabled={isSyncing}
                          className="w-full px-2.5 py-2 rounded-md text-left text-sm flex items-center gap-2.5 hover:bg-linen dark:hover:bg-obsidian text-ink dark:text-parchment disabled:opacity-50 transition-colors"
                        >
                          <CloudUpload className="w-4 h-4 text-lapis dark:text-lapis-dark" />
                          <span>
                            {isSyncing ? "Saving to Cloud..." : "Save to Cloud"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onLoadCloud();
                            setOpenMenu(null);
                          }}
                          disabled={isSyncing}
                          className="w-full px-2.5 py-2 rounded-md text-left text-sm flex items-center gap-2.5 hover:bg-linen dark:hover:bg-obsidian text-ink dark:text-parchment disabled:opacity-50 transition-colors"
                        >
                          <RefreshCw className="w-4 h-4 text-ink-muted dark:text-ash" />
                          <span>Pull from Cloud</span>
                        </button>
                        {hasLegacyCloudSave && (
                          <button
                            type="button"
                            onClick={() => {
                              onImportLegacyCloud();
                              setOpenMenu(null);
                            }}
                            className="w-full px-2.5 py-2 rounded-md text-left text-sm flex items-center gap-2.5 hover:bg-linen dark:hover:bg-obsidian text-sienna dark:text-brass transition-colors"
                          >
                            <History className="w-4 h-4" />
                            <span>Import Legacy Locked Spells</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            onSignOut();
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-2 rounded-md text-left text-sm flex items-center gap-2.5 hover:bg-linen dark:hover:bg-obsidian text-ink-muted dark:text-ash transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSignIn();
                          setOpenMenu(null);
                        }}
                        className="w-full px-2.5 py-2 rounded-md text-left text-sm font-medium flex items-center gap-2.5 hover:bg-linen dark:hover:bg-obsidian text-lapis dark:text-lapis-dark transition-colors"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Sign in with Google</span>
                      </button>
                    )}
                  </div>
                )}

                <div
                  className={`${
                    cloudSyncAvailable
                      ? "border-t border-limestone dark:border-charcoal-border pt-2"
                      : ""
                  } space-y-1`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onExportJson();
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-2 rounded-md text-left text-sm flex items-center gap-2.5 hover:bg-linen dark:hover:bg-obsidian text-ink dark:text-parchment transition-colors"
                  >
                    <Download className="w-4 h-4 text-ink-muted dark:text-ash" />
                    <span>Export Backup JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-2.5 py-2 rounded-md text-left text-sm flex items-center gap-2.5 hover:bg-linen dark:hover:bg-obsidian text-ink dark:text-parchment transition-colors"
                  >
                    <Upload className="w-4 h-4 text-ink-muted dark:text-ash" />
                    <span>Import Backup JSON</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        onImportJson(file);
                        setOpenMenu(null);
                      }
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onRollAll}
            title="Roll random spells into your Spellbook"
            className="h-9 px-3 sm:px-3.5 inline-flex items-center gap-1.5 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Roll Spells</span>
            <span className="sm:hidden">Roll</span>
          </button>
        </div>
      </div>
    </header>
  );
};

interface WorkspaceSubNavProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  poolCount: number;
  ringUsedLevels: number;
}

/**
 * Non-sticky contextual sub-navigation strip shown inside nested menu groups
 * (Spells: Spellbook / Metamagic / Ring; Setup: Spell Pool / Rules).
 * Absent on standalone views like Dice to preserve full viewport focus.
 */
export const WorkspaceSubNav: React.FC<WorkspaceSubNavProps> = ({
  activeView,
  onSelectView,
  poolCount,
  ringUsedLevels,
}) => {
  const isSpells = SPELLS_VIEWS.includes(activeView);
  const isSetup = SETUP_VIEWS.includes(activeView);

  if (!isSpells && !isSetup) return null;

  const items: Array<{ id: AppView; label: string; meta?: string }> = isSpells
    ? [
        { id: "spellbook", label: "Spellbook" },
        { id: "metamagic", label: "Metamagic" },
        {
          id: "ring",
          label: "Ring of Spell Storing",
          meta: `${ringUsedLevels}/5`,
        },
      ]
    : [
        { id: "pool", label: "Spell Pool", meta: String(poolCount) },
        { id: "rules", label: "Randomizer Rules" },
      ];

  return (
    <nav
      aria-label={isSpells ? "Spells sections" : "Setup sections"}
      className="mb-6 -mt-2 border-b border-limestone dark:border-charcoal-border flex items-center gap-5 sm:gap-7 overflow-x-auto scrollbar-none"
    >
      {items.map((item) => {
        const active = activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectView(item.id)}
            aria-current={active ? "page" : undefined}
            className={`relative pb-2.5 inline-flex items-baseline gap-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:text-lapis dark:focus-visible:text-lapis-dark ${
              active
                ? "text-ink dark:text-parchment"
                : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
            }`}
          >
            <span>{item.label}</span>
            {item.meta && (
              <span className="font-mono text-xs tabular-nums text-ink-muted/80 dark:text-ash/80">
                {item.meta}
              </span>
            )}
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 right-0 bottom-0 h-[2px] bg-lapis dark:bg-lapis-dark"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
};
