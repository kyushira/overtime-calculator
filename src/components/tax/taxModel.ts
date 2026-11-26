/**
 * Pure view model for the Tax tab. No React, no storage I/O.
 *
 * All tax maths lives in src/tax (caps, suggestions, computeTax). This module
 * only clamps inputs, sums claimed amounts, takes ratios and orders reminders.
 */

import {
  PERSONAL_RELIEF_CAP,
  RELIEF_CATALOGUE,
  RELIEF_IDS,
  UI_MAX_CHILDREN,
  computeTax,
  isReliefAvailable,
  reliefCap,
  suggestCpfRelief,
  suggestEarnedIncomeRelief,
  toReliefLines,
  type ReliefContext,
  type ReliefId,
  type ReliefMeta,
  type Residency,
  type TaxResult,
  type YA,
} from '../../tax';

/** localStorage key for the Tax tab state (read via the existing useLocalStorage hook). */
export const TAX_STORAGE_KEY = 'otcalc.tax.v1';

export interface EntryState {
  eligible: boolean;
  /** null = use the computed suggestion (only meaningful for autoSuggest reliefs). */
  amount: number | null;
  /** Parents / children count for unit-based reliefs. */
  units: number;
}

export interface TaxState {
  v: 1;
  ya: YA;
  employmentIncome: number;
  bonus: number;
  age: number;
  residency: Residency;
  entries: Partial<Record<ReliefId, EntryState>>;
}

export interface TaxRow {
  id: ReliefId;
  meta: ReliefMeta;
  available: boolean;
  eligible: boolean;
  cap: number;
  suggested: number;
  /** Amount counted toward the total: 0 when ineligible or unavailable. */
  claimed: number;
  /** true when `claimed` came from the suggestion rather than a typed amount. */
  isSuggested: boolean;
  units: number;
}

export interface TaxReminder {
  id: ReliefId;
  label: string;
  /** Dollars of headroom left under this relief's cap. */
  room: number;
  /** Net tax saved by claiming the rest of the room. */
  extraSaving: number;
}

export interface TaxView {
  rows: TaxRow[];
  totalClaimed: number;
  overallCap: number;
  capReached: boolean;
  result: TaxResult;
  /** netTaxPayable / totalIncome, 0 when there is no income. */
  effectiveRate: number;
  reminders: TaxReminder[];
}

/** Reliefs eligible by default: the ones most users claim. */
const DEFAULT_ELIGIBLE: ReadonlySet<ReliefId> = new Set<ReliefId>([
  'earnedIncome',
  'cpf',
  'srs',
  'cpfCashTopUp',
  'lifeInsurance',
  'courseFees',
]);

function defaultEntry(id: ReliefId): EntryState {
  return { eligible: DEFAULT_ELIGIBLE.has(id), amount: null, units: 0 };
}

export function defaultTaxState(): TaxState {
  const entries: Partial<Record<ReliefId, EntryState>> = {};
  for (const id of RELIEF_IDS) entries[id] = defaultEntry(id);
  return {
    v: 1,
    ya: 2026,
    employmentIncome: 0,
    bonus: 0,
    age: 30,
    residency: 'citizenOrPr',
    entries,
  };
}

function nonNeg(x: number): number {
  return Number.isFinite(x) ? Math.max(0, x) : 0;
}

