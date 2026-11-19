import Papa from "papaparse";
import { Spell, GeneratorSettings } from "../types";

export function parseSpellsCSV(csvText: string): Spell[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return (result.data as any[]).map((row) => ({
    name: row.Name || "",
    source: row.Source || "",
    page: row.Page || "",
    level: row.Level || "",
    castingTime: row["Casting Time"] || "",
    duration: row.Duration || "",
    school: row.School || "",
    range: row.Range || "",
    components: row.Components || "",
    classes: row.Classes || "",
    optionalVariantClasses: row["Optional/Variant Classes"] || "",
    subclasses: row.Subclasses || "",
    text: row.Text || "",
    atHigherLevels: row["At Higher Levels"] || "",
  }));
}

export function filterSpellPool(pool: Spell[], settings: GeneratorSettings): Spell[] {
  return pool.filter((spell) => {
    // Filter by class
    const spellClasses = spell.classes.toLowerCase();
    
    if (settings.classes.length > 0) {
      const match = settings.classes.some(c => spellClasses.includes(c.toLowerCase()));
      if (settings.excludeClasses) {
        if (match) return false;
      } else {
        if (!match) return false;
      }
    }

    // Filter by school
    const spellSchool = spell.school.toLowerCase();
    
    if (settings.schools.length > 0) {
      const match = settings.schools.some(s => spellSchool.includes(s.toLowerCase()));
      if (settings.excludeSchools) {
        if (match) return false;
      } else {
        if (!match) return false;
      }
    }

    // Filter by weapon components
    if (settings.excludeWeaponComponents) {
      if (spell.components.toLowerCase().includes("weapon")) {
        return false;
      }
    }

    return true;
  });
}

export function getRandomSpells(pool: Spell[], count: number, level: string): Spell[] {
  const levelPool = pool.filter(s => s.level.toLowerCase() === level.toLowerCase());
  if (levelPool.length === 0) return [];
  
  const shuffled = [...levelPool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

export function getSpellUrl(spell: Spell): string {
  const safeName = encodeURIComponent(spell.name.toLowerCase()).replace(/'/g, "%27");
  const rawSource = (spell.source || "").toLowerCase();
  const safeSource = rawSource.replace(/'14/g, '');
  
  if (rawSource === 'xphb' || rawSource === 'xdmg' || rawSource === 'xmm') {
      return `https://5e.tools/spells.html#${safeName}_${safeSource}`;
  } else {
      return `https://2014.5e.tools/spells.html#${safeName}_${safeSource}`;
  }
}
