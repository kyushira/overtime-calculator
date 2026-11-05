import type { PayrollConfig } from '../types/payroll';

/**
 * Default payroll config. Everything here is editable in the Settings panel;
 * edit this file to change the factory defaults.
 */
export const DEFAULT_CONFIG: PayrollConfig = {
  rules: {
    basicSalary: 3000,
    transportAllowance: 100,
    shiftAllowancePerShift: 15, // flat $15 per shift worked, weekend / PH OT shifts included
    weekdayOtMultiplier: 1.5,
    saturdayMultiplier: 1.5,
    sundayMultiplier: 2.0, // Sunday / rest day; public holidays worked pay the same
    weekdayOtHoursPerDay: 1, // "OT hours (short)"
    weekdayOtHoursLong: 1.25, // "OT hours (long)"
    fullShiftHours: 8.75, // 8:00pm → 5:45am
    weeklyHours: 44,
    targetNormalShifts: 22, // Target mode base: 22 normal shifts, no OT / PH
  },
  cpf: {
    employeeRate: 0.2,
    owCeiling: 8000, // OW ceiling from 1 Jan 2026
    noContributionWage: 500,
    fullRateWage: 750,
    phaseInRate: 0.6,
  },
  defaultDeductions: [
    { id: 'mbf', label: 'MBF', amount: 5 },
    { id: 'mendaki', label: 'Mendaki', amount: 5 },
  ],
  otCycleStartDay: 14,
  otCycleEndDay: 13,
  payDay: 28,
  salaryPeriodEndDay: 30,
};

/** Default "Normal shifts worked" in Enter totals mode. */
export const DEFAULT_NORMAL_SHIFTS = 22;
