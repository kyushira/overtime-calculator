/**
 * Pure model for the Savings module: accounts, net worth and goal progress.
 * No React and no storage I/O (the page reads/writes via useLocalStorage).
 */

/** localStorage key for the Savings accounts. */
export const SAVINGS_STORAGE_KEY = 'otcalc.savings.v1';

export interface Account {
  id: string;
  name: string;
  /** SGD. */
  balance: number;
  /** Goal amount in SGD. Absent = no goal. */
  target?: number;
  /** % per annum. Absent = not set. */
  interestRate?: number;
}

/** What is stored under SAVINGS_STORAGE_KEY. The version leaves room for a future migration. */
export interface SavingsState {
  v: 1;
  accounts: Account[];
}

export const emptySavings = (): SavingsState => ({ v: 1, accounts: [] });

/** Sum of all balances: the net worth shown in the hero card. */
export function totalBalance(accounts: readonly Account[]): number {
  return accounts.reduce((sum, a) => sum + a.balance, 0);
}

/**
 * Percent of the goal reached, clamped to 0..100 and rounded to an integer.
 * Null when there is no goal or the goal is not above zero (nothing to measure).
 */
export function targetProgress(balance: number, target: number | null | undefined): number | null {
  if (target === null || target === undefined || !Number.isFinite(target) || target <= 0) return null;
  const pct = Math.round((balance / target) * 100);
  return Math.min(100, Math.max(0, pct));
}

/** Short unique id for a new account. */
export function newAccountId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Turns stored data into SavingsState. Anything unreadable (not an object, no accounts
 * array) gives an empty list; a single bad account is dropped while the rest are kept.
 * Invalid optional fields are removed rather than failing the whole account.
 */
export function parseSavings(raw: unknown): SavingsState {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { accounts?: unknown }).accounts)) {
    return emptySavings();
  }
  const list = (raw as { accounts: unknown[] }).accounts;
  const out: Account[] = [];
  list.forEach((item, i) => {
    if (typeof item !== 'object' || item === null) return;
    const r = item as Record<string, unknown>;
    if (typeof r.name !== 'string' || r.name.trim() === '') return;
    if (typeof r.balance !== 'number' || !Number.isFinite(r.balance)) return;
    const account: Account = {
      id: typeof r.id === 'string' && r.id !== '' ? r.id : `legacy-${i}`,
      name: r.name,
      balance: r.balance,
    };
    if (typeof r.target === 'number' && Number.isFinite(r.target) && r.target > 0) account.target = r.target;
    if (typeof r.interestRate === 'number' && Number.isFinite(r.interestRate) && r.interestRate >= 0) {
      account.interestRate = r.interestRate;
    }
    out.push(account);
  });
  return { v: 1, accounts: out };
}
