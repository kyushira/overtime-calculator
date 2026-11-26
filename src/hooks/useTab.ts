import { useCallback, useEffect, useState } from 'react';
import { parseBarTab, tabAllowed, type BarTab, type Mode } from '../components/nav/navModel';

export const TABS = ['calculator', 'breakdown', 'target', 'months', 'settings', 'car', 'tax'] as const;
export type Tab = (typeof TABS)[number];

const STORAGE_KEY = 'otcalc.tab.v1';
// Written by App (last pay tab). Read here so /pay opens on it.
const LAST_PAY_KEY = 'otcalc.payTab.v1';

export function parseTab(raw: string | null | undefined): Tab | null {
  const s = (raw ?? '').replace(/^#\/?/, '').toLowerCase();
  return (TABS as readonly string[]).includes(s) ? (s as Tab) : null;
}

function readLastPay(): BarTab {
  try {
    const raw = localStorage.getItem(LAST_PAY_KEY);
    return parseBarTab(raw ? JSON.parse(raw) : null);
  } catch {
    return 'calculator';
  }
}

/**
 * Tab on first render. /car and /tax have one tab each. /pay uses its hash when
 * it names a pay tab; an unknown or foreign hash (e.g. #car) opens the calculator;
 * no hash opens the remembered pay tab.
 */
function initialTab(module: Mode): Tab {
  if (module === 'car') return 'car';
  if (module === 'tax') return 'tax';
  try {
    const hash = window.location.hash;
    if (!hash) return readLastPay();
    const t = parseTab(hash);
    return t && tabAllowed('pay', t) ? t : 'calculator';
  } catch {
    return 'calculator';
  }
}

/**
 * Active tab for a module route. On /pay the tab lives in the URL hash
 * (#breakdown etc., so it can be linked and survives reloads) and in localStorage.
 * On /car and /tax the tab is fixed to the module and nothing is written.
 */
export function useTab(module: Mode) {
  const [tab, setTabState] = useState<Tab>(() => initialTab(module));

  const setTab = useCallback(
    (t: Tab) => {
      // A module route never switches to another module's tab.
      if (!tabAllowed(module, t)) return;
      setTabState(t);
      try {
        localStorage.setItem(STORAGE_KEY, t);
        if (module === 'pay') {
          // replaceState: switching tabs shouldn't fill the back-button history.
          // Keep history.state so the Next.js router's own bookkeeping survives.
          history.replaceState(history.state, '', `#${t}`);
        }
      } catch {
        /* ignore */
      }
    },
    [module],
  );

  // Client-side navigation can update the URL after the first render
  // (e.g. /car -> /pay#settings), so re-read the hash once mounted.
  useEffect(() => {
    if (module !== 'pay') return;
    const fromHash = parseTab(window.location.hash);
    if (fromHash && tabAllowed('pay', fromHash)) setTabState(fromHash);
    else history.replaceState(history.state, '', `#${tab}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  useEffect(() => {
    if (module !== 'pay') return;
    const onHash = () => {
      const t = parseTab(window.location.hash);
      if (t) setTab(t);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [module, setTab]);

  return [tab, setTab] as const;
}
