import { describe, expect, it } from 'vitest';
import {
  affordability,
  computeCar,
  computeLoan,
  DEFAULT_CAR_FORM,
  downFromPct,
  formatTenure,
  migrateCarForm,
  minDownRatio,
  parseNum,
  pctFromDown,
  resolveDownpayment,
  runningMonthly,
  tenureMonths,
  totals,
  type CarForm,
} from './car';

const form = (patch: Partial<CarForm> = {}): CarForm => ({ ...DEFAULT_CAR_FORM, ...patch });

describe('parseNum (source num(): unparseable → 0)', () => {
  it('parses plain and partial numbers, zeroes blanks and junk', () => {
    expect(parseNum('12.5')).toBe(12.5);
    expect(parseNum('12abc')).toBe(12);
    expect(parseNum('')).toBe(0);
    expect(parseNum('abc')).toBe(0);
  });
});

describe('MAS downpayment cap', () => {
  it('OMV ≤ 20,000 → 30% minimum (boundary inclusive)', () => {
    expect(minDownRatio(20000)).toBe(0.3);
    expect(minDownRatio(0)).toBe(0.3);
    expect(minDownRatio(15000)).toBe(0.3);
  });

  it('OMV just above 20,000, or blank → 40% minimum', () => {
    expect(minDownRatio(20000.01)).toBe(0.4);
    expect(minDownRatio(null)).toBe(0.4);
  });

  it('computeLoan reports minDown and maxLoan from the OMV band', () => {
    const under = computeLoan({ price: 30000, omv: 20000, down: 9000, months: 12, rate: 0 });
    expect(under.minDown).toBeCloseTo(9000, 6);
    expect(under.maxLoan).toBeCloseTo(21000, 6);
    expect(under.belowMin).toBe(false);

    const over = computeLoan({ price: 30000, omv: 20000.01, down: 9000, months: 12, rate: 0 });
    expect(over.minDown).toBeCloseTo(12000, 6);
    expect(over.belowMin).toBe(true);
  });

  it('blank OMV is flagged as assumed', () => {
    expect(computeLoan({ price: 100000, omv: null, down: 40000, months: 12, rate: 0 }).omvAssumed).toBe(true);
    expect(computeLoan({ price: 100000, omv: 0, down: 30000, months: 12, rate: 0 }).omvAssumed).toBe(false);
  });
});

describe('tenure (years × 12 + months, 1–84)', () => {
  it('7y 0m = 84 months, no error', () => {
    expect(tenureMonths(7, 0)).toEqual({ months: 84, requested: 84, error: '' });
  });

  it('months part must be 0–11', () => {
    const t = tenureMonths(1, 12);
    expect(t.error).toBe('Months must be 0–11.');
    expect(t.months).toBe(24);
  });

  it('over 84 months is clamped to 84 with the MAS message', () => {
    const t = tenureMonths(7, 1);
    expect(t.months).toBe(84);
    expect(t.requested).toBe(85);
    expect(t.error).toBe('Maximum tenure is 7 years (84 months) under MAS rules.');
  });

  it('zero tenure is clamped to 1 month with an error', () => {
    const t = tenureMonths(0, 0);
    expect(t.months).toBe(1);
    expect(t.error).toBe('Minimum tenure is 1 month.');
  });

  it('negative values are reported as negative', () => {
    const t = tenureMonths(-1, 0);
    expect(t.error).toBe('Tenure cannot be negative.');
    expect(t.months).toBe(1);
  });

  it('valid edge values pass without error', () => {
    expect(tenureMonths(0, 6).error).toBe('');
    expect(tenureMonths(1, 11)).toEqual({ months: 23, requested: 23, error: '' });
  });

  it('formatTenure matches the source label', () => {
    expect(formatTenure(84)).toBe('7y');
    expect(formatTenure(14)).toBe('1y 2m');
    expect(formatTenure(6)).toBe('0y 6m');
    expect(formatTenure(12)).toBe('1y');
  });
});

