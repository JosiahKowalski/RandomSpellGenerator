import fs from 'fs';

let content = fs.readFileSync('src/lib/exportPdf.ts', 'utf8');

const slotsLogic = `
    // Spell Slots
    const slotLevels = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
    for (let i = 0; i < slotLevels.length; i++) {
      const lvl = slotLevels[i];
      const max = character.slotsMax?.[lvl];
      const cur = character.slotsCurrent?.[lvl];
      const fieldIdx = 19 + i; // 19 is level 1
      if (max) {
        trySetFields([\`SlotsTotal \${fieldIdx}\`], max);
      }
      if (cur !== undefined && cur !== null) {
        // usually SlotsRemaining is a text field
        trySetFields([\`SlotsRemaining \${fieldIdx}\`], cur);
      }
    }
`;

content = content.replace(
  '// Flatten form',
  slotsLogic + '\n    // Flatten form'
);

fs.writeFileSync('src/lib/exportPdf.ts', content);
