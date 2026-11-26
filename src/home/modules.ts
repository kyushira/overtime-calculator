/**
 * Home module list: the ordered tiles on the Finance home page. Pure data and
 * functions, no React, so the order, routes and legacy-hash mapping can be tested.
 */

export type ModuleStatus = 'active' | 'soon';

export type ModuleIconName =
  | 'Wallet'
  | 'Car'
  | 'FileText'
  | 'PiggyBank'
  | 'Landmark'
  | 'Layers'
  | 'CreditCard'
  | 'Repeat'
  | 'HeartPulse'
  | 'ScanLine';

export interface HomeModule {
  id: string;
  title: string;
  subtitle: string;
  /** Route for active modules; null for modules that are not built yet. */
  href: string | null;
  status: ModuleStatus;
  icon: ModuleIconName;
}

export const HOME_MODULES: readonly HomeModule[] = [
  { id: 'pay', title: 'Salary & OT', subtitle: 'Overtime, shift & CPF', href: '/pay', status: 'active', icon: 'Wallet' },
  { id: 'car', title: 'My Car', subtitle: 'COE, loan & sgcarmart', href: '/car', status: 'active', icon: 'Car' },
  { id: 'tax', title: 'Tax Claim', subtitle: 'Reliefs & tax savings', href: '/tax', status: 'active', icon: 'FileText' },
  { id: 'savings', title: 'Savings', subtitle: 'Accounts & net worth', href: '/savings', status: 'active', icon: 'PiggyBank' },
  { id: 'loans', title: 'Loans', subtitle: 'Track balances & payoff', href: null, status: 'soon', icon: 'Landmark' },
  { id: 'sinking', title: 'Sinking Funds', subtitle: 'Future expense reserves', href: null, status: 'soon', icon: 'Layers' },
  { id: 'credit-card', title: 'Credit Card', subtitle: 'Log usage & payments', href: null, status: 'soon', icon: 'CreditCard' },
  { id: 'subscriptions', title: 'Subscriptions', subtitle: 'Active plans & cards used', href: '/subscriptions', status: 'active', icon: 'Repeat' },
  { id: 'health', title: 'Health', subtitle: 'Checkups, insurance & certificates', href: null, status: 'soon', icon: 'HeartPulse' },
  { id: 'receipts', title: 'Receipt Tracker', subtitle: 'Scan & store receipts', href: null, status: 'soon', icon: 'ScanLine' },
];

/** Pay sub-tabs that moved from #hash on the old single page to /pay#hash. */
const PAY_HASH_TABS = ['calculator', 'breakdown', 'target', 'months', 'settings'] as const;

/**
 * Maps a hash from the old single-page app (#car, #breakdown, #/tax, ...) to the
 * new route, so existing bookmarks still open the right screen. Null when the
 * hash is not a known old tab (the home page then stays as it is).
 */
export function legacyHashTarget(hash: string): string | null {
  const s = (hash ?? '').replace(/^#\/?/, '').toLowerCase();
  if (s === 'car') return '/car';
  if (s === 'tax') return '/tax';
  if ((PAY_HASH_TABS as readonly string[]).includes(s)) return `/pay#${s}`;
  return null;
}
