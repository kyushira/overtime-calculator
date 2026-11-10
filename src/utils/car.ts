import { round2 } from './payroll';

/*
 * Singapore car financing maths. Ported from sg-car-calculator/index.html.
 * Pure functions only (no DOM). All inputs arrive as the raw strings the form
 * holds; `computeCar` parses, clamps and derives everything the UI shows.
 */

export type DownMode = 'pct' | 'amt';

export const RUNNING_COSTS = [
  { id: 'insurance', label: 'Insurance', per: 'year', def: 1800 },
  { id: 'roadtax', label: 'Road tax', per: 'year', def: 1000 },
  { id: 'service', label: 'Servicing & maintenance', per: 'year', def: 800 },
  { id: 'parking', label: 'Parking', per: 'month', def: 110 },
  { id: 'petrol', label: 'Petrol / charging', per: 'month', def: 300 },
  { id: 'erp', label: 'ERP & tolls', per: 'month', def: 0 },
] as const;

export type RunningId = (typeof RUNNING_COSTS)[number]['id'];
export type RunningPer = 'year' | 'month';

/** Raw form state, exactly as typed. Everything is a string so partial input is kept. */
export interface CarForm {
  price: string;
  omv: string;
  downMode: DownMode;
  downPct: string;
  downAmt: string;
  years: string;
  months: string;
  rate: string;
  salary: string;
  running: Record<RunningId, string>;
}

export const MAX_TENURE_MONTHS = 84;
const OMV_CAP_THRESHOLD = 20000;

export const DEFAULT_CAR_FORM: CarForm = {
  price: '150000',
  omv: '',
  downMode: 'pct',
  downPct: '40',
  downAmt: '',
  years: '7',
  months: '0',
  rate: '2.78',
  salary: '',
  running: Object.fromEntries(RUNNING_COSTS.map((r) => [r.id, String(r.def)])) as Record<RunningId, string>,
};

/** Mirrors the source's num(): parseFloat, anything unparseable is 0. */
export function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** MAS cap: OMV ≤ S$20,000 → min 30% down. OMV above, or blank → min 40% down (stricter). */
export function minDownRatio(omv: number | null): number {
  return omv !== null && Number.isFinite(omv) && omv <= OMV_CAP_THRESHOLD ? 0.3 : 0.4;
}

export interface Tenure {
  /** Months actually used in the maths (clamped to 1..84). */
  months: number;
  /** Requested months before clamping. */
  requested: number;
  error: string;
}

/** Tenure = years × 12 + months. Valid range 1–84; months part 0–11. */
export function tenureMonths(years: number, months: number): Tenure {
  const y = Number.isFinite(years) ? years : 0;
  const m = Number.isFinite(months) ? months : 0;
  const total = Math.round(y * 12 + m);
  let error = '';
  if (y < 0 || m < 0) error = 'Tenure cannot be negative.';
  else if (m > 11) error = 'Months must be 0–11.';
  else if (total > MAX_TENURE_MONTHS) error = 'Maximum tenure is 7 years (84 months) under MAS rules.';
  else if (total < 1) error = 'Minimum tenure is 1 month.';
  return { months: Math.min(MAX_TENURE_MONTHS, Math.max(1, total)), requested: total, error };
}

