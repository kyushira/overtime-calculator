import { useMemo } from 'react';
import type { FormErrors, FormState } from '../types/form';
import type { Deduction, OtQuantities, PayCycle, PayInput, PayrollConfig } from '../types/payroll';
import { getPayCycle } from '../utils/cycle';
import { summariseEntries } from '../utils/dayLog';
import { calculatePay, mergeDeductions } from '../utils/payroll';
import { parseNonNegative, validateMonthYear } from '../utils/validation';

/**
 * Turns raw form strings into validated numbers + the calculation result.
 * Recomputes on every keystroke (cheap), so results update live.
 * Invalid fields are treated as 0 and reported in `errors`.
 */
export function usePayrollForm(form: FormState, config: PayrollConfig) {
  return useMemo(() => {
    const errors: FormErrors = {};
    const take = (key: string, p: { value: number; error?: string }) => {
      if (p.error) errors[key] = p.error;
      return p.value;
    };

    const my = validateMonthYear(form.year, form.month);
    if (my.error) errors.monthYear = my.error;
    const cycle: PayCycle | null = my.error ? null : getPayCycle(my.year, my.month, config);

    // "Pick dates": every total (incl. normal shifts and PHs) comes from the calendar.
    const fromCalendar = form.inputMode === 'log' && cycle !== null;
    let quantities: OtQuantities;
    let normalShifts: number;
    let publicHolidayShifts: number;
    if (fromCalendar) {
      const t = summariseEntries(form.entries, cycle, { short: config.rules.weekdayOtHoursPerDay, long: config.rules.weekdayOtHoursLong });
      quantities = { weekdayOtHours: t.weekdayOtHours, saturdayShifts: t.saturdayShifts, sundayShifts: t.sundayShifts };
      normalShifts = t.normalShifts;
      publicHolidayShifts = t.publicHolidayShifts;
    } else {
      normalShifts = take('normalShifts', parseNonNegative(form.normalShifts, 'Normal shifts worked', { integer: true }));
      quantities = {
        weekdayOtHours: take('weekdayOtHours', parseNonNegative(form.weekdayOtHours, 'Weekday OT hours', { max: 400 })),
        saturdayShifts: take('saturdayShifts', parseNonNegative(form.saturdayShifts, 'Saturday shifts', { integer: true, max: 6 })),
        sundayShifts: take('sundayShifts', parseNonNegative(form.sundayShifts, 'Sunday shifts', { integer: true, max: 6 })),
      };
      publicHolidayShifts = take('publicHolidayShifts', parseNonNegative(form.publicHolidayShifts, 'Public holiday shifts', { integer: true, max: 11 }));
    }

    // Soft warnings: implausible counts.
    const warnings: string[] = [];
    if (normalShifts > 31) warnings.push(`${normalShifts} normal shifts is more than a month normally has — double-check.`);
    if (cycle) {
      if (quantities.sundayShifts > cycle.sundays) warnings.push(`This OT cycle only has ${cycle.sundays} Sundays.`);
      if (quantities.saturdayShifts > cycle.saturdays) warnings.push(`This OT cycle only has ${cycle.saturdays} Saturdays.`);
    }

    const custom: Deduction[] = form.customDeductions.map((d) => ({
      id: d.id,
      label: d.label.trim() || 'Custom deduction',
      amount: take(`deduction-${d.id}`, parseNonNegative(d.amount, 'Amount')),
    }));

    const input: PayInput = {
      ...quantities,
      normalShifts,
      publicHolidayShifts,
      deductions: mergeDeductions(config.defaultDeductions, custom),
    };

    return { input, quantities, normalShifts, publicHolidayShifts, fromCalendar, cycle, errors, warnings, result: calculatePay(input, config) };
  }, [form, config]);
}
