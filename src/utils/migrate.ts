import type { FormState } from '../types/form';
import type { PayrollConfig, PayRules } from '../types/payroll';
import { migrateEntries } from './dayLog';
import { DEFAULT_CONFIG } from './defaults';

/*
 * Saved-settings migration. Anything unreadable falls back to defaults; the
 * user's other saved edits are kept. Dropped over time:
 * - rules.shiftAllowance {C, L}  → flat rules.shiftAllowancePerShift
 * - rules.workDaysPerWeek, config.payslip (payslip calibration; formula only now)
 * - form.shifts, form.basis, form.cpfRateOverride
 * - calendar entry `hours` (now OT short / long states); see migrateEntries
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function migrateConfig(raw: unknown): PayrollConfig {
  if (!isObj(raw)) return DEFAULT_CONFIG;
  const d = DEFAULT_CONFIG;

  const rawRules = isObj(raw.rules) ? raw.rules : {};
  const rules = { ...d.rules } as PayRules;
  for (const k of Object.keys(d.rules) as (keyof PayRules)[]) {
    const v = rawRules[k];
    if (isNum(v) && v >= 0) rules[k] = v;
  }

  return {
    rules,
    cpf: { ...d.cpf, ...(isObj(raw.cpf) ? (raw.cpf as Partial<PayrollConfig['cpf']>) : {}) },
    defaultDeductions: Array.isArray(raw.defaultDeductions) ? (raw.defaultDeductions as PayrollConfig['defaultDeductions']) : d.defaultDeductions,
    otCycleStartDay: isNum(raw.otCycleStartDay) ? raw.otCycleStartDay : d.otCycleStartDay,
    otCycleEndDay: isNum(raw.otCycleEndDay) ? raw.otCycleEndDay : d.otCycleEndDay,
    payDay: isNum(raw.payDay) ? raw.payDay : d.payDay,
    salaryPeriodEndDay: isNum(raw.salaryPeriodEndDay) ? raw.salaryPeriodEndDay : d.salaryPeriodEndDay,
  };
}

export function migrateForm(raw: unknown, initial: FormState, otHours = { short: DEFAULT_CONFIG.rules.weekdayOtHoursPerDay, long: DEFAULT_CONFIG.rules.weekdayOtHoursLong }): FormState {
  if (!isObj(raw)) return initial;
  const form = { ...initial } as FormState;
  for (const k of Object.keys(initial) as (keyof FormState)[]) {
    if (k === 'entries' || k === 'customDeductions' || k === 'inputMode') continue;
    if (typeof raw[k] === 'string') (form as unknown as Obj)[k] = raw[k];
  }
  form.inputMode = raw.inputMode === 'log' || raw.inputMode === 'totals' ? raw.inputMode : initial.inputMode;
  form.entries = Array.isArray(raw.entries) ? migrateEntries(raw.entries, otHours) : initial.entries;
  form.customDeductions = Array.isArray(raw.customDeductions) ? (raw.customDeductions as FormState['customDeductions']) : initial.customDeductions;
  return form;
}
