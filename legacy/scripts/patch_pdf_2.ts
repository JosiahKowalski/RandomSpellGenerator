import fs from 'fs';

let content = fs.readFileSync('src/lib/exportPdf.ts', 'utf8');

const spellLogic = `
    // Spell Mapping
    const permanentSpells = activeSpells.filter(s => s.isPermanent);
    
    // Ranges for spell fields based on standard 5e PDF layout
    const spellRanges = {
      Cantrip: { start: 1014, end: 1021 },
      "1st": { start: 1022, end: 1034 },
      "2nd": { start: 1035, end: 1047 },
      "3rd": { start: 1048, end: 1060 },
      "4th": { start: 1061, end: 1073 },
      "5th": { start: 1074, end: 1082 },
      "6th": { start: 1083, end: 1091 },
      "7th": { start: 1092, end: 10100 },
      "8th": { start: 10101, end: 10107 },
      "9th": { start: 10108, end: 101013 },
    };

    const currentIdx = {
      Cantrip: spellRanges.Cantrip.start,
      "1st": spellRanges["1st"].start,
      "2nd": spellRanges["2nd"].start,
      "3rd": spellRanges["3rd"].start,
      "4th": spellRanges["4th"].start,
      "5th": spellRanges["5th"].start,
      "6th": spellRanges["6th"].start,
      "7th": spellRanges["7th"].start,
      "8th": spellRanges["8th"].start,
      "9th": spellRanges["9th"].start,
    };

    for (const spell of permanentSpells) {
      let lvlKey = spell.level as keyof typeof spellRanges;
      if (!spellRanges[lvlKey]) {
        // Fallback or ignore if unknown level
        continue;
      }
      const max = spellRanges[lvlKey].end;
      const cur = currentIdx[lvlKey];
      if (cur <= max) {
        trySetFields([\`Spells \${cur}\`], spell.name);
        currentIdx[lvlKey]++;
      }
    }
`;

content = content.replace(
  'trySetFields([\'SpellAtkBonus\', \'SpellAtkBonus 2\'], `+${character.spellAttackBonus}`);',
  'trySetFields([\'SpellAtkBonus\', \'SpellAtkBonus 2\'], `+${character.spellAttackBonus}`);\n' + spellLogic
);

fs.writeFileSync('src/lib/exportPdf.ts', content);
