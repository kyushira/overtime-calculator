import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  nextThemePref,
  parseThemePref,
  readStoredThemePref,
  resolveTheme,
  THEME_BG,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePref,
  writeStoredThemePref,
} from '../utils/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

/** Keep <html> class, colour-scheme and theme-color meta in step with the resolved theme. */
function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[resolved]);
}

/**
 * Theme preference (auto / light / dark) plus the resolved theme. The initial
 * class is already set by the inline script in index.html; this hook owns
 * later changes. Call it once (in App) and pass the result down so every
 * control shares one state.
 */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readStoredThemePref);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const resolved = resolveTheme(pref, systemDark);

  // Follow the OS setting live while in auto.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Other tabs changing the preference.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setPrefState(parseThemePref(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useLayoutEffect(() => applyTheme(resolved), [resolved]);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    writeStoredThemePref(next);
  }, []);

  const cyclePref = useCallback(() => setPref(nextThemePref(pref)), [pref, setPref]);

  return { pref, resolved, setPref, cyclePref };
}
