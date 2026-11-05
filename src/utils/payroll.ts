import type {
  CpfRules,
  Deduction,
  LineItem,
  OtQuantities,
  OtRates,
  PayInput,
  PayResult,
  PayRules,
  PayrollConfig,
  TargetLimits,
  TargetResult,
} from '../types/payroll';

/** Round to cents (half away from zero). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Shifts that earn the flat shift allowance: every shift worked, i.e.
 * normal + Saturday + Sunday + public-holiday shifts.
 * Weekday OT hours are extra hours on a normal shift, so they add none.
 */
export function shiftsWorked(
  input: Pick<PayInput, 'normalShifts' | 'saturdayShifts' | 'sundayShifts' | 'publicHolidayShifts'>,
): number {
  return input.normalShifts + input.saturdayShifts + input.sundayShifts + (input.publicHolidayShifts ?? 0);
}

/* ------------------------------------------------------------------ */
/* Rates (formula basis: hours × hourly rate × multiplier)             */
/* ------------------------------------------------------------------ */

/**
 * MOM hourly basic rate for monthly-rated employees:
 *   (12 × monthly basic) / (52 × weekly contractual hours)
 * 12 × 3000 / (52 × 44) = 15.7343…  →  ×1.5 = 23.6014/hr
 */
export function hourlyRate(rules: PayRules): number {
  return (12 * rules.basicSalary) / (52 * rules.weeklyHours);
}

/**
 * Every OT type = hours × hourly rate × multiplier.
 * Saturday = 8.75 × hourly × 1.5; Sunday / public holiday = 8.75 × hourly × 2.
 */
export function formulaRates(rules: PayRules): OtRates {
  const h = hourlyRate(rules);
  return {
    weekdayPerHour: h * rules.weekdayOtMultiplier,
    saturdayPerShift: h * rules.saturdayMultiplier * rules.fullShiftHours,
    sundayPerShift: h * rules.sundayMultiplier * rules.fullShiftHours,
  };
}

/* ------------------------------------------------------------------ */
/* CPF                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Employee CPF on ordinary wages (OT is ordinary wage).
 *  - ≤ $500: nil
 *  - $500–$750: phase-in = phaseInRate × (wages − 500)
 *  - ≥ $750: employeeRate × min(wages, OW ceiling)
 * The employee share is rounded DOWN to the dollar (cents dropped).
 */
export function calculateEmployeeCpf(wages: number, cpf: CpfRules, rateOverride?: number): number {
  const rate = rateOverride ?? cpf.employeeRate;
  if (wages <= cpf.noContributionWage) return 0;
  if (wages < cpf.fullRateWage) {
    // Phase-in is capped at the full-rate amount.
    const phased = cpf.phaseInRate * (wages - cpf.noContributionWage);
    return Math.floor(Math.min(phased, rate * wages));
  }
  return Math.floor(rate * Math.min(wages, cpf.owCeiling) + 1e-9);
}

/* ------------------------------------------------------------------ */
/* Full calculation                                                    */
/* ------------------------------------------------------------------ */

export function calculatePay(input: PayInput, config: PayrollConfig): PayResult {
  const { rules } = config;
  const rates = formulaRates(rules);
  const ph = input.publicHolidayShifts ?? 0;

  const earnings: LineItem[] = [
    { key: 'basic', label: 'Basic salary', amount: round2(rules.basicSalary) },
    { key: 'transport', label: 'Transport allowance', amount: round2(rules.transportAllowance) },
  ];

  // Flat allowance per shift worked.
  const shifts = shiftsWorked(input);
  earnings.push({
    key: 'shift-allowance',
    label: 'Shift allowance',
    quantity: shifts,
    unit: 'shifts',
    rate: rules.shiftAllowancePerShift,
    amount: round2(shifts * rules.shiftAllowancePerShift),
  });

  // Each OT line is rounded to cents individually, as on a payslip.
  if (input.weekdayOtHours > 0) {
    earnings.push({
      key: 'ot-weekday',
      label: `Weekday OT ${rules.weekdayOtMultiplier}x`,
      quantity: input.weekdayOtHours,
      unit: 'hrs',
      rate: rates.weekdayPerHour,
      amount: round2(input.weekdayOtHours * rates.weekdayPerHour),
    });
  }
  if (input.saturdayShifts > 0) {
    earnings.push({
      key: 'ot-saturday',
      label: `Saturday ${rules.saturdayMultiplier}x`,
      quantity: input.saturdayShifts,
      unit: 'shifts',
      rate: rates.saturdayPerShift,
      amount: round2(input.saturdayShifts * rates.saturdayPerShift),
    });
  }
  if (input.sundayShifts > 0) {
    earnings.push({
      key: 'ot-sunday',
      label: `Sunday / Rest day ${rules.sundayMultiplier}x`,
      quantity: input.sundayShifts,
      unit: 'shifts',
      rate: rates.sundayPerShift,
      amount: round2(input.sundayShifts * rates.sundayPerShift),
    });
  }
  if (ph > 0) {
    earnings.push({
      key: 'ot-ph',
      label: `Public holiday ${rules.sundayMultiplier}x`,
      quantity: ph,
      unit: 'shifts',
      rate: rates.sundayPerShift,
      amount: round2(ph * rates.sundayPerShift),
    });
  }

  const gross = round2(earnings.reduce((s, e) => s + e.amount, 0));
  const cpfRate = config.cpf.employeeRate;
  const cpf = calculateEmployeeCpf(gross, config.cpf);

  const otherDeductions: LineItem[] = input.deductions
    .filter((d) => d.amount > 0)
    .map((d) => ({ key: d.id, label: d.label || 'Deduction', amount: round2(d.amount) }));

  const totalDeductions = round2(cpf + otherDeductions.reduce((s, d) => s + d.amount, 0));

  return { rates, earnings, gross, cpf, cpfRate, otherDeductions, totalDeductions, net: round2(gross - totalDeductions) };
}

