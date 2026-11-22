import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Dices, ExternalLink, Lock, Plus, RefreshCw, Unlock, X } from "lucide-react";
import { Spell, SpellSlotState } from "../types/spell";
import { SPELL_LEVELS } from "../lib/constants";
import { getEffectiveMaxSlots, getSpell5eToolsUrl } from "../lib/spellEngine";
import { parseSpellRolls } from "../lib/spellRollParser";

interface SpellReaderModalProps {
  spell: Spell | null;
  isKnown: boolean;
  isRolled: boolean;
  ringRemainingLevels: number;
  casterLevel: number;
  canRitualCast: boolean;
  slotState: SpellSlotState;
  concentrationSpell: string | null;
  onClose: () => void;
  onToggleKnown: (spellName: string) => void;
  onReroll?: (spellName: string) => void;
  onQuickStoreInRing?: (spell: Spell) => void;
  onCastSpell?: (spell: Spell, slotLevel: number | null) => void;
  onSetConcentration?: (spellName: string | null) => void;
  onRollSpellInTray?: (spell: Spell) => void;
}

const NUMERIC_COLUMN_HEADER =
  /^(d\d+|stage|hp|ac|str|dex|save modifier|mishap|similar area|off target|on target)$/i;
const TABLE_SEPARATOR_LINE = /^\|?(\s*:?-{3,}:?\s*\|)+\s*$/;

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

