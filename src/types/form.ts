import type { OtEntry } from './payroll';

export type InputMode = 'totals' | 'log';

/** A user-added deduction; amount kept as a string while editing. */
export interface CustomDeductionDraft {
  id: string;
  label: string;
  amount: string;
}

/** Raw (string-backed) UI state. Parsed/validated by usePayrollForm. */
export interface FormState {
  year: string;
  month: string;
  /** Normal shifts worked this month (whole number, string while editing). */
  normalShifts: string;
  inputMode: InputMode;
  weekdayOtHours: string;
  saturdayShifts: string;
  sundayShifts: string;
  publicHolidayShifts: string;
  entries: OtEntry[];
  customDeductions: CustomDeductionDraft[];
  targetNet: string;
}

export type FormErrors = Partial<Record<string, string>>;
