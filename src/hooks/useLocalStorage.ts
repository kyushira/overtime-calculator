import { useEffect, useState } from 'react';

/**
 * useState that persists to localStorage. Falls back to `initial` on bad/missing data.
 * `migrate` upgrades data saved by older versions (and should fall back to defaults
 * for anything it can't read).
 */
export function useLocalStorage<T>(key: string, initial: T, migrate?: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const parsed: unknown = JSON.parse(raw);
      return migrate ? migrate(parsed) : (parsed as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full / disabled — ignore */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