/** "7y", "1y 2m", "0y 6m" — the tenure label used in the TCO tile. */
export function formatTenure(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y}y${m ? ` ${m}m` : ''}`;
}

export function downFromPct(price: number, pct: number): number {
  return (price * pct) / 100;
}

export function pctFromDown(price: number, down: number): number {
  return price > 0 ? (down / price) * 100 : 0;
}

export interface DownpaymentResolved {
  /** Downpayment used in the loan: clamped to 0..price. */
  down: number;
  /** Unclamped S$ and % as derived from whichever field the user is editing. */
  downAmt: number;
  downPct: number;
  /** Shown in the non-active field (the active field shows the raw typed text). */
  downAmtText: string;
  downPctText: string;
  error: string;
}

/**
 * Downpayment sync. The field last edited is the source of truth; the other is
 * derived. Changing the car price keeps the % (so mode is reset to 'pct' by the UI).
 */
export function resolveDownpayment(price: number, mode: DownMode, pctIn: number, amtIn: number): DownpaymentResolved {
  const downAmt = mode === 'amt' ? amtIn : downFromPct(price, pctIn);
  const downPct = mode === 'amt' ? pctFromDown(price, amtIn) : pctIn;
  let error = '';
  if (downAmt < 0 || downPct < 0) error = 'Downpayment cannot be negative.';
  else if (downAmt > price) error = 'Downpayment cannot exceed the car price.';
  return {
    down: Math.min(Math.max(0, downAmt), price),
    downAmt,
    downPct,
    downAmtText: String(round2(downAmt)),
    downPctText: price > 0 ? String(round2(downPct)) : '',
    error,
  };
}

export interface LoanInput {
  price: number;
  omv: number | null;
  down: number;
  months: number;
  rate: number;
}

export interface LoanResult {
  loan: number;
  interest: number;
  repayable: number;
  instalment: number;
  /** Approximate effective rate, % p.a. */
  eir: number;
  minDown: number;
  minDownPct: number;
  maxLoan: number;
  /** Downpayment is below the MAS minimum. */
  belowMin: boolean;
  omvAssumed: boolean;
}

/** Flat-rate loan: interest = loan × rate × years, instalment = (loan + interest) ÷ months. */
export function computeLoan(o: LoanInput): LoanResult {
  const ratio = minDownRatio(o.omv);
  const loan = Math.max(0, o.price - o.down);
  const years = o.months / 12;
  const interest = loan * (o.rate / 100) * years;
  const repayable = loan + interest;
  const minDown = o.price * ratio;
  return {
    loan,
    interest,
    repayable,
    instalment: o.months > 0 ? repayable / o.months : 0,
    eir: (o.rate * 2 * o.months) / (o.months + 1),
    minDown,
    minDownPct: ratio * 100,
    maxLoan: o.price - minDown,
    belowMin: o.down + 1e-9 < minDown,
    omvAssumed: o.omv === null,
  };
}

/** Running costs, per month. Negative values count as 0. */
export function runningMonthly(items: { value: number; per: RunningPer }[]): number {
  return items.reduce((s, r) => s + runningItemMonthly(r.value, r.per), 0);
}

function runningItemMonthly(value: number, per: RunningPer): number {
  const v = Math.max(0, Number.isFinite(value) ? value : 0);
  return per === 'year' ? v / 12 : v;
}

export interface Totals {
  totalMonthly: number;
  /** Downpayment + total repayable + running costs over the whole tenure. */
  tco: number;
  minSalary: number;
  recSalary: number;
}

export function totals(o: { instalment: number; running: number; down: number; repayable: number; months: number }): Totals {
  const totalMonthly = o.instalment + o.running;
  return {
    totalMonthly,
    tco: o.down + o.repayable + o.running * o.months,
    minSalary: totalMonthly / 0.7,
    recSalary: totalMonthly / 0.3,
  };
}

export type AffordBand = 'ok' | 'warn' | 'bad';

export interface Affordability {
  pct: number;
  band: AffordBand;
  verdict: 'Comfortable' | 'Stretching' | 'Not affordable';
}

/** Share of monthly salary taken by the car. ≤30% comfortable, ≤70% stretching, else not. */
export function affordability(totalMonthly: number, salary: number): Affordability | null {
  if (!(salary > 0)) return null;
  const pct = (totalMonthly / salary) * 100;
  const band: AffordBand = pct <= 30 ? 'ok' : pct <= 70 ? 'warn' : 'bad';
  const verdict = band === 'ok' ? 'Comfortable' : band === 'warn' ? 'Stretching' : 'Not affordable';
  return { pct, band, verdict };
}

export interface RunningItemResult {
  id: RunningId;
  label: string;
  per: RunningPer;
  /** Monthly equivalent (yearly items ÷ 12). */
  monthly: number;
}

export interface CarResult {
  price: number;
  omv: number | null;
  omvAssumed: boolean;
  minDownPct: number;
  maxLoanPct: number;
  down: number;
  downAmtText: string;
  downPctText: string;
  /** Downpayment as % of price, rounded for display. */
  downSharePct: number;
  downError: string;
  /** Below MAS minimum, shown as a warning (only when the downpayment itself is valid). */
  minDownWarning: boolean;
  loan: number;
  maxLoan: number;
  minDown: number;
  tenure: Tenure;
  interest: number;
  repayable: number;
  instalment: number;
  eir: number;
  runningItems: RunningItemResult[];
  running: number;
  totalMonthly: number;
  tco: number;
  minSalary: number;
  recSalary: number;
  salary: number;
  affordability: Affordability | null;
  /** Field-level "Cannot be negative." messages keyed by input. */
  negErrors: Partial<Record<'price' | 'omv' | 'rate' | 'salary' | RunningId, string>>;
  tenureError: string;
}

const NEG = 'Cannot be negative.';

/** Everything the car calculator shows, from the raw form. */
export function computeCar(f: CarForm): CarResult {
  const price = Math.max(0, parseNum(f.price));
  const omvRaw = f.omv.trim();
  const omv = omvRaw === '' ? null : Math.max(0, parseNum(omvRaw));
  const rate = Math.max(0, parseNum(f.rate));
  const salaryRaw = parseNum(f.salary);

  const dp = resolveDownpayment(price, f.downMode, parseNum(f.downPct), parseNum(f.downAmt));
  const tenure = tenureMonths(parseNum(f.years), parseNum(f.months));
  const loan = computeLoan({ price, omv, down: dp.down, months: tenure.months, rate });

  const runningItems: RunningItemResult[] = RUNNING_COSTS.map((r) => ({
    id: r.id,
    label: r.label,
    per: r.per,
    monthly: runningItemMonthly(parseNum(f.running[r.id]), r.per),
  }));
  const running = runningMonthly(runningItems.map((r) => ({ value: r.monthly, per: 'month' })));
  const t = totals({ instalment: loan.instalment, running, down: dp.down, repayable: loan.repayable, months: tenure.months });

  const negErrors: CarResult['negErrors'] = {};
  if (parseNum(f.price) < 0) negErrors.price = NEG;
  if (omvRaw !== '' && parseNum(omvRaw) < 0) negErrors.omv = NEG;
  if (parseNum(f.rate) < 0) negErrors.rate = NEG;
  if (salaryRaw < 0) negErrors.salary = NEG;
  for (const r of RUNNING_COSTS) if (parseNum(f.running[r.id]) < 0) negErrors[r.id] = NEG;

  return {
    price,
    omv,
    omvAssumed: loan.omvAssumed,
    minDownPct: loan.minDownPct,
    maxLoanPct: 100 - loan.minDownPct,
    down: dp.down,
    downAmtText: dp.downAmtText,
    downPctText: dp.downPctText,
    downSharePct: price > 0 ? round2((dp.down / price) * 100) : 0,
    downError: dp.error,
    minDownWarning: loan.belowMin && price > 0 && !dp.error,
    loan: loan.loan,
    maxLoan: loan.maxLoan,
    minDown: loan.minDown,
    tenure,
    interest: loan.interest,
    repayable: loan.repayable,
    instalment: loan.instalment,
    eir: loan.eir,
    runningItems,
    running,
    totalMonthly: t.totalMonthly,
    tco: t.tco,
    minSalary: t.minSalary,
    recSalary: t.recSalary,
    salary: salaryRaw,
    affordability: affordability(t.totalMonthly, salaryRaw),
    negErrors,
    tenureError: tenure.error,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

/**
 * Saved-inputs migration for 'carcalc.inputs.v1'. Anything that isn't the right
 * type falls back to the default for that field; other saved fields are kept.
 */
export function migrateCarForm(raw: unknown): CarForm {
  const d = DEFAULT_CAR_FORM;
  if (!isObj(raw)) return d;
  const rawRunning = isObj(raw.running) ? raw.running : {};
  const running = {} as Record<RunningId, string>;
  for (const r of RUNNING_COSTS) running[r.id] = str(rawRunning[r.id], d.running[r.id]);
  return {
    price: str(raw.price, d.price),
    omv: str(raw.omv, d.omv),
    downMode: raw.downMode === 'amt' || raw.downMode === 'pct' ? raw.downMode : d.downMode,
    downPct: str(raw.downPct, d.downPct),
    downAmt: str(raw.downAmt, d.downAmt),
    years: str(raw.years, d.years),
    months: str(raw.months, d.months),
    rate: str(raw.rate, d.rate),
    salary: str(raw.salary, d.salary),
    running,
  };
}
