import fs from 'fs';

let content = fs.readFileSync('src/lib/exportPdf.ts', 'utf8');

const shareLogic = `
    const fileName = \`\${character.name || "Character"}_DND_Sheet.pdf\`;
    const file = new File([blob], fileName, { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: fileName,
        });
        setIsGenerating(false);
        return;
      } catch (err) {
        console.error("Web share failed or was cancelled:", err);
        // Fall through to standard download
      }
    }

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);
`;

content = content.replace(
    /const blobUrl = URL\.createObjectURL\(blob\);[\s\S]*?URL\.revokeObjectURL\(blobUrl\);/,
    shareLogic.trim()
);

fs.writeFileSync('src/lib/exportPdf.ts', content);
