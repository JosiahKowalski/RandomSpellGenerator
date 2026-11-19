import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import Fuse from "fuse.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// Caches for 5eTools data
let bestiary: any[] = [];
let spells: any[] = [];
let items: any[] = [];
let isReady = false;
let loadPromise: Promise<void> | null = null;

const REPO_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

async function fetchJSON(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return await res.json();
}

async function load5eToolsData() {
  if (isReady) return;
  console.log("Loading 5eTools data...");
  const [bestiaryIndex, spellsIndex, itemsData] = await Promise.all([
    fetchJSON(`${REPO_BASE}/bestiary/index.json`),
    fetchJSON(`${REPO_BASE}/spells/index.json`),
    fetchJSON(`${REPO_BASE}/items.json`),
  ]);

  // Just grab MM, TCE, XGE to keep it fast, or all if we want everything.
  // For AI Studio limits, let's load core + major expansions to save memory and time
  const bookKeys = ["MM", "TCE", "XGE", "PHB", "MPMM", "VGtM", "MToF", "DMG"];
  // Load monsters
  const bestiaryPromises = Object.entries(bestiaryIndex)
    .filter(([key]) => bookKeys.includes(key) || true) // Actually let's try to load all, github limits? Let's stick to all for now as parallel fetch is fast
    .map(([_, filename]) => fetchJSON(`${REPO_BASE}/bestiary/${filename}`).catch(() => null));
  
  // Load spells
  const spellsPromises = Object.entries(spellsIndex)
    .map(([_, filename]) => fetchJSON(`${REPO_BASE}/spells/${filename}`).catch(() => null));

  const bestiaryResults = await Promise.all(bestiaryPromises);
  bestiaryResults.forEach((b: any) => {
    if (b && b.monster) bestiary.push(...b.monster);
  });

  const spellsResults = await Promise.all(spellsPromises);
  spellsResults.forEach((s: any) => {
    if (s && s.spell) spells.push(...s.spell);
  });

  if (itemsData && itemsData.item) {
    items.push(...itemsData.item);
  }

  isReady = true;
  console.log(`Loaded ${bestiary.length} monsters, ${spells.length} spells, ${items.length} items.`);
}

function getLoadPromise() {
  if (!loadPromise) loadPromise = load5eToolsData();
  return loadPromise;
}

// Background load
getLoadPromise().catch(console.error);

app.get("/api/search", async (req, res) => {
  try {
    await getLoadPromise();
    const { q, type, edition } = req.query;
    if (!q || typeof q !== "string") {
      res.status(400).json({ error: "Missing query" });
      return;
    }

    let targetArray = [];
    if (type === "spells") targetArray = spells;
    else if (type === "monsters") targetArray = bestiary;
    else if (type === "items") targetArray = items;
    else targetArray = [...spells, ...bestiary, ...items];

    const is2024Source = (source: string) => ["XPHB", "XDMG", "XMM", "XMtS"].includes(source);

    const fuse = new Fuse(targetArray, {
      keys: ["name"],
      threshold: 0.3,
      distance: 100,
      ignoreLocation: true,
    });

    let fuseResults = fuse.search(q).map(r => r.item);
    
    // Group by name to deduplicate
    const byName = new Map<string, any[]>();
    for (const item of fuseResults) {
      if (!byName.has(item.name)) byName.set(item.name, []);
      byName.get(item.name)!.push(item);
    }

    const deduplicated = [];
    for (const items of byName.values()) {
      if (items.length === 1) {
        deduplicated.push(items[0]);
        continue;
      }
      
      let preferred = items[0]; // default to best fuse match
      if (edition === "2014") {
        // Prefer non-2024 over 2024
        const non2024 = items.find(i => !is2024Source(i.source));
        if (non2024) preferred = non2024;
      } else if (edition === "2024") {
        // Prefer 2024 over older sources
        const is2024 = items.find(i => is2024Source(i.source));
        if (is2024) preferred = is2024;
      }
      deduplicated.push(preferred);
    }

    const results = deduplicated.slice(0, 5);
    res.json({ results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
