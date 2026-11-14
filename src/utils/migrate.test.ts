import { describe, expect, it } from 'vitest';
import type { FormState } from '../types/form';
import { DEFAULT_CONFIG } from './defaults';
import { migrateConfig, migrateForm } from './migrate';
import { calculatePay } from './payroll';

/** Config as an older build saved it: C/L allowance, work days, payslip calibration block. */
const oldConfig = {
  rules: { ...DEFAULT_CONFIG.rules, weekdayOtHoursLong: undefined, shiftAllowancePerShift: undefined, shiftAllowance: { C: 150, L: 210 }, workDaysPerWeek: 5 },
  cpf: { ...DEFAULT_CONFIG.cpf, employeeRate: 0.17 },
  defaultDeductions: [{ id: 'mbf', label: 'MBF', amount: 14 }],
  payslip: { basicSalary: 3000, shifts: 'CL', otLines: [{ label: 'OT 1.5 (C)', hours: 6, amount: 141.61 }], restDayRatePerDay: 275.35 },
  otCycleStartDay: 14,
  otCycleEndDay: 13,
  payDay: 28,
  salaryPeriodEndDay: 30,
};

const initialForm: FormState = {
  year: '2026', month: '11', normalShifts: '22', inputMode: 'totals', weekdayOtHours: '', saturdayShifts: '',
  sundayShifts: '', publicHolidayShifts: '', entries: [], customDeductions: [], targetNet: '',
};

describe('saved-settings migration', () => {
  it('loads old configs: drops payslip / C-L / work days, fills new defaults, keeps edits', () => {
    const c = migrateConfig(JSON.parse(JSON.stringify(oldConfig)));
    expect(c.rules.shiftAllowancePerShift).toBe(15);
    expect(c.rules.weekdayOtHoursLong).toBe(1.25);
    expect(c.rules.targetNormalShifts).toBe(22);
    expect('shiftAllowance' in c.rules).toBe(false);
    expect('workDaysPerWeek' in c.rules).toBe(false);
    expect('payslip' in c).toBe(false);
    expect(c.cpf.employeeRate).toBe(0.17); // user edit kept
    expect(c.defaultDeductions[0].amount).toBe(14);
    const r = calculatePay({ normalShifts: 22, weekdayOtHours: 0, saturdayShifts: 0, sundayShifts: 0, publicHolidayShifts: 0, deductions: c.defaultDeductions }, c);
    expect(r.gross).toBe(3430);
  });

  it('keeps a valid current config unchanged', () => {
    const custom = { ...DEFAULT_CONFIG, rules: { ...DEFAULT_CONFIG.rules, weekdayOtHoursLong: 1.5 } };
    expect(migrateConfig(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
  });

  it('falls back to defaults on garbage', () => {
    expect(migrateConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(migrateConfig('nope')).toEqual(DEFAULT_CONFIG);
    expect(migrateConfig({ rules: { shiftAllowancePerShift: -5 } }).rules.shiftAllowancePerShift).toBe(15);
  });

  it('old forms: drops shifts / basis / CPF override, adds PH field, migrates entries', () => {
    const f = migrateForm(
      {
        ...initialForm,
        publicHolidayShifts: undefined,
        shifts: 'CL',
        basis: 'payslip',
        cpfRateOverride: '15',
        weekdayOtHours: '4',
        inputMode: 'log',
        entries: [{ id: 'a', date: '2026-09-15', status: 'ot', hours: 1.25 }],
      },
      initialForm,
    );
    expect(f.publicHolidayShifts).toBe('');
    expect(f.weekdayOtHours).toBe('4');
    expect(f.inputMode).toBe('log');
    expect(f.entries).toEqual([{ id: 'a', date: '2026-09-15', status: 'otLong' }]);
    for (const k of ['shifts', 'basis', 'cpfRateOverride']) expect(k in f).toBe(false);
    expect(migrateForm(42, initialForm)).toEqual(initialForm);
    expect(migrateForm({ inputMode: 'weird' }, initialForm).inputMode).toBe('totals');
  });
});

describe('imported config hardening', () => {
  const payInput = (c: ReturnType<typeof migrateConfig>) => ({
    normalShifts: 22, weekdayOtHours: 4, saturdayShifts: 1, sundayShifts: 0, publicHolidayShifts: 0,
    deductions: c.defaultDeductions,
  });

  it('keeps the default cpf values when the imported ones have the wrong type or are not finite', () => {
    expect(migrateConfig({ cpf: { employeeRate: '0.2', owCeiling: NaN } }).cpf).toEqual(DEFAULT_CONFIG.cpf);
  });

  it('keeps a string employeeRate out of the calculation so net pay stays finite', () => {
    const c = migrateConfig({ cpf: { employeeRate: '0.2' } });
    expect(c.cpf.employeeRate).toBe(DEFAULT_CONFIG.cpf.employeeRate);
    expect(Number.isFinite(calculatePay(payInput(c), c).net)).toBe(true);
  });

  it('drops default deductions with a string amount, so net pay stays finite', () => {
    const c = migrateConfig({ defaultDeductions: [{ id: 'mbf', label: 'MBF', amount: '5' }] });
    expect(Number.isFinite(calculatePay(payInput(c), c).net)).toBe(true);
  });

  it('keeps only valid deductions and copies only known keys', () => {
    const raw = [
      { id: 'x', label: 'X', amount: 2, extra: 'y' },
      { id: 'mbf', label: 'MBF', amount: '5' },
      null,
      { id: 'neg', label: 'N', amount: -1 },
      { id: 1, label: 'Num id', amount: 3 },
    ];
    expect(migrateConfig({ defaultDeductions: raw }).defaultDeductions).toEqual([{ id: 'x', label: 'X', amount: 2 }]);
  });

  it('falls back to default deductions when a non-empty list has no valid item', () => {
    expect(migrateConfig({ defaultDeductions: [{ id: 1, label: 'x', amount: 2 }] }).defaultDeductions).toEqual(DEFAULT_CONFIG.defaultDeductions);
  });

  it('keeps an intentionally empty deductions list empty', () => {
    expect(migrateConfig({ defaultDeductions: [] }).defaultDeductions).toEqual([]);
  });
});
