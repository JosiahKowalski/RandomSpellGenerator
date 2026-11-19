import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const mobileControls = `                {/* Mobile Extra Sync Controls - Top Right on smallest screens */}
                <div className="sm:hidden flex items-center gap-1.5 shrink-0">
                  <button onClick={() => exportToDndSheetPdf(character, activeSpells, setIsExportingPdf)} disabled={isExportingPdf} className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white" title="Export PDF">
                    <FileText className="w-4 h-4" />
                  </button>
                  {authUser ? (`;

content = content.replace(
  `                {/* Mobile Extra Sync Controls - Top Right on smallest screens */}
                <div className="sm:hidden flex items-center gap-1.5 shrink-0">
                  {authUser ? (`,
  mobileControls
);

fs.writeFileSync('src/App.tsx', content);
