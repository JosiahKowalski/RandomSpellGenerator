import fs from 'fs';

let content = fs.readFileSync('src/lib/exportPdf.ts', 'utf8');

content = content.replace(
  'export async function exportToDndSheetPdf(character: CharacterStats, setIsGenerating: (val: boolean) => void) {',
  'import { Spell } from "../types";\nexport async function exportToDndSheetPdf(character: CharacterStats, activeSpells: Spell[], setIsGenerating: (val: boolean) => void) {'
);

fs.writeFileSync('src/lib/exportPdf.ts', content);
