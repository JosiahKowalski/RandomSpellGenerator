import React, { useEffect, useRef, useState } from "react";
import { User as FirebaseUser } from "firebase/auth";
import {
  Cloud,
  CloudUpload,
  Download,
  History,
  LogIn,
  LogOut,
  Moon,
  RefreshCw,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleOutside);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  const navItems: Array<{ id: AppView; label: string }> = [
    { id: "spellbook", label: "Spellbook" },
    { id: "ring", label: `Ring (${ringUsedLevels}/5)` },
    { id: "rules", label: "Rules" },
    { id: "pool", label: `Spell Pool (${poolCount})` },
  ];

  return (
    <header className="sticky top-0 z-30 bg-paper/95 dark:bg-obsidian/95 backdrop-blur-sm border-b border-limestone dark:border-charcoal-border">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Clean single-element Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectView("spellbook")}
          className="font-serif text-xl font-semibold tracking-tight text-ink dark:text-parchment whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark rounded"
        >
          Spell Randomizer
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7"
        >
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark rounded ${
                  isActive
                    ? "text-ink dark:text-parchment"
                    : "text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment"
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute left-0 right-0 -bottom-[13px] h-[2px] bg-lapis dark:bg-lapis-dark" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Focused utility triggers + Primary Roll CTA */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            className="h-10 w-10 inline-flex items-center justify-center rounded-md border border-limestone dark:border-charcoal-border text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {/* Sync & Backup Menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="h-10 px-3 inline-flex items-center gap-2 rounded-md border border-limestone dark:border-charcoal-border text-xs sm:text-sm font-medium text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <Cloud className="w-4 h-4 text-ink-muted dark:text-ash" />
              <span className="hidden sm:inline">
                {cloudSyncAvailable && authUser ? "Sync" : "Save"}
              </span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-72 rounded-lg border border-limestone dark:border-charcoal-border bg-paper dark:bg-soot shadow-lg p-3 space-y-3 z-50"
              >
                <div className="px-2 py-1 border-b border-limestone dark:border-charcoal-border pb-2.5">
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
                            setMenuOpen(false);
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
                            setMenuOpen(false);
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
                              setMenuOpen(false);
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
                            setMenuOpen(false);
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
                          setMenuOpen(false);
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
                      setMenuOpen(false);
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
                        setMenuOpen(false);
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
            className="h-10 px-4 inline-flex items-center gap-2 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-lapis dark:focus-visible:ring-lapis-dark"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Roll Spells</span>
          </button>
        </div>
      </div>

      {/* Compact Mobile Navigation Row */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden border-t border-limestone dark:border-charcoal-border px-4 flex items-center justify-around"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`py-2.5 px-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "border-lapis dark:border-lapis-dark text-ink dark:text-parchment"
                  : "border-transparent text-ink-muted dark:text-ash"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
