import { describe, expect, it } from 'vitest';
import {
  nextThemePref,
  parseThemePref,
  readStoredThemePref,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeStoredThemePref,
} from './theme';

describe('parseThemePref', () => {
  it('accepts the three known values', () => {
    expect(parseThemePref('auto')).toBe('auto');
    expect(parseThemePref('light')).toBe('light');
    expect(parseThemePref('dark')).toBe('dark');
  });

  it('falls back to auto for missing, invalid or wrongly typed values', () => {
    for (const bad of [null, undefined, '', 'Dark', 'system', 1, true, { pref: 'dark' }]) {
      expect(parseThemePref(bad)).toBe('auto');
    }
  });
});

describe('resolveTheme', () => {
  it('follows the system setting in auto', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
  });

  it('ignores the system setting when a theme is forced', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('nextThemePref', () => {
  it('cycles auto → light → dark → auto', () => {
    expect(nextThemePref('auto')).toBe('light');
    expect(nextThemePref('light')).toBe('dark');
    expect(nextThemePref('dark')).toBe('auto');
  });
});

describe('stored preference', () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      data,
    };
  }

  it('reads the value under the versioned key', () => {
    expect(readStoredThemePref(fakeStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
    expect(THEME_STORAGE_KEY).toBe('otcalc.theme.v1');
  });

  it('treats an invalid stored value as auto', () => {
    expect(readStoredThemePref(fakeStorage({ [THEME_STORAGE_KEY]: 'blue' }))).toBe('auto');
    expect(readStoredThemePref(fakeStorage())).toBe('auto');
  });

  it('falls back to auto when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readStoredThemePref(broken)).toBe('auto');
  });

  it('writes the preference and swallows storage errors', () => {
    const s = fakeStorage();
    writeStoredThemePref('light', s);
    expect(s.data.get(THEME_STORAGE_KEY)).toBe('light');

    const full = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => writeStoredThemePref('dark', full)).not.toThrow();
  });
});
