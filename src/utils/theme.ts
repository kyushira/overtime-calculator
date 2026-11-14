/**
 * Theme preference (auto / light / dark). Pure helpers: no DOM access, so they
 * can be unit tested. The inline script in index.html repeats the same rules
 * before first paint; keep the two in sync.
 */

export const THEME_STORAGE_KEY = 'otcalc.theme.v1';

export type ThemePref = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFS: readonly ThemePref[] = ['auto', 'light', 'dark'];

/** Page background per resolved theme (used for <meta name="theme-color">). */
export const THEME_BG: Record<ResolvedTheme, string> = { light: '#ffffff', dark: '#0b0d14' };

/** Anything other than the three known values (or missing) falls back to auto. */
export function parseThemePref(raw: unknown): ThemePref {
  return raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'auto';
}

export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'auto') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/** Cycle order for the header toggle: auto → light → dark → auto. */
export function nextThemePref(pref: ThemePref): ThemePref {
  return pref === 'auto' ? 'light' : pref === 'light' ? 'dark' : 'auto';
}

export const THEME_LABEL: Record<ThemePref, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' };

/** Read the stored preference. Storage can throw (private mode, disabled) → auto. */
export function readStoredThemePref(storage: Pick<Storage, 'getItem'> | undefined = safeLocalStorage()): ThemePref {
  try {
    return parseThemePref(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'auto';
  }
}

export function writeStoredThemePref(pref: ThemePref, storage: Pick<Storage, 'setItem'> | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage full / disabled: the choice still applies for this page view */
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