const SpellDescription: React.FC<{ text: string }> = ({ text }) => {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3.5">
      {blocks.map((block, blockIdx) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        // Pipe table (with or without a preceding title line)
        const hasDirectTable =
          lines.length >= 2 &&
          lines[0].includes("|") &&
          TABLE_SEPARATOR_LINE.test(lines[1]);
        const hasCaptionedTable =
          lines.length >= 3 &&
          !lines[0].includes("|") &&
          lines[1].includes("|") &&
          TABLE_SEPARATOR_LINE.test(lines[2]);

        if (hasDirectTable || hasCaptionedTable) {
          const caption = hasCaptionedTable ? lines[0] : null;
          const headerIdx = hasCaptionedTable ? 1 : 0;
          const headers = parseTableRow(lines[headerIdx]);
          const rows = lines
            .slice(headerIdx + 2)
            .filter((line) => line.includes("|"))
            .map(parseTableRow);

          return (
            <div key={blockIdx} className="my-1">
              {caption && (
                <div className="text-xs font-semibold text-ink-muted dark:text-ash mb-1.5">
                  {caption}
                </div>
              )}
              <div className="overflow-x-auto rounded-md border border-limestone dark:border-charcoal-border">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-linen/80 dark:bg-obsidian/80 border-b border-limestone dark:border-charcoal-border">
                      {headers.map((header, colIdx) => (
                        <th
                          key={colIdx}
                          className={`px-3 py-2 text-left text-xs font-semibold text-ink dark:text-parchment ${
                            NUMERIC_COLUMN_HEADER.test(header)
                              ? "whitespace-nowrap"
                              : ""
                          }`}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-limestone/70 dark:divide-charcoal-border/70">
                    {rows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="bg-paper dark:bg-soot even:bg-linen/30 dark:even:bg-obsidian/30"
                      >
                        {headers.map((header, colIdx) => {
                          const cell = row[colIdx] ?? "";
                          const isNumericCol =
                            NUMERIC_COLUMN_HEADER.test(header);
                          return (
                            <td
                              key={colIdx}
                              className={`px-3 py-2 align-top text-ink dark:text-parchment leading-relaxed ${
                                isNumericCol
                                  ? "font-mono text-xs tabular-nums whitespace-nowrap"
                                  : ""
                              }`}
                            >
                              {cell}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        // Bullet list block
        if (lines.length > 0 && lines.every((line) => line.startsWith("- "))) {
          return (
            <ul
              key={blockIdx}
              className="list-disc pl-5 space-y-1.5 text-[15px] leading-[1.7] text-ink dark:text-parchment marker:text-ink-muted dark:marker:text-ash"
            >
              {lines.map((line, itemIdx) => (
                <li key={itemIdx}>{line.slice(2)}</li>
              ))}
            </ul>
          );
        }

        // Regular paragraph
        return (
          <p
            key={blockIdx}
            className="text-[15px] leading-[1.7] text-ink dark:text-parchment whitespace-pre-wrap"
          >
            {block}
          </p>
        );
      })}
    </div>
  );
};

export const SpellReaderModal: React.FC<SpellReaderModalProps> = ({
  spell,
  isKnown,
  isRolled,
  ringRemainingLevels,
  casterLevel,
  canRitualCast,
  slotState,
  concentrationSpell,
  onClose,
  onToggleKnown,
  onReroll,
  onQuickStoreInRing,
  onCastSpell,
  onSetConcentration,
  onRollSpellInTray,
}) => {
  const effectiveMax = useMemo(
    () => getEffectiveMaxSlots(slotState, casterLevel),
    [slotState, casterLevel]
  );

  const availableSlotLevels = useMemo(() => {
    if (!spell || spell.levelIndex === 0) return [];
    const options: Array<{ level: number; remaining: number; max: number }> = [];
    for (let lvl = spell.levelIndex; lvl <= 9; lvl++) {
      const key = String(lvl);
      const max = effectiveMax[key] ?? 0;
      const used = Math.min(max, Math.max(0, slotState.used[key] ?? 0));
      const remaining = Math.max(0, max - used);
      if (remaining > 0) {
        options.push({ level: lvl, remaining, max });
      }
    }
    return options;
  }, [spell, effectiveMax, slotState.used]);

  const [selectedCastLevel, setSelectedCastLevel] = useState<number>(1);

  useEffect(() => {
    if (availableSlotLevels.length > 0) {
      setSelectedCastLevel(availableSlotLevels[0].level);
    } else if (spell) {
      setSelectedCastLevel(Math.max(1, spell.levelIndex));
    }
  }, [spell, availableSlotLevels]);

  useEffect(() => {
    if (!spell) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [spell, onClose]);

  const hasTrayRolls = useMemo(
    () => (spell ? parseSpellRolls(spell).hasAnyRoll : false),
    [spell]
  );

  if (!spell || typeof document === "undefined") return null;

  const isConcentratingOnThis = Boolean(
    concentrationSpell &&
      concentrationSpell.toLowerCase() === spell.name.toLowerCase()
  );
  const willReplaceConcentration = Boolean(
    spell.isConcentration && concentrationSpell && !isConcentratingOnThis
  );
  const chosenSlotOption =
    availableSlotLevels.find((opt) => opt.level === selectedCastLevel) ||
    availableSlotLevels[0] ||
    null;

  const levelMeta = SPELL_LEVELS[spell.levelIndex];
  const levelDescriptor =
    spell.levelIndex === 0
      ? `${spell.school} cantrip`
      : `${levelMeta?.shortLabel}-level ${spell.school.toLowerCase()}`;

  const classList = [spell.classes, spell.optionalVariantClasses]
    .filter(Boolean)
    .join(", ");

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spell-reader-title"
    >
      <div
        className="absolute inset-0 bg-stone-950/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-2xl max-h-[88vh] flex flex-col bg-paper dark:bg-soot border border-limestone dark:border-charcoal-border rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-limestone dark:border-charcoal-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted dark:text-ash">
              <span className="capitalize">{levelDescriptor}</span>
              <span aria-hidden="true">·</span>
              <span>
                {isKnown
                  ? "Known Spell"
                  : isRolled
                  ? "Rolled Spell"
                  : "Spell Pool"}
              </span>
              {spell.source && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {spell.source}
                    {spell.page ? ` p.${spell.page}` : ""}
                  </span>
                </>
              )}
            </div>
            <h2
              id="spell-reader-title"
              className="font-serif text-2xl sm:text-3xl font-semibold text-ink dark:text-parchment mt-1"
            >
              {spell.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close spell details"
            className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-md border border-limestone dark:border-charcoal-border text-ink-muted dark:text-ash hover:text-ink dark:hover:text-parchment hover:bg-linen dark:hover:bg-obsidian transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-6">
          {/* Structured Spell Facts Grid */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-limestone dark:border-charcoal-border">
            <div>
              <dt className="text-xs font-medium text-ink-muted dark:text-ash">
                Casting Time
              </dt>
              <dd className="text-sm font-medium text-ink dark:text-parchment mt-1">
                {spell.castingTime || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted dark:text-ash">
                Range
              </dt>
              <dd className="text-sm font-medium text-ink dark:text-parchment mt-1">
                {spell.range || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted dark:text-ash">
                Duration
              </dt>
              <dd className="text-sm font-medium text-ink dark:text-parchment mt-1">
                {spell.duration || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted dark:text-ash">
                Components
              </dt>
              <dd className="text-sm font-medium text-ink dark:text-parchment mt-1 break-words">
                {spell.components || "—"}
              </dd>
            </div>
          </dl>

          {/* Main Spell Text */}
          <div className="max-w-prose space-y-4">
            {spell.text ? (
              <SpellDescription text={spell.text} />
            ) : (
              <p className="text-[15px] leading-[1.7] text-ink-muted dark:text-ash">
                No description provided in the loaded CSV.
              </p>
            )}

            {spell.atHigherLevels && (
              <div className="pt-4 border-t border-limestone dark:border-charcoal-border">
                <h3 className="font-serif text-base font-semibold text-ink dark:text-parchment mb-1.5">
                  At Higher Levels
                </h3>
                <p className="text-[15px] leading-[1.7] text-ink-muted dark:text-ash whitespace-pre-wrap">
                  {spell.atHigherLevels.replace(/^At Higher Levels\.\s*/i, "")}
                </p>
              </div>
            )}

            {classList && (
              <div className="pt-4 border-t border-limestone dark:border-charcoal-border text-xs text-ink-muted dark:text-ash leading-relaxed">
                <span className="font-medium text-ink dark:text-parchment">
                  Classes:{" "}
                </span>
                {classList}
              </div>
            )}
          </div>
        </div>

        {/* Tabletop Cast & Concentration Strip */}
        {((onCastSpell || onSetConcentration) &&
          (spell.levelIndex > 0 || spell.isConcentration) ||
          (onRollSpellInTray && hasTrayRolls)) && (
            <div className="px-6 py-3 border-t border-limestone dark:border-charcoal-border bg-paper dark:bg-soot flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {spell.levelIndex > 0 && onCastSpell && (
                  <>
                    {chosenSlotOption ? (
                      <>
                        {availableSlotLevels.length > 1 && (
                          <select
                            aria-label="Choose spell slot level"
                            value={chosenSlotOption.level}
                            onChange={(e) =>
                              setSelectedCastLevel(Number(e.target.value))
                            }
                            className="h-9 px-2.5 rounded-md border border-limestone dark:border-charcoal-border bg-linen/70 dark:bg-obsidian text-xs font-mono tabular-nums text-ink dark:text-parchment focus:outline-none focus:ring-2 focus:ring-lapis dark:focus:ring-lapis-dark"
                          >
                            {availableSlotLevels.map((opt) => (
                              <option key={opt.level} value={opt.level}>
                                {SPELL_LEVELS[opt.level]?.shortLabel} slot (
                                {opt.remaining}/{opt.max})
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            onCastSpell(spell, chosenSlotOption.level)
                          }
                          className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-xs font-medium transition-colors whitespace-nowrap"
                        >
                          <span>
                            Cast ({SPELL_LEVELS[chosenSlotOption.level]?.shortLabel})
                          </span>
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-ink-muted dark:text-ash">
                        No {SPELL_LEVELS[spell.levelIndex]?.shortLabel}+ slots left
                      </span>
                    )}

                    {canRitualCast && spell.isRitual && (
                      <button
                        type="button"
                        onClick={() => onCastSpell(spell, null)}
                        className="h-9 px-3 inline-flex items-center rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-medium text-ink dark:text-parchment hover:bg-linen dark:hover:bg-soot transition-colors whitespace-nowrap"
                      >
                        Cast as Ritual
                      </button>
                    )}
                  </>
                )}

                {spell.isConcentration && onSetConcentration && (
                  <button
                    type="button"
                    onClick={() =>
                      onSetConcentration(
                        isConcentratingOnThis ? null : spell.name
                      )
                    }
                    className={`h-9 px-3 inline-flex items-center rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
                      isConcentratingOnThis
                        ? "border-sienna/50 dark:border-brass/50 text-sienna dark:text-brass bg-linen/70 dark:bg-obsidian hover:bg-linen dark:hover:bg-soot"
                        : "border-limestone dark:border-charcoal-border text-ink dark:text-parchment bg-paper dark:bg-obsidian hover:bg-linen dark:hover:bg-soot"
                    }`}
                  >
                    {isConcentratingOnThis
                      ? "Drop Concentration"
                      : spell.levelIndex === 0
                      ? "Concentrate"
                      : "Set Concentration"}
                  </button>
                )}

                {onRollSpellInTray && hasTrayRolls && (
                  <button
                    type="button"
                    onClick={() => onRollSpellInTray(spell)}
                    className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-limestone dark:border-charcoal-border bg-paper dark:bg-obsidian text-xs font-medium text-ink dark:text-parchment hover:border-sienna dark:hover:border-brass hover:text-sienna dark:hover:text-brass transition-colors whitespace-nowrap"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Roll in Tray</span>
                  </button>
                )}
              </div>

              {willReplaceConcentration && (
                <span className="text-xs text-sienna dark:text-brass">
                  Replaces concentration on {concentrationSpell}
                </span>
              )}
            </div>
          )}

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-limestone dark:border-charcoal-border bg-linen/70 dark:bg-obsidian/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleKnown(spell.name)}
              className={`h-10 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium border transition-colors whitespace-nowrap ${
                isKnown
                  ? "border-sienna/40 dark:border-brass/40 text-sienna dark:text-brass bg-paper dark:bg-soot hover:bg-linen dark:hover:bg-obsidian"
                  : "border-limestone dark:border-charcoal-border text-ink dark:text-parchment bg-paper dark:bg-soot hover:bg-linen dark:hover:bg-obsidian"
              }`}
            >
              {isKnown ? (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Remove from Known</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Lock as Known</span>
                </>
              )}
            </button>

            {isRolled && !isKnown && onReroll && (
              <button
                type="button"
                onClick={() => onReroll(spell.name)}
                className="h-10 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium border border-limestone dark:border-charcoal-border text-ink dark:text-parchment bg-paper dark:bg-soot hover:bg-linen dark:hover:bg-obsidian transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reroll</span>
              </button>
            )}

            {onQuickStoreInRing &&
              spell.levelIndex >= 1 &&
              spell.levelIndex <= 5 &&
              spell.levelIndex <= ringRemainingLevels && (
                <button
                  type="button"
                  onClick={() => onQuickStoreInRing(spell)}
                  className="h-10 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium border border-limestone dark:border-charcoal-border text-ink dark:text-parchment bg-paper dark:bg-soot hover:bg-linen dark:hover:bg-obsidian transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Store in Ring</span>
                </button>
              )}
          </div>

          <a
            href={getSpell5eToolsUrl(spell)}
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 px-4 inline-flex items-center gap-2 rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <span>Open on 5e.tools</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
};
