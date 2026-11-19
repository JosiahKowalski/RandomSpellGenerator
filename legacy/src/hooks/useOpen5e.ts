import { useState, useEffect } from "react";

export interface Open5eResult {
  name: string;
  slug: string;
  damage_dice?: string;
  damage_type?: string;
  desc?: string;
}

export function useOpen5eSearch(query: string, category: "weapons" | "spells" | "all") {
  const [results, setResults] = useState<Open5eResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        let fetchUrl = "";
        if (category === "all") {
           // We'll search weapons and spells in parallel and combine
           const [wpnRes, spRes] = await Promise.all([
             fetch(`https://api.open5e.com/v1/weapons/?search=${encodeURIComponent(query)}&limit=5`),
             fetch(`https://api.open5e.com/v1/spells/?search=${encodeURIComponent(query)}&limit=5`)
           ]);
           
           let combined: Open5eResult[] = [];
           if (wpnRes.ok) {
             const data = await wpnRes.json();
             combined = [...combined, ...data.results.map((r: any) => ({ ...r, _type: 'weapon' }))];
           }
           if (spRes.ok) {
             const data = await spRes.json();
             // Spells don't have damage_dice directly always, but some do, or just name
             combined = [...combined, ...data.results.map((r: any) => ({ ...r, _type: 'spell' }))];
           }
           setResults(combined);
        } else {
           const res = await fetch(`https://api.open5e.com/v1/${category}/?search=${encodeURIComponent(query)}&limit=5`);
           if (res.ok) {
             const data = await res.json();
             setResults(data.results);
           }
        }
      } catch (e) {
        console.error("Open5e Error", e);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [query, category]);

  return { results, loading };
}
