import type { Tab } from '../../hooks/useTab';

/**
 * Pure navigation model for the Pay | Car split. No React here, so the mapping
 * from tab id to mode / summary variant can be unit-tested.
 */

export type Mode = 'pay' | 'car';

/** Tabs shown in the Pay-mode bottom bar (Settings is reached from the header gear). */
export const BAR_TABS = ['calculator', 'breakdown', 'target', 'months'] as const;
export type BarTab = (typeof BAR_TABS)[number];

export type SummaryVariant = 'full' | 'strip' | 'none';

export function modeOf(tab: Tab): Mode {
  return tab === 'car' ? 'car' : 'pay';
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
 * settings and car = none.
 */
export function summaryVariant(tab: Tab): SummaryVariant {
  if (tab === 'calculator') return 'full';
  if (tab === 'breakdown' || tab === 'target' || tab === 'months') return 'strip';
  return 'none';
}