describe('downpayment (% and S$ sync)', () => {
  it('S$ = price × % ÷ 100; % = S$ ÷ price × 100', () => {
    expect(downFromPct(150000, 40)).toBe(60000);
    expect(pctFromDown(150000, 60000)).toBeCloseTo(40, 10);
    expect(pctFromDown(0, 5000)).toBe(0);
  });

  it('changing the price keeps the % (pct mode derives S$)', () => {
    const r = resolveDownpayment(200000, 'pct', 40, 0);
    expect(r.down).toBe(80000);
    expect(r.downAmtText).toBe('80000');
    expect(r.downPctText).toBe('40');
  });

  it('amt mode derives the %', () => {
    const r = resolveDownpayment(150000, 'amt', 0, 45000);
    expect(r.downPct).toBeCloseTo(30, 10);
    expect(r.downPctText).toBe('30');
    expect(r.error).toBe('');
  });

  it('display text is rounded to 2dp', () => {
    expect(resolveDownpayment(150000, 'pct', 33.333, 0).downAmtText).toBe('49999.5');
  });

  it('downpayment above price: error and clamped to price', () => {
    const r = resolveDownpayment(150000, 'amt', 0, 200000);
    expect(r.error).toBe('Downpayment cannot exceed the car price.');
    expect(r.down).toBe(150000);
  });

  it('negative downpayment: error and clamped to 0', () => {
    const r = resolveDownpayment(150000, 'pct', -10, 0);
    expect(r.error).toBe('Downpayment cannot be negative.');
    expect(r.down).toBe(0);
  });

  it('blank price: % text is empty, S$ shows 0', () => {
    const r = resolveDownpayment(0, 'amt', 0, 5000);
    expect(r.downPctText).toBe('');
    expect(r.error).toBe('Downpayment cannot exceed the car price.');
  });
});

describe('flat-rate loan', () => {
  it('default case by hand: loan 90,000 at 2.78% flat over 84 months', () => {
    // interest = 90000 × 0.0278 × 7 = 17514; repayable = 107514; instalment = 107514 / 84
    const l = computeLoan({ price: 150000, omv: null, down: 60000, months: 84, rate: 2.78 });
    expect(l.loan).toBe(90000);
    expect(l.interest).toBeCloseTo(17514, 6);
    expect(l.repayable).toBeCloseTo(107514, 6);
    expect(l.instalment).toBeCloseTo(1279.928571, 5);
    expect(l.maxLoan).toBe(90000);
    expect(l.belowMin).toBe(false);
  });

  it('approximate EIR = flat × 2n ÷ (n + 1) = 2.78 × 2 × 84 / 85 = 467.04 / 85', () => {
    const l = computeLoan({ price: 150000, omv: null, down: 60000, months: 84, rate: 2.78 });
    expect(l.eir).toBeCloseTo(467.04 / 85, 9);
  });

  it('zero rate: instalment is just loan ÷ months', () => {
    const l = computeLoan({ price: 12000, omv: 0, down: 0, months: 12, rate: 0 });
    expect(l.interest).toBe(0);
    expect(l.instalment).toBe(1000);
  });

  it('downpayment equal to price: no loan, no interest, zero instalment', () => {
    const l = computeLoan({ price: 100000, omv: null, down: 100000, months: 60, rate: 3 });
    expect(l.loan).toBe(0);
    expect(l.interest).toBe(0);
    expect(l.instalment).toBe(0);
  });
});

describe('running costs', () => {
  it('yearly items ÷ 12 plus monthly items', () => {
    expect(runningMonthly([{ value: 1800, per: 'year' }, { value: 110, per: 'month' }])).toBe(260);
  });

  it('negative values count as zero', () => {
    expect(runningMonthly([{ value: -100, per: 'year' }, { value: -5, per: 'month' }])).toBe(0);
  });

  it('defaults total S$710 / month (300 yearly-derived + 410 monthly)', () => {
    const r = computeCar(DEFAULT_CAR_FORM);
    expect(r.running).toBeCloseTo(710, 10);
    expect(r.runningItems.find((i) => i.id === 'insurance')!.monthly).toBe(150);
  });
});

describe('totals and total cost of ownership', () => {
  it('default case by hand', () => {
    // instalment 1279.928571 + running 710 = 1989.928571
    // TCO = 60000 + 107514 + 710 × 84 = 227154
    const t = totals({ instalment: 1279.928571, running: 710, down: 60000, repayable: 107514, months: 84 });
    expect(t.totalMonthly).toBeCloseTo(1989.928571, 6);
    expect(t.tco).toBeCloseTo(227154, 6);
    expect(t.minSalary).toBeCloseTo(2842.755102, 5); // ÷ 0.70
    expect(t.recSalary).toBeCloseTo(6633.095238, 5); // ÷ 0.30
  });
});

