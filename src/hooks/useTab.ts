import { useCallback, useEffect, useState } from 'react';

export const TABS = ['calculator', 'breakdown', 'target', 'settings'] as const;
export type Tab = (typeof TABS)[number];

const STORAGE_KEY = 'otcalc.tab.v1';

export function parseTab(raw: string | null | undefined): Tab | null {
  const s = (raw ?? '').replace(/^#\/?/, '').toLowerCase();
  return (TABS as readonly string[]).includes(s) ? (s as Tab) : null;
}

function readInitial(): Tab {
  try {
    return parseTab(window.location.hash) ?? parseTab(localStorage.getItem(STORAGE_KEY)) ?? 'calculator';
  } catch {
    return 'calculator';
  }
}

/**
 * Active tab, kept in the URL hash (#breakdown etc., so it can be linked and
 * survives reloads) and in localStorage (last tab when opened without a hash).
 */
export function useTab() {
  const [tab, setTabState] = useState<Tab>(readInitial);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
      // replaceState: switching tabs shouldn't fill the back-button history.
      history.replaceState(null, '', `#${t}`);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!parseTab(window.location.hash)) history.replaceState(null, '', `#${tab}`);
    const onHash = () => {
      const t = parseTab(window.location.hash);
      if (t) setTab(t);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [tab, setTab] as const;
}
