import { MAX_TENURE_MONTHS, type CarForm } from './car';

/*
 * Singapore COE: a car's Certificate of Entitlement runs out after a fixed period, and a car
 * loan can't outlast it. This module turns the COE left (typed as years + months, or as an
 * expiry date) into months left and a default tenure. Pure: every function that depends on
 * the date takes an injected `today: Date`. Calendar days are read from local time.
 */

export type CoeMode = 'left' | 'expiry';

export interface IsoDate {
  y: number;
  m: number;
  d: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Parses 'YYYY-MM-DD' into a real calendar date. Anything else → null. */
export function parseIsoDate(s: unknown): IsoDate | null {
  if (typeof s !== 'string') return null;
  const match = ISO_DATE.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/** Local calendar day of a Date. */
function calendarDay(today: Date): IsoDate {
  return { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
}

/** Adds whole months; the day is clamped to the last day of the target month (31 Jan + 1 = 28 Feb). */
function addMonths(from: IsoDate, n: number): IsoDate {
  const idx = from.m - 1 + n;
  const y = from.y + Math.floor(idx / 12);
  const m = (((idx % 12) + 12) % 12) + 1;
  return { y, m, d: Math.min(from.d, daysInMonth(y, m)) };
}

const dayKey = (x: IsoDate) => x.y * 10000 + x.m * 100 + x.d;

function toIso(x: IsoDate): string {
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  return `${pad(x.y, 4)}-${pad(x.m, 2)}-${pad(x.d, 2)}`;
}

/**
 * Whole months from `today` until the COE expiry date (floor). A month counts once the same day
 * of month is reached, clamped at month end, so 31 Jan → 28 Feb is one month. Expiry today or in
 * the past → 0. Invalid date → null.
 */
export function monthsUntilExpiry(iso: string, today: Date): number | null {
  const expiry = parseIsoDate(iso);
  if (!expiry) return null;
  const t = calendarDay(today);
  if (dayKey(expiry) <= dayKey(t)) return 0;
  // Start one month above the calendar estimate, then step down until the day is not past expiry.
  let n = Math.max(0, (expiry.y - t.y) * 12 + (expiry.m - t.m) + 1);
  while (n > 0 && dayKey(addMonths(t, n)) > dayKey(expiry)) n--;
  return n;
}

/**
 * COE months left for the form, or null when no COE is entered (blank or invalid → the calculator
 * behaves as before). Expiry mode reads the date; left mode reads years × 12 + months.
 */
export function coeMonthsLeft(form: CarForm, today: Date): number | null {
  if (form.coeMode === 'expiry') return monthsUntilExpiry(form.coeExpiry, today);
  const yText = form.coeYears.trim();
  const mText = form.coeMonths.trim();
  if (yText === '' && mText === '') return null;
  const y = yText === '' ? 0 : Number(yText);
  const m = mText === '' ? 0 : Number(mText);
  if (!Number.isFinite(y) || !Number.isFinite(m) || y < 0 || m < 0) return null;
  return Math.round(y * 12 + m);
}

/** "3y 4m", "0y 0m". Always both parts. */
export function formatCoeLeft(months: number): string {
  const total = Math.max(0, Math.floor(months));
  return `${Math.floor(total / 12)}y ${total % 12}m`;
}

/** The tenure to suggest for a COE: its months left, capped at MAX_TENURE_MONTHS, minimum 1. */
export function defaultTenure(coeLeft: number): number {
  return Math.min(MAX_TENURE_MONTHS, Math.max(1, Math.floor(coeLeft)));
}

/** Splits a month count into the string years/months the tenure fields hold. */
export function splitMonths(total: number): { years: string; months: string } {
  const t = Math.max(0, Math.floor(total));
  return { years: String(Math.floor(t / 12)), months: String(t % 12) };
}

export interface CoeTenureCheck {
  /** The tenure is longer than the COE left (or the COE has under a month left). */
  overCoe: boolean;
  /** Note text for the tenure field; '' when no COE is entered. */
  message: string;
}

/** Checks a tenure (months) against the COE months left. Null COE → no note at all. */
export function checkTenureVsCoe(tenure: number, coeLeft: number | null): CoeTenureCheck {
  if (coeLeft === null) return { overCoe: false, message: '' };
  if (coeLeft < 1) return { overCoe: tenure > coeLeft, message: 'COE expires in under a month' };
  return {
    overCoe: tenure > coeLeft,
    message: `Loan can't outlast the COE: ${formatCoeLeft(coeLeft)} left`,
  };
}

/** Expiry date (ISO) for `months` from today, month-end clamped. */
export function expiryFromMonths(months: number, today: Date): string {
  return toIso(addMonths(calendarDay(today), Math.max(0, Math.round(months))));
}

/** Expiry date (ISO) for years + months from today. */
export function expiryFromLeft(years: number, months: number, today: Date): string {
  return expiryFromMonths(years * 12 + months, today);
}

/**
 * Patch for switching the COE entry mode. The COE value is kept: left → expiry writes the date,
 * expiry → left writes years and months. Tenure is not touched.
 */
export function switchCoeMode(form: CarForm, mode: CoeMode, today: Date): Partial<CarForm> {
  if (mode === form.coeMode) return {};
  const left = coeMonthsLeft(form, today);
  if (mode === 'expiry') {
    return left === null ? { coeMode: 'expiry' } : { coeMode: 'expiry', coeExpiry: expiryFromMonths(left, today) };
  }
  if (left === null) return { coeMode: 'left' };
  const { years, months } = splitMonths(left);
  return { coeMode: 'left', coeYears: years, coeMonths: months };
}

/**
 * The COE expiry to store with a saved car: the typed date in expiry mode, or the date the years
 * and months reach in left mode. Undefined when no valid COE is entered.
 */
export function coeExpiryOf(form: CarForm, today: Date): string | undefined {
  if (form.coeMode === 'expiry') return parseIsoDate(form.coeExpiry) === null ? undefined : form.coeExpiry;
  const left = coeMonthsLeft(form, today);
  return left === null ? undefined : expiryFromMonths(left, today);
}

const COE_FIELDS: (keyof CarForm)[] = ['coeYears', 'coeMonths', 'coeExpiry'];

/**
 * When a COE value is entered or imported, the tenure follows it: years and months are set to the
 * default tenure for the COE. A patch without COE value fields, or one that leaves no COE, returns
 * unchanged, so the user's tenure stays put. Mode switches must not use this (see switchCoeMode).
 */
export function applyCoePatch(form: CarForm, patch: Partial<CarForm>, today: Date): Partial<CarForm> {
  if (!COE_FIELDS.some((k) => k in patch)) return patch;
  const left = coeMonthsLeft({ ...form, ...patch }, today);
  if (left === null) return patch;
  const { years, months } = splitMonths(defaultTenure(left));
  return { ...patch, years, months };
}