/* ------------------------------------------------------------------ */
/* Target mode                                                         */
/* ------------------------------------------------------------------ */

/**
 * Target mode's fixed base, independent of anything typed on the Calculator
 * tab or tapped on the calendar: basic + transport + shift allowance for
 * `rules.targetNormalShifts` normal shifts, no OT / weekends / public holidays,
 * deductions = CPF + the fixed deductions from Settings only (no custom ones).
 */
export function targetBase(config: PayrollConfig): Omit<PayInput, keyof OtQuantities> {
  return { normalShifts: config.rules.targetNormalShifts, publicHolidayShifts: 0, deductions: config.defaultDeductions };
}

/**
 * Smallest combo reaching `targetNet`, filling in priority order:
 *   1. Sundays (up to maxSundays), 2. Saturdays, 3. weekday OT (in day-sized steps).
 * Each step re-runs the full calculation because CPF is floored and non-linear.
 * Every added Saturday / Sunday also earns one shift allowance; weekday OT hours don't.
 * Public holidays are never added (you don't choose to work them). Target mode's
 * base comes from targetBase(), which sets publicHolidayShifts: 0, so PHs entered
 * on the calendar are not in the base. Any `base.publicHolidayShifts` a caller does
 * pass is included in every run, including the base net.
 */
export function findMinimumCombo(
  targetNet: number,
  base: Omit<PayInput, keyof OtQuantities>,
  config: PayrollConfig,
  limits: TargetLimits,
): TargetResult {
  const run = (q: OtQuantities) => calculatePay({ ...base, ...q }, config);
  const step = limits.weekdayStep > 0 ? limits.weekdayStep : 1;
  const baseNet = run({ sundayShifts: 0, saturdayShifts: 0, weekdayOtHours: 0 }).net;

  /** Min Saturdays, then weekday hours, for a fixed Sunday count. null if impossible. */
  const fillFrom = (sundays: number): OtQuantities | null => {
    for (let sat = 0; sat <= limits.maxSaturdays; sat++) {
      const q = { sundayShifts: sundays, saturdayShifts: sat, weekdayOtHours: 0 };
      if (run(q).net >= targetNet) return q;
    }
    for (let hrs = step; hrs <= limits.maxWeekdayOtHours + 1e-9; hrs += step) {
      const q = { sundayShifts: sundays, saturdayShifts: limits.maxSaturdays, weekdayOtHours: round2(hrs) };
      if (run(q).net >= targetNet) return q;
    }
    return null;
  };

  let combo: OtQuantities | null = null;
  for (let sun = 0; sun <= limits.maxSundays && !combo; sun++) {
    const q = { sundayShifts: sun, saturdayShifts: 0, weekdayOtHours: 0 };
    if (run(q).net >= targetNet) combo = q;
  }
  if (!combo) combo = fillFrom(limits.maxSundays);

  if (!combo) {
    const max = { sundayShifts: limits.maxSundays, saturdayShifts: limits.maxSaturdays, weekdayOtHours: limits.maxWeekdayOtHours };
    const result = run(max);
    return { reachable: false, baseNet, combo: max, result, shortfall: round2(targetNet - result.net), alternatives: [] };
  }

  const alternatives: TargetResult['alternatives'] = [];
  for (let sun = combo.sundayShifts - 1; sun >= 0; sun--) {
    const alt = fillFrom(sun);
    if (!alt) break;
    const r = run(alt);
    alternatives.push({ combo: alt, net: r.net, gross: r.gross });
  }

  return { reachable: true, baseNet, combo, result: run(combo), shortfall: 0, alternatives };
}

/** Build the deductions list for a month: defaults + user customs. */
export function mergeDeductions(defaults: Deduction[], custom: Deduction[]): Deduction[] {
  return [...defaults, ...custom];
}
