# Product & Design Decisions

Keep this file up to date and check it before adding new UI sections, labels, or mechanics.

## Naming & UI Copy
- **Plain, functional words only**: Use normal, everyday, functional labels for menus, tabs, buttons, and headings (e.g., `Spells`, `Dice`, `Setup`, `Character`, `Spell Pool`, `Randomizer Rules`).
- **No fantasy/fancy renaming**: Avoid decorative or fantasy-flavored UI names like `Grimoire`, `Archive`, `Compendium`, `Tome`, `Codex`, `Arcane Ledger`, `Folio`, etc. Standard D&D game terms that refer to real mechanics (`Spellbook`, `Metamagic`, `Ring of Spell Storing`, `Sorcery Points`) are fine.
- **No internal/changelog copy in UI**: Never display bug-fix notes, technical changelogs, or internal implementation details in modals or panels.

## Navigation Structure
- Top bar uses a compact single-row segmented switcher with nested groups so the header stays clean as new sections (like `Character`) are added:
  - `Spells` → `Spellbook`, `Metamagic`, `Ring of Spell Storing`
  - `Dice` → standalone 3D dice tray
  - `Setup` → `Spell Pool`, `Randomizer Rules`
- Appearance (`Light` / `Dark`), Cloud Sync, and JSON Backup are nested in a single utility dropdown on the right.

## 3D Dice Tray Feel & UX
- **Realistic felt grip first**: Keep real wool-felt contact friction (`0.54`) and die-on-die friction (`0.14`) so dice tumble with weight instead of sliding like ice.
- **No frozen wall-cocked teleports**: Keep the 52° beveled walnut inner rails (zero bevel friction) + gentle tilted roll-off assist.
- **Recent Rolls**: Appears at the bottom of the Dice page, collapsible, defaulting to collapsed, and persisted across tab switches.
- **Settings**: Support switching between `Crypto Hybrid` and `Pure Physics` engines and between `Put Back` and `Concealed Drop` gentle-drop modes.
