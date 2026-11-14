import type { FormState } from '../types/form';
import type { CpfRules, Deduction, PayrollConfig, PayRules } from '../types/payroll';
import { migrateEntries } from './dayLog';
import { sanitizeCustomDeductions } from './months';
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

/** Known cpf keys only; a value is kept when its type matches the default (and is finite when a number). */
function readCpf(v: unknown): CpfRules {
  const d = DEFAULT_CONFIG.cpf;
  const cpf = { ...d };
  if (!isObj(v)) return cpf;
  for (const k of Object.keys(d) as (keyof CpfRules)[]) {
    const x = v[k];
    if (typeof x === typeof d[k] && (typeof x !== 'number' || Number.isFinite(x))) (cpf as Obj)[k] = x;
  }
  return cpf;
}

/** Valid deductions only. An intentionally empty list stays empty; a non-empty list with nothing valid falls back to defaults. */
function readDeductions(v: unknown): Deduction[] {
  if (!Array.isArray(v)) return DEFAULT_CONFIG.defaultDeductions;
  if (v.length === 0) return [];
  const out: Deduction[] = [];
  for (const x of v) {
    if (isObj(x) && typeof x.id === 'string' && typeof x.label === 'string' && isNum(x.amount) && x.amount >= 0) {
      out.push({ id: x.id, label: x.label, amount: x.amount });
    }
  }
  return out.length > 0 ? out : DEFAULT_CONFIG.defaultDeductions;
}

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
    cpf: readCpf(raw.cpf),
    defaultDeductions: readDeductions(raw.defaultDeductions),
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
  form.customDeductions = Array.isArray(raw.customDeductions) ? sanitizeCustomDeductions(raw.customDeductions) : initial.customDeductions;
  return form;
}
