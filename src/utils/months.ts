import type { FormState } from '../types/form';
import type { OtQuantities, PayResult } from '../types/payroll';
import { MONTHS } from './format';
import { round2 } from './payroll';

/* Pure logic for the Months tab: saved payout months, plan, trend and backup. */

export const MONTHS_STORAGE_KEY = 'otcalc.months.v1';
export const MONTHS_VERSION = 1;

/** Money and quantity figures kept for a saved month. */
export interface MonthFigures {
  normalShifts: number;
  weekdayOtHours: number;
  saturdayShifts: number;
  sundayShifts: number;
  publicHolidayShifts: number;
  gross: number;
  cpf: number;
  totalDeductions: number;
  net: number;
}

export interface SavedLine {
  label: string;
  amount: number;
}

export interface SavedMonth {
  /** Payout month 'YYYY-MM'. */
  id: string;
  year: number;
  /** 1–12 */
  month: number;
  /** ISO timestamp of the save. */
  savedAt: string;
  /** Calculator inputs at save time, targetNet forced to ''. */
  form: FormState;
  figures: MonthFigures;
  earnings: SavedLine[];
  /** CPF line first, then the other deductions. */
  deductions: SavedLine[];
}

/** Plan for the next payout month; all strings, like the form. */
export interface PlanState {
  year: string;
  month: string;
  normalShifts: string;
  weekdayOtHours: string;
  saturdayShifts: string;
  sundayShifts: string;
  publicHolidayShifts: string;
}

export interface MonthsStore {
  version: 1;
  months: SavedMonth[];
  plan: PlanState | null;
}

export const EMPTY_STORE: MonthsStore = { version: 1, months: [], plan: null };

const YEAR_MIN = 2000;
const YEAR_MAX = 2100;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validYm(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX && Number.isInteger(month) && month >= 1 && month <= 12;
}

/** Parse string-backed form year/month; null unless both are a valid payout month. */
function parseYm(year: unknown, month: unknown): { year: number; month: number } | null {
  const y = Number(String(year ?? '').trim());
  const m = Number(String(month ?? '').trim());
  return validYm(y, m) ? { year: y, month: m } : null;
}

