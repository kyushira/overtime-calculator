import { computeCar, minDownRatio, parseNum, resolveDownpayment, type CarForm } from './car';
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
}

/** Form clone for one saved car: its price and OMV, the calculator's tenure and rate, and a given downpayment %. */
function formForCar(car: SavedCar, form: CarForm, downPct: number): CarForm {
  return {
    ...form,
    price: String(car.price),
    omv: car.omv === undefined ? '' : String(car.omv),
    downMode: 'pct',
    downPct: String(downPct),
    downAmt: '',
  };
}

export function savedCarFigures(car: SavedCar, form: CarForm): SavedCarFigures {
  const downPct = round2(currentDownPct(form));
  const masMinPct = minDownRatio(car.omv ?? null) * 100;
  const belowMas = downPct + 1e-9 < masMinPct;
  if (car.price === undefined || !(car.price > 0)) {
    return { masMinPct, downPct, belowMas, monthly: null, interest: null, monthlyFullLoan: null };
  }
  const atCurrent = computeCar(formForCar(car, form, downPct));
  const fullLoan = computeCar(formForCar(car, form, 0));
  return {
    masMinPct,
    downPct,
    belowMas,
    monthly: atCurrent.instalment,
    interest: atCurrent.interest,
    monthlyFullLoan: fullLoan.instalment,
  };
}

/** Form patch that loads a saved car's price and OMV into the calculator (percent mode, as typing a price does). */
export function loadPatch(car: SavedCar): Partial<CarForm> | null {
  if (car.price === undefined) return null;
  return {
    price: String(car.price),
    omv: car.omv === undefined ? '' : String(car.omv),
    downMode: 'pct',
  };
}
