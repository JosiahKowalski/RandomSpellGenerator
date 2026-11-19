import fs from 'fs';
let content = fs.readFileSync('src/components/AttacksTable.tsx', 'utf8');

content = content.replace(
  '<div key={i} className="flex items-center gap-2 relative">',
  '<div key={i} className="flex items-center gap-2 relative" style={{ zIndex: showSearch && searchTargetIndex === i ? 50 : 1 }}>'
);

fs.writeFileSync('src/components/AttacksTable.tsx', content);
