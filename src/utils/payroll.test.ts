import { describe, expect, it } from 'vitest';
import { getPayCycle } from './cycle';
import { applyHoldOption, markAllWorked, summariseEntries, togglePublicHoliday } from './dayLog';
import { DEFAULT_CONFIG } from './defaults';
import { calculateEmployeeCpf, calculatePay, findMinimumCombo, formulaRates, hourlyRate, round2, targetBase } from './payroll';

const cfg = DEFAULT_CONFIG;
const none = { normalShifts: 22, weekdayOtHours: 0, saturdayShifts: 0, sundayShifts: 0, publicHolidayShifts: 0, deductions: cfg.defaultDeductions };
const line = (r: ReturnType<typeof calculatePay>, key: string) => r.earnings.find((e) => e.key === key);

describe('formula rates (hours × hourly × multiplier)', () => {
  it('hourly = 12 × basic ÷ (52 × 44)', () => {
    expect(hourlyRate(cfg.rules)).toBeCloseTo(15.7343, 4);
  });

  it('weekday OT 1.5x reproduces the sample OT lines', () => {
    const r = formulaRates(cfg.rules);
    expect(round2(6 * r.weekdayPerHour)).toBe(141.61);
    expect(round2(10 * r.weekdayPerHour)).toBe(236.01);
  });

  it('Sunday = 8.75 × hourly × 2 = 275.35; Saturday = 8.75 × hourly × 1.5 = 206.51', () => {
    const r = formulaRates(cfg.rules);
    expect(round2(r.sundayPerShift)).toBe(275.35);
    expect(round2(r.saturdayPerShift)).toBe(206.51);
  });
});

describe('CPF', () => {
  it('handles bands', () => {
    expect(calculateEmployeeCpf(400, cfg.cpf)).toBe(0);
    expect(calculateEmployeeCpf(600, cfg.cpf)).toBe(60);
    expect(calculateEmployeeCpf(10000, cfg.cpf)).toBe(1600);
    expect(calculateEmployeeCpf(4000, cfg.cpf, 0.15)).toBe(600);
  });
});

describe('default month', () => {
  it('22 normal shifts, no OT: gross 3430, CPF 686, net 2734.00', () => {
    const r = calculatePay(none, cfg);
    expect(line(r, 'shift-allowance')!.amount).toBe(330);
    expect(r.gross).toBe(3430);
    expect(r.cpf).toBe(686);
    expect(r.net).toBe(2734);
  });

  it('uses the CPF employee rate from settings', () => {
    const c = { ...cfg, cpf: { ...cfg.cpf, employeeRate: 0.15 } };
    const r = calculatePay(none, c);
    expect(r.cpfRate).toBe(0.15);
    expect(r.cpf).toBe(514); // floor(0.15 × 3430)
  });
});

describe('shift allowance (flat rate per shift worked)', () => {
  it('Sat, Sun and PH shifts each add one shift; weekday OT hours add none', () => {
    const r = calculatePay({ ...none, normalShifts: 20, saturdayShifts: 2, sundayShifts: 3, publicHolidayShifts: 1, weekdayOtHours: 10 }, cfg);
    expect(line(r, 'shift-allowance')!.quantity).toBe(26);
    expect(line(r, 'shift-allowance')!.amount).toBe(390);
  });

  it('uses the editable per-shift rate', () => {
    const c = { ...cfg, rules: { ...cfg.rules, shiftAllowancePerShift: 20 } };
    expect(line(calculatePay(none, c), 'shift-allowance')!.amount).toBe(440);
  });
});

describe('public holiday worked', () => {
  it('is paid exactly like a Sunday, on its own line, plus one shift allowance', () => {
    const ph = calculatePay({ ...none, publicHolidayShifts: 1 }, cfg);
    const sun = calculatePay({ ...none, sundayShifts: 1 }, cfg);
    expect(line(ph, 'ot-ph')).toMatchObject({ label: 'Public holiday 2x', quantity: 1, amount: 275.35 });
    expect(line(ph, 'ot-sunday')).toBeUndefined();
    expect(line(ph, 'ot-ph')!.rate).toBe(line(sun, 'ot-sunday')!.rate);
    expect(ph.gross).toBe(sun.gross);
    expect(ph.gross).toBe(round2(3430 + 275.35 + 15));
  });

  it('example: 22 normal shifts (2 at +1.25h) + 1 PH → gross 3779.35, CPF 755, net 3014.35', () => {
    const r = calculatePay({ ...none, weekdayOtHours: 2.5, publicHolidayShifts: 1 }, cfg);
    expect(line(r, 'shift-allowance')!.amount).toBe(345);
    expect(line(r, 'ot-weekday')!.amount).toBe(59);
    expect(line(r, 'ot-ph')!.amount).toBe(275.35);
    expect(r.gross).toBe(3779.35);
    expect(r.cpf).toBe(755);
    expect(r.net).toBe(3014.35);
  });
});

