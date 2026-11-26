/**
 * Pure model for the Subscriptions module. No React, no storage I/O. Every function that
 * depends on "today" takes it as a parameter so the tests stay deterministic.
 */

export type Cycle = 'monthly' | 'yearly';

export interface Subscription {
  id: string;
  name: string;
  /** SGD, per billing cycle (a yearly plan's cost is the yearly price). */
  cost: number;
  cycle: Cycle;
  /** Next renewal as a local calendar date, yyyy-mm-dd. */
  nextRenewal: string;
  /** Free text (e.g. "Visa 4421"). No card picker. */
  paymentMethod: string;
}

export const SUBSCRIPTIONS_STORAGE_KEY = 'otcalc.subscriptions.v1';

/** Upcoming window in days, counting today as day 0. */
export const UPCOMING_WINDOW_DAYS = 30;

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Monthly cost of one subscription: a yearly plan spread over 12 months. */
export function monthlyEquivalent(sub: Pick<Subscription, 'cost' | 'cycle'>): number {
  return sub.cycle === 'yearly' ? sub.cost / 12 : sub.cost;
}

/** Yearly cost of one subscription. */
export function annualCost(sub: Pick<Subscription, 'cost' | 'cycle'>): number {
  return sub.cycle === 'yearly' ? sub.cost : sub.cost * 12;
}

export function monthlyTotal(subs: readonly Subscription[]): number {
  return subs.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
}

/** Sum of each plan's yearly cost. Equals monthlyTotal * 12 (up to float rounding). */
export function annualTotal(subs: readonly Subscription[]): number {
  return subs.reduce((sum, s) => sum + annualCost(s), 0);
}

/** Parses a strict yyyy-mm-dd string into a local-calendar day number (days since epoch), or null. */
export function isoDayNumber(iso: string): number | null {
  const m = ISO_DATE.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  // Reject rolled-over dates such as 2026-02-31.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return Math.round(utc / MS_PER_DAY);
}

/** Local calendar day number for a Date (ignores the time of day). */
export function todayDayNumber(today: Date): number {
  return Math.round(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / MS_PER_DAY);
}

/**
 * Whole calendar days from today to the given renewal date: 0 for today, 1 for tomorrow,
 * negative for the past. Null when the date string is not a valid yyyy-mm-dd.
 */
export function daysUntil(isoDate: string, today: Date): number | null {
  const day = isoDayNumber(isoDate);
  if (day === null) return null;
  return day - todayDayNumber(today);
}

export interface UpcomingItem {
  sub: Subscription;
  days: number;
}

/**
 * Subscriptions renewing within `windowDays` calendar days of today (0 through windowDays
 * inclusive), soonest first. Ties keep name order.
 */
export function upcoming(
  subs: readonly Subscription[],
  today: Date,
  windowDays: number = UPCOMING_WINDOW_DAYS,
): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const sub of subs) {
    const days = daysUntil(sub.nextRenewal, today);
    if (days !== null && days >= 0 && days <= windowDays) items.push({ sub, days });
  }
  return items.sort((a, b) => a.days - b.days || a.sub.name.localeCompare(b.sub.name));
}

/** Copy sorted by next renewal (soonest first), then name. Stored dates are valid yyyy-mm-dd, so string order is date order. */
export function sortByRenewal(subs: readonly Subscription[]): Subscription[] {
  return [...subs].sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal) || a.name.localeCompare(b.name));
}

/** "in 0 days" wording as the UI shows it: "today", "tomorrow", "in N days". */
export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

const DATE_FMT = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

/** "3 Dec 2026" for a valid yyyy-mm-dd; the raw string if it cannot be parsed. */
export function formatRenewalDate(iso: string): string {
  const day = isoDayNumber(iso);
  if (day === null) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return DATE_FMT.format(new Date(y, m - 1, d));
}

/** Today's local date as yyyy-mm-dd (for default values and the date input's min). */
export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One stored item, or null when any required field is missing or malformed. */
function sanitiseOne(raw: unknown): Subscription | null {
  if (!isRecord(raw)) return null;
  const { id, name, cost, cycle, nextRenewal, paymentMethod } = raw;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof name !== 'string' || name.trim() === '') return null;
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return null;
  if (cycle !== 'monthly' && cycle !== 'yearly') return null;
  if (typeof nextRenewal !== 'string' || isoDayNumber(nextRenewal) === null) return null;
  return {
    id,
    name: name.trim(),
    cost,
    cycle,
    nextRenewal,
    paymentMethod: typeof paymentMethod === 'string' ? paymentMethod : '',
  };
}

/**
 * Turns whatever is in storage into a clean list. Anything that is not an array, or any
 * item that is malformed, is dropped rather than failing the whole page.
 */
export function sanitiseSubscriptions(raw: unknown): Subscription[] {
  if (!Array.isArray(raw)) return [];
  const out: Subscription[] = [];
  for (const item of raw) {
    const sub = sanitiseOne(item);
    if (sub) out.push(sub);
  }
  return out;
}
