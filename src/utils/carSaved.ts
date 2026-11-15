import { computeCar, minDownRatio, parseNum, resolveDownpayment, tenureMonths, type CarForm } from './car';
import { defaultTenure, monthsUntilExpiry, splitMonths } from './coe';
import { round2 } from './payroll';
import type { SavedCar } from './savedCars';

/*
 * Figures for a saved car at the calculator's current tenure, rate and downpayment.
 * Pure: builds a clone of the form, so the form itself is never mutated.
 */

/** Downpayment as % of price, whichever field the user last edited. */
export function currentDownPct(form: CarForm): number {
  return resolveDownpayment(parseNum(form.price), form.downMode, parseNum(form.downPct), parseNum(form.downAmt)).downPct;
}

export interface SavedCarFigures {
  /** MAS minimum downpayment for this car (OMV unknown → the stricter 40%). */
  masMinPct: number;
  /** Downpayment % the figures below are computed at. */
  downPct: number;
  /** True when the downpayment is under the MAS minimum for this car. */
  belowMas: boolean;
  /** Null when the car has no usable price. */
  monthly: number | null;
  interest: number | null;
  /** Monthly instalment with a full loan (0% down). */
  monthlyFullLoan: number | null;
  /** COE months left for this car, or null when it has no recorded COE expiry. */
  coeLeft: number | null;
  /** Loan tenure the figures use: the form's tenure, capped at the car's COE left (minimum 1). */
  tenureMonths: number;
  /** True when the car's COE made the loan shorter than the form's tenure. */
  tenureCapped: boolean;
}

/**
 * Form clone for one saved car: its price and OMV, the calculator's rate, a given downpayment %
 * and the tenure this car uses (the form's tenure, capped at its COE).
 */
function formForCar(car: SavedCar, form: CarForm, downPct: number, months: number): CarForm {
  const { years, months: extra } = splitMonths(months);
  return {
    ...form,
    price: String(car.price),
    omv: car.omv === undefined ? '' : String(car.omv),
    downMode: 'pct',
    downPct: String(downPct),
    downAmt: '',
    years,
    months: extra,
  };
}

export function savedCarFigures(car: SavedCar, form: CarForm, today: Date): SavedCarFigures {
  const downPct = round2(currentDownPct(form));
  const masMinPct = minDownRatio(car.omv ?? null) * 100;
  const belowMas = downPct + 1e-9 < masMinPct;
  const formMonths = tenureMonths(parseNum(form.years), parseNum(form.months)).months;
  const coeLeft = car.coeExpiry === undefined ? null : monthsUntilExpiry(car.coeExpiry, today);
  const months = coeLeft === null ? formMonths : Math.min(formMonths, defaultTenure(coeLeft));
  const tenure = { coeLeft, tenureMonths: months, tenureCapped: months < formMonths };
  if (car.price === undefined || !(car.price > 0)) {
    return { masMinPct, downPct, belowMas, monthly: null, interest: null, monthlyFullLoan: null, ...tenure };
  }
  const atCurrent = computeCar(formForCar(car, form, downPct, months));
  const fullLoan = computeCar(formForCar(car, form, 0, months));
  return {
    masMinPct,
    downPct,
    belowMas,
    monthly: atCurrent.instalment,
    interest: atCurrent.interest,
    monthlyFullLoan: fullLoan.instalment,
    ...tenure,
  };
}

/**
 * Whether the compare table needs its separate 0%-down row. At a 0% current downpayment that row
 * repeats the "current downpayment" monthly figure, so the table drops it.
 */
export function showFullLoanRow(downPct: number): boolean {
  return downPct > 0;
}

/**
 * Form patch that loads a saved car's price, OMV and (when recorded) COE expiry into the
 * calculator. Percent mode, as typing a price does.
 */
export function loadPatch(car: SavedCar): Partial<CarForm> | null {
  if (car.price === undefined) return null;
  return {
    price: String(car.price),
    omv: car.omv === undefined ? '' : String(car.omv),
    downMode: 'pct',
    ...(car.coeExpiry !== undefined ? { coeMode: 'expiry' as const, coeExpiry: car.coeExpiry } : {}),
  };
}
