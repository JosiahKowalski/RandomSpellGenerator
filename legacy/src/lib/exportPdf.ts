import { PDFDocument } from "pdf-lib";
import { CharacterStats } from "../types";

import { Spell } from "../types";
export async function exportToDndSheetPdf(character: CharacterStats, activeSpells: Spell[], setIsGenerating: (val: boolean) => void) {
  setIsGenerating(true);
  try {
    // We use a reliable hosted copy of the 5E sheet from the pdf-lib examples to avoid CORS and downtime issues
    const url = "/5E_CharacterSheet_Fillable.pdf";

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    
    const existingPdfBytes = await response.arrayBuffer();

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();

    const setField = (name: string, value: string | number | undefined) => {
      try {
        if (value === undefined || value === "") return;
        const field = form.getTextField(name);
        if (field) field.setText(String(value));
      } catch (e) {
        // Field doesn't exist or is not a text field, safely ignore
      }
    };

    // Try multiple common variations for field names since PDFs update their naming
    const trySetFields = (names: string[], value: string | number | undefined) => {
      names.forEach(name => setField(name, value));
    };

    const tryCheckMark = (name: string, isChecked: boolean) => {
      try {
        const field = form.getCheckBox(name);
        if (field) {
          if (isChecked) field.check();
          else field.uncheck();
        }
      } catch (e) {
        // Safe ignore
      }
    };

    trySetFields(['CharacterName', 'Character Name', 'CharacterName 2'], character.name);
    trySetFields(['ClassLevel', 'Class and Level'], `${character.class} ${character.level}`);
    trySetFields(['Race', 'Race '], character.race);
    trySetFields(['Background'], character.background);
    
    // Core stats
    trySetFields(['AC', 'ArmorClass'], character.armorClass);
    trySetFields(['Initiative'], character.initiative);
    trySetFields(['Speed'], character.speed);
    trySetFields(['ProfBonus', 'ProficiencyBonus'], `+${character.proficiencyBonus}`);
    
    trySetFields(['HPMax'], character.hpMax);
    trySetFields(['HPCurrent'], character.hpCurrent);
    trySetFields(['HPTemp'], character.hpTemp);

    const mod = (score: number | "") => {
      if (score === "") return "";
      const val = Math.floor((score - 10) / 2);
      return val >= 0 ? `+${val}` : `${val}`;
    };

    // Charisma is the sorcerer's most important stat
    trySetFields(['CHA', 'Charismascore'], character.charisma);
    trySetFields(['CHamod', 'Charismamod'], mod(character.charisma));

    trySetFields(['STR', 'Strengthscore'], character.strength);
    trySetFields(['STRmod', 'Strengthmod'], mod(character.strength));
    trySetFields(['DEX', 'Dexterityscore'], character.dexterity);
    trySetFields(['DEXmod', 'Dexteritymod'], mod(character.dexterity));
    trySetFields(['CON', 'Constitutionscore'], character.constitution);
    trySetFields(['CONmod', 'Constitutionmod'], mod(character.constitution));
    trySetFields(['INT', 'Intelligencescore'], character.intelligence);
    trySetFields(['INTmod', 'Intelligencemod'], mod(character.intelligence));
    trySetFields(['WIS', 'Wisdomscore'], character.wisdom);
    trySetFields(['WISmod', 'Wisdommod'], mod(character.wisdom));

    trySetFields(['Passive', 'Passive Perception'], character.passivePerception ?? 11);

    const getModNum = (score: number | "") => {
      if (score === "") return 0;
      return Math.floor((score - 10) / 2);
    };
    
    const pb = character.proficiencyBonus === "" ? 0 : Number(character.proficiencyBonus);
    
    const getBonus = (stat: number | "", profKey: string, checkName: string) => {
       const hasProf = character.proficiencies?.includes(profKey) ?? false;
       const val = getModNum(stat) + (hasProf ? pb : 0);
       tryCheckMark(checkName, hasProf);
       return val >= 0 ? `+${val}` : `${val}`;
    };

    trySetFields(['ST Strength'], getBonus(character.strength, 'save_strength', 'Check Box 11'));
    trySetFields(['ST Dexterity'], getBonus(character.dexterity, 'save_dexterity', 'Check Box 18'));
    trySetFields(['ST Constitution'], getBonus(character.constitution, 'save_constitution', 'Check Box 19'));
    trySetFields(['ST Intelligence'], getBonus(character.intelligence, 'save_intelligence', 'Check Box 20'));
    trySetFields(['ST Wisdom'], getBonus(character.wisdom, 'save_wisdom', 'Check Box 21'));
    trySetFields(['ST Charisma'], getBonus(character.charisma, 'save_charisma', 'Check Box 22'));

    trySetFields(['Acrobatics'], getBonus(character.dexterity, 'acrobatics', 'Check Box 23'));
    trySetFields(['Animal'], getBonus(character.wisdom, 'animal_handling', 'Check Box 24'));
    trySetFields(['Arcana'], getBonus(character.intelligence, 'arcana', 'Check Box 25'));
    trySetFields(['Athletics'], getBonus(character.strength, 'athletics', 'Check Box 26'));
    trySetFields(['Deception '], getBonus(character.charisma, 'deception', 'Check Box 27'));
    trySetFields(['History '], getBonus(character.intelligence, 'history', 'Check Box 28'));
    trySetFields(['Insight'], getBonus(character.wisdom, 'insight', 'Check Box 29'));
    trySetFields(['Intimidation'], getBonus(character.charisma, 'intimidation', 'Check Box 30'));
    trySetFields(['Investigation '], getBonus(character.intelligence, 'investigation', 'Check Box 31'));
    trySetFields(['Medicine'], getBonus(character.wisdom, 'medicine', 'Check Box 32'));
    trySetFields(['Nature'], getBonus(character.intelligence, 'nature', 'Check Box 33'));
    trySetFields(['Perception '], getBonus(character.wisdom, 'perception', 'Check Box 34'));
    trySetFields(['Performance'], getBonus(character.charisma, 'performance', 'Check Box 35'));
    trySetFields(['Persuasion'], getBonus(character.charisma, 'persuasion', 'Check Box 36'));
    trySetFields(['Religion'], getBonus(character.intelligence, 'religion', 'Check Box 37'));
    trySetFields(['SleightofHand'], getBonus(character.dexterity, 'sleight_of_hand', 'Check Box 38'));
    trySetFields(['Stealth '], getBonus(character.dexterity, 'stealth', 'Check Box 39'));
    trySetFields(['Survival'], getBonus(character.wisdom, 'survival', 'Check Box 40'));

    trySetFields(['PlayerName'], character.playerName);
    trySetFields(['Alignment'], character.alignment);
    trySetFields(['XP'], character.xp);
    trySetFields(['PersonalityTraits '], character.personalityTraits);
    trySetFields(['Ideals'], character.ideals);
    trySetFields(['Bonds'], character.bonds);
    trySetFields(['Flaws'], character.flaws);
    trySetFields(['Features and Traits', 'Feat+Traits'], character.features);
    trySetFields(['Backstory'], character.backstory);
    trySetFields(['Equipment'], character.equipment);
    trySetFields(['ProficienciesLang'], character.otherProficiencies);
    trySetFields(['CP'], character.currency?.cp);
    trySetFields(['SP'], character.currency?.sp);
    trySetFields(['EP'], character.currency?.ep);
    trySetFields(['GP'], character.currency?.gp);
    trySetFields(['PP'], character.currency?.pp);

    // Attacks (up to 3 in PDF fields)
    if (character.attacks && character.attacks.length > 0) {
      if (character.attacks[0]) {
        trySetFields(['Wpn Name'], character.attacks[0].name);
        trySetFields(['Wpn1 AtkBonus'], character.attacks[0].bonus);
        trySetFields(['Wpn1 Damage'], character.attacks[0].damage);
      }
      if (character.attacks[1]) {
        trySetFields(['Wpn Name 2'], character.attacks[1].name);
        trySetFields(['Wpn2 AtkBonus '], character.attacks[1].bonus);
        trySetFields(['Wpn2 Damage '], character.attacks[1].damage);
      }
      if (character.attacks[2]) {
        trySetFields(['Wpn Name 3'], character.attacks[2].name);
        trySetFields(['Wpn3 AtkBonus  '], character.attacks[2].bonus);
        trySetFields(['Wpn3 Damage '], character.attacks[2].damage);
      }
    }

    // Spellcasting Info (usually on page 3)
    trySetFields(['Spellcasting Class', 'SpellcastingClass 2'], character.class);
    trySetFields(['SpellcastingAbility', 'SpellcastingAbility 2'], "Charisma");
    trySetFields(['SpellSaveDC', 'SpellSaveDC 2'], character.spellSaveDC);
    trySetFields(['SpellAtkBonus', 'SpellAtkBonus 2'], `+${character.spellAttackBonus}`);

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
        trySetFields([`Spells ${cur}`], spell.name);
        currentIdx[lvlKey]++;
      }
    }


    
    // Spell Slots
    const slotLevels = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
    for (let i = 0; i < slotLevels.length; i++) {
      const lvl = slotLevels[i];
      const max = character.slotsMax?.[lvl];
      const cur = character.slotsCurrent?.[lvl];
      const fieldIdx = 19 + i; // 19 is level 1
      if (max) {
        trySetFields([`SlotsTotal ${fieldIdx}`], max);
      }
      if (cur !== undefined && cur !== null) {
        // usually SlotsRemaining is a text field
        trySetFields([`SlotsRemaining ${fieldIdx}`], cur);
      }
    }

    // Flatten form so they can't be easily edited (acts as a "print")
    // If you prefer to keep it editable, comment this out.
    // pdfDoc.flatten();

    const pdfBytes = await pdfDoc.save();
    
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const fileName = `${character.name || "Character"}_DND_Sheet.pdf`;
    const blobUrl = URL.createObjectURL(blob);

    // Direct browser file download
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 10000);

  } catch (error) {
    console.error("Failed to generate PDF:", error);
    alert("Could not generate the PDF automatically. This could be due to a popup blocker or network error.");
  } finally {
    setIsGenerating(false);
  }
}