describe('pay cycle', () => {
  it('Oct 2026 OT runs 14 Sep – 13 Oct, paid 28 Oct', () => {
    const c = getPayCycle(2026, 10, cfg);
    expect(c.otStart.toDateString()).toBe(new Date(2026, 8, 14).toDateString());
    expect(c.otEnd.toDateString()).toBe(new Date(2026, 9, 13).toDateString());
    expect(c.payDate.getDate()).toBe(28);
    expect(c.weekdays + c.saturdays + c.sundays).toBe(30);
  });

  it('January rolls back to December', () => {
    const c = getPayCycle(2027, 1, cfg);
    expect(c.otStart.getFullYear()).toBe(2026);
    expect(c.otStart.getMonth()).toBe(11);
  });
});

describe('target mode', () => {
  const base = { normalShifts: 22, publicHolidayShifts: 0, deductions: cfg.defaultDeductions };
  const limits = { maxSundays: 4, maxSaturdays: 4, maxWeekdayOtHours: 22, weekdayStep: 1 };

  it('uses Sundays first', () => {
    const t = findMinimumCombo(2800, base, cfg, limits);
    expect(t.reachable).toBe(true);
    expect(t.combo.saturdayShifts).toBe(0);
    expect(t.combo.weekdayOtHours).toBe(0);
    expect(t.result.net).toBeGreaterThanOrEqual(2800);
  });

  it('falls through to Saturdays then weekday OT', () => {
    const t = findMinimumCombo(4500, base, cfg, limits);
    expect(t.reachable).toBe(true);
    expect(t.combo.sundayShifts).toBe(4);
    expect(t.combo.saturdayShifts).toBe(4);
    expect(t.combo.weekdayOtHours).toBeGreaterThan(0);
  });

  it('fixed base with defaults: 22 shifts, no OT / PH → gross 3430, CPF 686, net 2734.00', () => {
    expect(targetBase(cfg)).toEqual({ normalShifts: 22, publicHolidayShifts: 0, deductions: cfg.defaultDeductions });
    const t = findMinimumCombo(1, targetBase(cfg), cfg, limits);
    expect(t.baseNet).toBe(2734);
    const baseRun = calculatePay({ ...targetBase(cfg), weekdayOtHours: 0, saturdayShifts: 0, sundayShifts: 0 }, cfg);
    expect([baseRun.gross, baseRun.cpf, baseRun.totalDeductions]).toEqual([3430, 686, 696]);
    // Public holidays are never a fill option.
    expect(Object.keys(t.combo).sort()).toEqual(['saturdayShifts', 'sundayShifts', 'weekdayOtHours']);
  });

  it('base and result do not change with Calculator inputs (calendar, PHs, custom deductions, normal shifts)', () => {
    const cycle = getPayCycle(2026, 10, cfg);
    const reference = findMinimumCombo(3500, targetBase(cfg), cfg, limits);

    // A very different Calculator state…
    let entries = markAllWorked([], cycle, 'weekday').slice(0, 15);
    entries = togglePublicHoliday(entries, '2026-09-20');
    entries = togglePublicHoliday(entries, '2026-09-21');
    entries = applyHoldOption(entries, '2026-09-15', 'otLong');
    const totals = summariseEntries(entries, cycle);
    const calc = calculatePay(
      { ...totals, deductions: [...cfg.defaultDeductions, { id: 'union', label: 'Union', amount: 50 }] },
      cfg,
    );
    expect(totals.publicHolidayShifts).toBe(2);
    expect(totals.normalShifts).not.toBe(22);
    expect(calc.net).not.toBe(2734); // …gives a different Calculator net,

    // …but Target only depends on config, so it is identical.
    const again = findMinimumCombo(3500, targetBase(cfg), cfg, limits);
    expect(again.baseNet).toBe(2734);
    expect(again).toEqual(reference);
  });

  it('"Normal shifts for target" setting changes the base', () => {
    const c = { ...cfg, rules: { ...cfg.rules, targetNormalShifts: 20 } };
    const t = findMinimumCombo(1, targetBase(c), c, limits);
    expect(t.baseNet).toBe(calculatePay({ ...none, normalShifts: 20 }, c).net);
    expect(t.baseNet).toBe(2710); // 3400 gross − 680 CPF − 10
  });

  it('each Sunday adds the 2x shift plus $15 allowance; Sundays fill first', () => {
    const t = findMinimumCombo(2800, targetBase(cfg), cfg, limits);
    expect(t.combo).toEqual({ sundayShifts: 1, saturdayShifts: 0, weekdayOtHours: 0 });
    expect(t.result.gross).toBe(round2(3430 + 275.35 + 15));
  });

  it('reports shortfall when unreachable', () => {
    const t = findMinimumCombo(99999, base, cfg, limits);
    expect(t.reachable).toBe(false);
    expect(t.shortfall).toBeGreaterThan(0);
  });
});
