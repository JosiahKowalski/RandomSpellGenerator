import { useEffect, useState } from "react";

let cachedAvailability: boolean | null = null;
let inflightCheck: Promise<boolean> | null = null;

export function checkAiAvailability(): Promise<boolean> {
  if (cachedAvailability !== null) {
    return Promise.resolve(cachedAvailability);
  }
  if (inflightCheck) {
    return inflightCheck;
  }

  inflightCheck = fetch("/api/ai/status", {
    method: "GET",
    headers: { Accept: "application/json" },
  })
    .then(async (res) => {
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        return false;
      }
      const data = (await res.json().catch(() => null)) as
        | { available?: boolean }
        | null;
      return Boolean(data?.available);
    })
    .catch(() => false)
    .then((available) => {
      cachedAvailability = available;
      inflightCheck = null;
      return available;
    });

  return inflightCheck;
}

/**
 * Returns:
 * - `null` while checking server availability
 * - `true` when AI features are available
 * - `false` when no API key or AI backend is available
 */
export function useAiAvailability(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(
    cachedAvailability
  );

  useEffect(() => {
    if (cachedAvailability !== null) {
      setAvailable(cachedAvailability);
      return;
    }
    let active = true;
    checkAiAvailability().then((result) => {
      if (active) setAvailable(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return available;
}