function roundCents(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Amount in [0, cap]. Non-finite input becomes 0. */
function clampAmount(x: number, cap: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(Math.max(x, 0), cap);
}

/** Integer count in [0, max]. Non-finite input becomes 0. */
function clampUnits(x: number, max: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(Math.max(Math.floor(x), 0), max);
}

function suggestionFor(id: ReliefId, ctx: ReliefContext): number {
  if (!RELIEF_CATALOGUE[id].autoSuggest) return 0;
  if (id === 'earnedIncome') return suggestEarnedIncomeRelief(ctx);
  if (id === 'cpf') return suggestCpfRelief(ctx);
  return 0;
}

export function buildTaxView(state: TaxState): TaxView {
  const { ya, age, residency } = state;
  const employmentIncome = nonNeg(state.employmentIncome);
  const bonus = nonNeg(state.bonus);
  const totalIncome = employmentIncome + bonus;

  const units: Partial<Record<ReliefId, number>> = {};
  for (const id of RELIEF_IDS) {
    units[id] = clampUnits(state.entries[id]?.units ?? 0, RELIEF_CATALOGUE[id].maxUnits ?? 0);
  }

  const claimed: Partial<Record<ReliefId, number>> = {};
  const rows: TaxRow[] = [];
  // RELIEF_IDS order matters: cpf is claimed before lifeInsurance, whose cap reads claimed.cpf.
  for (const id of RELIEF_IDS) {
    const meta = RELIEF_CATALOGUE[id];
    const entry = state.entries[id];
    const eligible = entry?.eligible === true;
    const available = isReliefAvailable(id, ya);
    const ctx: ReliefContext = {
      ya,
      age,
      employmentIncome,
      bonus,
      residency,
      claimed,
      units,
    };
    const cap = reliefCap(id, ctx);
    const suggested = suggestionFor(id, ctx);
    const amount = entry?.amount ?? null;
    const value =
      eligible && available ? clampAmount(amount === null ? suggested : amount, cap) : 0;
    claimed[id] = value;
    rows.push({
      id,
      meta,
      available,
      eligible,
      cap,
      suggested,
      claimed: value,
      isSuggested: eligible && available && meta.autoSuggest && amount === null,
      units: units[id] ?? 0,
    });
  }

  const totalClaimed = roundCents(rows.reduce((sum, row) => sum + row.claimed, 0));
  const result = computeTax({ ya, totalIncome, reliefs: toReliefLines(claimed, ya) });
  const effectiveRate = totalIncome > 0 ? result.netTaxPayable / totalIncome : 0;

  const reminders: TaxReminder[] = rows
    .filter((row) => row.eligible && row.available && row.cap - row.claimed > 0)
    .map((row) => {
      const withCap: Partial<Record<ReliefId, number>> = { ...claimed };
      withCap[row.id] = row.cap;
      const atCap = computeTax({ ya, totalIncome, reliefs: toReliefLines(withCap, ya) });
      return {
        id: row.id,
        label: row.meta.label,
        room: roundCents(row.cap - row.claimed),
        extraSaving: roundCents(result.netTaxPayable - atCap.netTaxPayable),
      };
    })
    .sort((a, b) => b.extraSaving - a.extraSaving || b.room - a.room);

  return {
    rows,
    totalClaimed,
    overallCap: PERSONAL_RELIEF_CAP,
    capReached: totalClaimed >= PERSONAL_RELIEF_CAP,
    result,
    effectiveRate,
    reminders,
  };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parseEntry(raw: unknown, id: ReliefId): EntryState {
  if (!isRecord(raw)) return defaultEntry(id);
  const eligible = typeof raw.eligible === 'boolean' ? raw.eligible : defaultEntry(id).eligible;
  const amount =
    typeof raw.amount === 'number' && Number.isFinite(raw.amount) ? Math.max(0, raw.amount) : null;
  const units = typeof raw.units === 'number' ? clampUnits(raw.units, UI_MAX_CHILDREN) : 0;
  return { eligible, amount, units };
}

/**
 * Parses persisted state defensively. Anything that is not a v1 state object
 * returns defaults. Bad fields inside a v1 object fall back to their defaults.
 */
export function migrateTaxState(raw: unknown): TaxState {
  const defaults = defaultTaxState();
  if (!isRecord(raw) || raw.v !== 1) return defaults;

  const ya: YA = raw.ya === 2025 || raw.ya === 2026 ? raw.ya : defaults.ya;
  const age =
    typeof raw.age === 'number' && Number.isInteger(raw.age) && raw.age >= 0 && raw.age <= 120
      ? raw.age
      : defaults.age;
  const residency: Residency =
    raw.residency === 'citizenOrPr' || raw.residency === 'foreigner'
      ? raw.residency
      : defaults.residency;
  const money = (x: unknown, fallback: number): number =>
    typeof x === 'number' && Number.isFinite(x) ? Math.max(0, x) : fallback;

  const rawEntries: Record<string, unknown> = isRecord(raw.entries) ? raw.entries : {};
  const entries: Partial<Record<ReliefId, EntryState>> = {};
  for (const id of RELIEF_IDS) entries[id] = parseEntry(rawEntries[id], id);

  return {
    v: 1,
    ya,
    employmentIncome: money(raw.employmentIncome, defaults.employmentIncome),
    bonus: money(raw.bonus, defaults.bonus),
    age,
    residency,
    entries,
  };
}
