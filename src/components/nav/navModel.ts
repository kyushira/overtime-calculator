import type { Tab } from '../../hooks/useTab';

/**
 * Pure navigation model for the Pay / Car / Tax routes. No React here, so the mapping
 * from tab id to mode / summary variant can be unit-tested.
 */

export type Mode = 'pay' | 'car' | 'tax';

/** Tabs shown in the Pay-mode bottom bar (Settings is reached from the header gear). */
export const BAR_TABS = ['calculator', 'breakdown', 'target', 'months'] as const;
export type BarTab = (typeof BAR_TABS)[number];

export type SummaryVariant = 'full' | 'strip' | 'none';

export function modeOf(tab: Tab): Mode {
  if (tab === 'car') return 'car';
  if (tab === 'tax') return 'tax';
  return 'pay';
}

/** Whether a route's module can show this tab: /pay owns the pay tabs, /car and /tax their own. */
export function tabAllowed(module: Mode, tab: Tab): boolean {
  return modeOf(tab) === module;
}

export function isBarTab(tab: Tab): tab is BarTab {
  return (BAR_TABS as readonly string[]).includes(tab);
}

/** Last pay tab to return to when switching Car -> Pay. Settings doesn't change it. */
export function nextLastPayTab(tab: Tab, last: BarTab): BarTab {
  return isBarTab(tab) ? tab : last;
}

/** Restores a persisted last-pay-tab value; anything unknown falls back to the calculator. */
export function parseBarTab(raw: unknown): BarTab {
  return typeof raw === 'string' && (BAR_TABS as readonly string[]).includes(raw) ? (raw as BarTab) : 'calculator';
}

/**
 * Which summary sits under the header:
 * calculator = full 2x2 grid (collapses on scroll), other pay tabs = collapsed strip,
 * settings, car and tax = none.
 */
export function summaryVariant(tab: Tab): SummaryVariant {
  if (tab === 'calculator') return 'full';
  if (tab === 'breakdown' || tab === 'target' || tab === 'months') return 'strip';
  return 'none';
}