describe('affordability bands', () => {
  it('blank, zero, negative or NaN salary → no verdict', () => {
    expect(affordability(1000, 0)).toBeNull();
    expect(affordability(1000, -5)).toBeNull();
    expect(affordability(1000, NaN)).toBeNull();
  });

  it('30% exactly is still comfortable; 70% exactly is still stretching', () => {
    expect(affordability(300, 1000)).toMatchObject({ band: 'ok', verdict: 'Comfortable' });
    expect(affordability(700, 1000)).toMatchObject({ band: 'warn', verdict: 'Stretching' });
  });

  it('above 70% is not affordable', () => {
    const a = affordability(701, 1000);
    expect(a!.band).toBe('bad');
    expect(a!.verdict).toBe('Not affordable');
    expect(a!.pct).toBeCloseTo(70.1, 6);
  });

  it('computeCar wires salary through to affordability', () => {
    const r = computeCar(form({ salary: '2000' }));
    expect(r.affordability!.pct).toBeCloseTo((r.totalMonthly / 2000) * 100, 8);
    expect(computeCar(form({ salary: '' })).affordability).toBeNull();
  });
});

describe('computeCar end-to-end (defaults)', () => {
  it('matches the hand-worked default case', () => {
    const r = computeCar(DEFAULT_CAR_FORM);
    expect(r.down).toBe(60000);
    expect(r.loan).toBe(90000);
    expect(r.tenure.months).toBe(84);
    expect(r.interest).toBeCloseTo(17514, 6);
    expect(r.instalment).toBeCloseTo(1279.928571, 5);
    expect(r.totalMonthly).toBeCloseTo(1989.928571, 5);
    expect(r.tco).toBeCloseTo(227154, 6);
    expect(r.downSharePct).toBe(40);
    expect(r.minDownWarning).toBe(false);
    expect(r.omvAssumed).toBe(true);
    expect(r.negErrors).toEqual({});
  });

  it('blank inputs give zeros, not NaN', () => {
    const r = computeCar(form({ price: '', downPct: '', downAmt: '', years: '', months: '', rate: '', running: { insurance: '', roadtax: '', service: '', parking: '', petrol: '', erp: '' } }));
    expect(r.price).toBe(0);
    expect(r.loan).toBe(0);
    expect(r.tenureError).toBe('Minimum tenure is 1 month.');
    for (const v of [r.instalment, r.totalMonthly, r.tco, r.eir, r.interest]) expect(Number.isFinite(v)).toBe(true);
  });

  it('negative inputs: field errors, and the maths uses 0', () => {
    const r = computeCar(form({ price: '-5', rate: '-1', salary: '-3', running: { ...DEFAULT_CAR_FORM.running, parking: '-10' } }));
    expect(r.negErrors.price).toBe('Cannot be negative.');
    expect(r.negErrors.rate).toBe('Cannot be negative.');
    expect(r.negErrors.salary).toBe('Cannot be negative.');
    expect(r.negErrors.parking).toBe('Cannot be negative.');
    expect(r.price).toBe(0);
    expect(r.interest).toBe(0);
    expect(r.affordability).toBeNull();
  });

  it('minDownWarning shows only for a valid downpayment below the MAS minimum', () => {
    // OMV 25,000 → 40% minimum; 30% down is below it
    const below = computeCar(form({ omv: '25000', downPct: '30' }));
    expect(below.minDownWarning).toBe(true);
    expect(below.minDown).toBe(60000);
    // Same but over-price error → warning suppressed (source behaviour)
    expect(computeCar(form({ omv: '25000', downMode: 'amt', downAmt: '999999' })).minDownWarning).toBe(false);
  });
});

describe('migrateCarForm (carcalc.inputs.v1)', () => {
  it('non-object input gives defaults', () => {
    expect(migrateCarForm(null)).toEqual(DEFAULT_CAR_FORM);
    expect(migrateCarForm('nope')).toEqual(DEFAULT_CAR_FORM);
    expect(migrateCarForm([1, 2])).toEqual(DEFAULT_CAR_FORM);
  });

  it('keeps valid saved strings and defaults the rest per field', () => {
    const m = migrateCarForm({ price: '99000', rate: 3.5, downMode: 'bogus', running: { parking: '200', petrol: 5 } });
    expect(m.price).toBe('99000');
    expect(m.rate).toBe(DEFAULT_CAR_FORM.rate); // number is not a valid saved value
    expect(m.downMode).toBe('pct');
    expect(m.running.parking).toBe('200');
    expect(m.running.petrol).toBe(DEFAULT_CAR_FORM.running.petrol);
  });

  it('accepts amt mode', () => {
    expect(migrateCarForm({ downMode: 'amt' }).downMode).toBe('amt');
  });
});