/** Zero-padded 'YYYY-MM'. */
export function monthId(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** 'March 2026', or 'Mar 26' when short. */
export function monthLabel(year: number, month: number, short = false): string {
  const name = MONTHS[month - 1] ?? '';
  return short ? `${name.slice(0, 3)} ${String(year).slice(-2)}` : `${name} ${year}`;
}

/** Snapshot of the calculator for its payout month; null when the form month is invalid. */
export function buildSnapshot(
  form: FormState,
  calc: { normalShifts: number; publicHolidayShifts: number; quantities: OtQuantities; result: PayResult },
  now: Date = new Date(),
): SavedMonth | null {
  const ym = parseYm(form.year, form.month);
  if (!ym) return null;
  const { result, quantities } = calc;
  return {
    id: monthId(ym.year, ym.month),
    year: ym.year,
    month: ym.month,
    savedAt: now.toISOString(),
    form: { ...form, targetNet: '' },
    figures: {
      normalShifts: calc.normalShifts,
      weekdayOtHours: quantities.weekdayOtHours,
      saturdayShifts: quantities.saturdayShifts,
      sundayShifts: quantities.sundayShifts,
      publicHolidayShifts: calc.publicHolidayShifts,
      gross: round2(result.gross),
      cpf: round2(result.cpf),
      totalDeductions: round2(result.totalDeductions),
      net: round2(result.net),
    },
    earnings: result.earnings.map((e) => ({ label: e.label, amount: round2(e.amount) })),
    deductions: [
      { label: 'CPF', amount: round2(result.cpf) },
      ...result.otherDeductions.map((d) => ({ label: d.label, amount: round2(d.amount) })),
    ],
  };
}

/** Newest payout month first, by year/month (not savedAt). Returns a new array. */
export function sortNewestFirst(months: SavedMonth[]): SavedMonth[] {
  return [...months].sort((a, b) => b.year - a.year || b.month - a.month);
}

/** Add or overwrite (same id) a saved month. Immutable. */
export function upsertMonth(store: MonthsStore, snap: SavedMonth): MonthsStore {
  const rest = store.months.filter((m) => m.id !== snap.id);
  return { version: 1, months: sortNewestFirst([...rest, snap]), plan: store.plan };
}

export function deleteMonth(store: MonthsStore, id: string): MonthsStore {
  return { version: 1, months: store.months.filter((m) => m.id !== id), plan: store.plan };
}

/** Newest payout month, or null. */
export function latestMonth(months: SavedMonth[]): SavedMonth | null {
  return sortNewestFirst(months)[0] ?? null;
}

/** Latest n months, oldest to newest, for the net trend. */
export function trend(months: SavedMonth[], n = 6): { id: string; label: string; net: number }[] {
  return sortNewestFirst(months)
    .slice(0, Math.max(0, n))
    .reverse()
    .map((m) => ({ id: m.id, label: monthLabel(m.year, m.month, true), net: m.figures.net }));
}

/** Count, total and average net across saved months. */
export function stats(months: SavedMonth[]): { count: number; totalNet: number; averageNet: number } {
  const count = months.length;
  const sum = months.reduce((s, m) => s + m.figures.net, 0);
  return { count, totalNet: round2(sum), averageNet: count ? round2(sum / count) : 0 };
}

/** Payout month after the given one (month 1–12). */
export function nextMonthAfter(year: number, month: number): { year: number; month: number } {
  return month >= 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Next payout month to plan. Shift fields come from the latest saved month
 * when there is one, otherwise from the form's totals.
 */
export function defaultPlan(months: SavedMonth[], form: FormState, now: Date = new Date()): PlanState {
  const latest = latestMonth(months);
  let next: { year: number; month: number };
  if (latest) {
    next = nextMonthAfter(latest.year, latest.month);
  } else {
    const ym = parseYm(form.year, form.month);
    next = ym ? nextMonthAfter(ym.year, ym.month) : nextMonthAfter(now.getFullYear(), now.getMonth() + 1);
  }
  const src = latest
    ? {
        normalShifts: String(latest.figures.normalShifts),
        weekdayOtHours: String(latest.figures.weekdayOtHours),
        saturdayShifts: String(latest.figures.saturdayShifts),
        sundayShifts: String(latest.figures.sundayShifts),
        publicHolidayShifts: String(latest.figures.publicHolidayShifts),
      }
    : {
        normalShifts: form.normalShifts,
        weekdayOtHours: form.weekdayOtHours,
        saturdayShifts: form.saturdayShifts,
        sundayShifts: form.sundayShifts,
        publicHolidayShifts: form.publicHolidayShifts,
      };
  return { year: String(next.year), month: String(next.month), ...src };
}

/** Form for the planned month: totals mode, no one-off entries or custom deductions. */
export function planToForm(plan: PlanState, base: FormState): FormState {
  return {
    ...base,
    year: plan.year,
    month: plan.month,
    normalShifts: plan.normalShifts,
    weekdayOtHours: plan.weekdayOtHours,
    saturdayShifts: plan.saturdayShifts,
    sundayShifts: plan.sundayShifts,
    publicHolidayShifts: plan.publicHolidayShifts,
    inputMode: 'totals',
    entries: [],
    customDeductions: [],
  };
}

/** Projected net minus the latest saved net; diff is null without history. */
export function diffVsLast(projectedNet: number, months: SavedMonth[]): { last: SavedMonth | null; diff: number | null } {
  const last = latestMonth(months);
  return { last, diff: last ? round2(projectedNet - last.figures.net) : null };
}

/* ------------------------------------------------------------------ */
/* Defensive reading (never throws)                                    */
/* ------------------------------------------------------------------ */

const STRING_FORM_KEYS = [
  'year', 'month', 'normalShifts', 'weekdayOtHours', 'saturdayShifts', 'sundayShifts', 'publicHolidayShifts', 'targetNet',
] as const;

const PLAN_KEYS = [
  'year', 'month', 'normalShifts', 'weekdayOtHours', 'saturdayShifts', 'sundayShifts', 'publicHolidayShifts',
] as const;

function blankForm(): FormState {
  return {
    year: '', month: '', normalShifts: '', inputMode: 'totals', weekdayOtHours: '', saturdayShifts: '',
    sundayShifts: '', publicHolidayShifts: '', entries: [], customDeductions: [], targetNet: '',
  };
}

function readForm(raw: Obj): FormState {
  const form = blankForm();
  for (const k of STRING_FORM_KEYS) {
    const v = raw[k];
    if (typeof v === 'string') form[k] = v;
  }
  form.inputMode = raw.inputMode === 'log' || raw.inputMode === 'totals' ? raw.inputMode : 'totals';
  form.entries = Array.isArray(raw.entries) ? (raw.entries as FormState['entries']) : [];
  form.customDeductions = Array.isArray(raw.customDeductions) ? (raw.customDeductions as FormState['customDeductions']) : [];
  return form;
}

function readLines(v: unknown): SavedLine[] {
  if (!Array.isArray(v)) return [];
  const out: SavedLine[] = [];
  for (const x of v) {
    if (isObj(x) && typeof x.label === 'string' && isNum(x.amount)) out.push({ label: x.label, amount: x.amount });
  }
  return out;
}

function readMonth(raw: unknown): SavedMonth | null {
  if (!isObj(raw)) return null;
  const { year, month } = raw;
  if (!isNum(year) || !isNum(month) || !validYm(year, month)) return null;
  const fig = raw.figures;
  if (!isObj(fig) || !isNum(fig.net)) return null;
  const form = raw.form;
  if (!isObj(form)) return null;
  const num = (k: string): number => {
    const v = fig[k];
    return isNum(v) ? v : 0;
  };
  return {
    id: monthId(year, month),
    year,
    month,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    form: readForm(form),
    figures: {
      normalShifts: num('normalShifts'),
      weekdayOtHours: num('weekdayOtHours'),
      saturdayShifts: num('saturdayShifts'),
      sundayShifts: num('sundayShifts'),
      publicHolidayShifts: num('publicHolidayShifts'),
      gross: num('gross'),
      cpf: num('cpf'),
      totalDeductions: num('totalDeductions'),
      net: fig.net,
    },
    earnings: readLines(raw.earnings),
    deductions: readLines(raw.deductions),
  };
}

function readPlan(raw: unknown): PlanState | null {
  if (!isObj(raw)) return null;
  const str = (v: unknown): string => (typeof v === 'string' ? v : isNum(v) ? String(v) : '');
  const plan = {} as Record<string, string>;
  for (const k of PLAN_KEYS) plan[k] = str(raw[k]);
  return plan as unknown as PlanState;
}

function savedTime(m: SavedMonth): number {
  const t = Date.parse(m.savedAt);
  return Number.isNaN(t) ? -Infinity : t;
}

function migrateUnsafe(raw: unknown): MonthsStore {
  let rawMonths: unknown[];
  let rawPlan: unknown = null;
  if (Array.isArray(raw)) {
    rawMonths = raw;
  } else if (isObj(raw)) {
    rawMonths = Array.isArray(raw.months) ? raw.months : [];
    rawPlan = raw.plan;
  } else {
    return { version: 1, months: [], plan: null };
  }
  const byId = new Map<string, SavedMonth>();
  for (const item of rawMonths) {
    const m = readMonth(item);
    if (!m) continue;
    const prev = byId.get(m.id);
    if (!prev || savedTime(m) >= savedTime(prev)) byId.set(m.id, m);
  }
  return { version: 1, months: sortNewestFirst([...byId.values()]), plan: readPlan(rawPlan) };
}

/**
 * Read any stored or imported value into a clean store. Accepts the v1 object
 * (any version number), or a bare array of months. Never throws.
 */
export function migrateMonthsStore(raw: unknown): MonthsStore {
  try {
    return migrateUnsafe(raw);
  } catch {
    return { version: 1, months: [], plan: null };
  }
}

/* ------------------------------------------------------------------ */
/* Backup file                                                         */
/* ------------------------------------------------------------------ */

export function exportBackup(store: MonthsStore, config: unknown, now: Date = new Date()): string {
  return JSON.stringify(
    { app: 'otcalc', kind: 'backup', version: 1, exportedAt: now.toISOString(), months: store.months, plan: store.plan, config },
    null,
    2,
  );
}

export function backupFileName(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `otcalc-backup-${now.getFullYear()}-${mm}-${dd}.json`;
}

export type ParsedBackup = { ok: true; store: MonthsStore; config: unknown | null } | { ok: false; error: string };

/** Parse an exported backup (or a raw store / bare months array). Never throws. */
export function parseBackup(text: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not a valid JSON file' };
  }
  const notBackup: ParsedBackup = { ok: false, error: 'Not an Overtime Calculator backup' };
  if (Array.isArray(parsed)) return { ok: true, store: migrateMonthsStore(parsed), config: null };
  if (!isObj(parsed)) return notBackup;
  if (parsed.app !== 'otcalc' && !Array.isArray(parsed.months)) return notBackup;
  return {
    ok: true,
    store: migrateMonthsStore(parsed),
    config: isObj(parsed.config) ? parsed.config : null,
  };
}

/** Union by id; incoming wins on conflict. Plan: incoming's if set, else current's. */
export function mergeStores(current: MonthsStore, incoming: MonthsStore): MonthsStore {
  const byId = new Map<string, SavedMonth>();
  for (const m of [...current.months, ...incoming.months]) byId.set(m.id, m);
  return { version: 1, months: sortNewestFirst([...byId.values()]), plan: incoming.plan ?? current.plan };
}
