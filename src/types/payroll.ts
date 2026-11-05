/** Editable pay rules. Change these when the company changes rates. */
export interface PayRules {
  basicSalary: number;
  transportAllowance: number;
  /**
   * Flat allowance paid for EVERY shift worked: normal shifts plus
   * Saturday, Sunday and public-holiday OT shifts.
   */
  shiftAllowancePerShift: number;
  weekdayOtMultiplier: number;
  saturdayMultiplier: number;
  /** Sunday / rest day multiplier. Public holidays worked are paid the same. */
  sundayMultiplier: number;
  /** "OT hours (short)": weekday worked + OT adds this many hours (default 1). */
  weekdayOtHoursPerDay: number;
  /** "OT hours (long)": weekday worked + long OT adds this many hours (default 1.25). */
  weekdayOtHoursLong: number;
  /** Full shift 8:00pm–5:45am = 8.75 hours. */
  fullShiftHours: number;
  /** Contractual weekly hours, used by the MOM hourly-rate formula. */
  weeklyHours: number;
  /** Target mode's fixed base: this many normal shifts, no OT / weekends / public holidays. */
  targetNormalShifts: number;
}

/** Singapore CPF employee contribution rules (age ≤ 55 by default). */
export interface CpfRules {
  /** Employee share for total wages ≥ fullRateWage, e.g. 0.2 = 20%. */
  employeeRate: number;
  /** Ordinary Wage ceiling per month. */
  owCeiling: number;
  /** At or below this, no employee CPF. */
  noContributionWage: number;
  /** At or above this, full employee rate applies. */
  fullRateWage: number;
  /** Phase-in multiplier applied to (wages − noContributionWage) between the two bands. */
  phaseInRate: number;
}

export interface Deduction {
  id: string;
  label: string;
  amount: number;
}

export interface PayrollConfig {
  rules: PayRules;
  cpf: CpfRules;
  /** Recurring deductions (MBF, Mendaki, …). */
  defaultDeductions: Deduction[];
  /** OT cycle runs from this day of the previous month… */
  otCycleStartDay: number;
  /** …to this day of the payout month. */
  otCycleEndDay: number;
  /** Day of month salary is credited. */
  payDay: number;
  /** Salary period ends on this day (or month end if shorter). */
  salaryPeriodEndDay: number;
}

/** OT you can choose to work (what target mode adjusts). */
export interface OtQuantities {
  weekdayOtHours: number;
  saturdayShifts: number;
  sundayShifts: number;
}

export interface PayInput extends OtQuantities {
  /** Normal shifts worked (whole number). OT shifts are counted separately. */
  normalShifts: number;
  /** Public holidays worked: paid exactly like a Sunday / rest day shift. */
  publicHolidayShifts: number;
  /** All non-CPF deductions applied this month. */
  deductions: Deduction[];
}

/** Per-unit OT rates, already including multipliers. */
export interface OtRates {
  weekdayPerHour: number;
  saturdayPerShift: number;
  /** Also used for public holidays. */
  sundayPerShift: number;
}

export interface LineItem {
  key: string;
  label: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  amount: number;
  note?: string;
}

export interface PayResult {
  rates: OtRates;
  earnings: LineItem[];
  gross: number;
  cpf: number;
  cpfRate: number;
  otherDeductions: LineItem[];
  totalDeductions: number;
  net: number;
}

export interface PayCycle {
  year: number;
  /** 1–12 */
  month: number;
  salaryStart: Date;
  salaryEnd: Date;
  otStart: Date;
  otEnd: Date;
  payDate: Date;
  /** Calendar days available in the OT cycle, by type. */
  weekdays: number;
  saturdays: number;
  sundays: number;
}

/**
 * State of a calendar day (no entry = off).
 * - 'worked': weekday = normal shift; Sat/Sun = full OT shift
 * - 'ot':     weekday normal shift + short OT (rules.weekdayOtHoursPerDay, 1h)
 * - 'otLong': weekday normal shift + long OT (rules.weekdayOtHoursLong, 1.25h)
 * - 'ph':     public holiday worked (any day): paid like a Sunday, not a normal shift
 */
export type DayStatus = 'worked' | 'ot' | 'otLong' | 'ph';

/** A dated calendar entry; its type (weekday / Sat / Sun) is inferred from the date. */
export interface OtEntry {
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  status: DayStatus;
}

/** Totals derived from the calendar ("Pick dates" mode). */
export interface DayTotals extends OtQuantities {
  /** Weekdays marked worked / worked + OT (not public holidays). */
  normalShifts: number;
  publicHolidayShifts: number;
}

export type DayKind = 'weekday' | 'saturday' | 'sunday';

export interface TargetLimits {
  maxSundays: number;
  maxSaturdays: number;
  maxWeekdayOtHours: number;
  /** Weekday OT is added in steps of this many hours (one OT day). */
  weekdayStep: number;
}

export interface TargetResult {
  reachable: boolean;
  /** Net of the fixed target base (no OT, no public holidays). */
  baseNet: number;
  combo: OtQuantities;
  result: PayResult;
  /** Amount still missing at max combo (only when unreachable). */
  shortfall: number;
  /** Other combos (fewer Sundays) that also reach the target. */
  alternatives: { combo: OtQuantities; net: number; gross: number }[];
}
