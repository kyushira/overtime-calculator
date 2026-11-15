import { describe, expect, it } from 'vitest';
import { DEFAULT_CAR_FORM, type CarForm } from './car';
import {
  applyCoePatch,
  checkTenureVsCoe,
  coeExpiryOf,
  coeMonthsLeft,
  defaultTenure,
  expiryFromLeft,
  expiryFromMonths,
  formatCoeLeft,
  monthsUntilExpiry,
  parseIsoDate,
  switchCoeMode,
} from './coe';

const form = (patch: Partial<CarForm> = {}): CarForm => ({ ...DEFAULT_CAR_FORM, ...patch });
// Local-time constructor: the app reads calendar days from local time, so the tests do too.
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);
const TODAY = day(2026, 11, 15);

describe('parseIsoDate', () => {
  it('accepts a real calendar date', () => {
    expect(parseIsoDate('2029-03-15')).toEqual({ y: 2029, m: 3, d: 15 });
    expect(parseIsoDate('2028-02-29')).toEqual({ y: 2028, m: 2, d: 29 });
  });

  it('rejects impossible dates and other shapes', () => {
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2027-02-29')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('15/03/2029')).toBeNull();
    expect(parseIsoDate('soon')).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
  });
});

describe('coeMonthsLeft', () => {
  it('blank years and months → null (old behaviour, no COE)', () => {
    expect(coeMonthsLeft(form({ coeYears: '', coeMonths: '' }), TODAY)).toBeNull();
    expect(coeMonthsLeft(form({ coeYears: '  ', coeMonths: '' }), TODAY)).toBeNull();
  });

  it('left mode: years × 12 + months', () => {
    expect(coeMonthsLeft(form({ coeYears: '3', coeMonths: '4' }), TODAY)).toBe(40);
    expect(coeMonthsLeft(form({ coeYears: '2', coeMonths: '' }), TODAY)).toBe(24);
    expect(coeMonthsLeft(form({ coeYears: '', coeMonths: '5' }), TODAY)).toBe(5);
  });

  it('left mode: 0y 0m is 0 months (expires now), not null', () => {
    expect(coeMonthsLeft(form({ coeYears: '0', coeMonths: '0' }), TODAY)).toBe(0);
  });

  it('left mode: non-numeric or negative input → null', () => {
    expect(coeMonthsLeft(form({ coeYears: 'abc', coeMonths: '0' }), TODAY)).toBeNull();
    expect(coeMonthsLeft(form({ coeYears: '-1', coeMonths: '0' }), TODAY)).toBeNull();
  });

  it('expiry mode: blank or invalid date → null', () => {
    expect(coeMonthsLeft(form({ coeMode: 'expiry', coeExpiry: '' }), TODAY)).toBeNull();
    expect(coeMonthsLeft(form({ coeMode: 'expiry', coeExpiry: '2026-02-30' }), TODAY)).toBeNull();
  });

  it('expiry mode ignores the years/months fields', () => {
    const f = form({ coeMode: 'expiry', coeExpiry: '2029-03-15', coeYears: '9', coeMonths: '9' });
    expect(coeMonthsLeft(f, TODAY)).toBe(28);
  });
});

describe('monthsUntilExpiry (whole months, floor)', () => {
  it('counts whole calendar months: 15 Nov 2026 → 15 Mar 2029 is 28 months', () => {
    expect(monthsUntilExpiry('2029-03-15', TODAY)).toBe(28);
  });

  it('partial month is floored: 15 Nov 2026 → 14 Mar 2029 is 27 months', () => {
    expect(monthsUntilExpiry('2029-03-14', TODAY)).toBe(27);
  });

  it('expiry on today or in the past → 0', () => {
    expect(monthsUntilExpiry('2026-11-15', TODAY)).toBe(0);
    expect(monthsUntilExpiry('2026-11-14', TODAY)).toBe(0);
    expect(monthsUntilExpiry('2019-01-01', TODAY)).toBe(0);
  });

  it('less than a month left → 0', () => {
    expect(monthsUntilExpiry('2026-12-10', TODAY)).toBe(0);
  });

  it('month ends: 31 Jan → 28 Feb is one whole month (day clamped to month end)', () => {
    expect(monthsUntilExpiry('2026-02-28', day(2026, 1, 31))).toBe(1);
    expect(monthsUntilExpiry('2026-02-27', day(2026, 1, 31))).toBe(0);
  });

  it('month ends: 31 Aug → 28 Feb is six whole months, 27 Feb is five', () => {
    expect(monthsUntilExpiry('2027-02-28', day(2026, 8, 31))).toBe(6);
    expect(monthsUntilExpiry('2027-02-27', day(2026, 8, 31))).toBe(5);
  });

  it('month ends: 28 Feb → 31 Mar is one whole month', () => {
    expect(monthsUntilExpiry('2027-03-31', day(2027, 2, 28))).toBe(1);
  });

  it('leap day: 29 Feb 2028 → 28 Feb 2029 is 12 whole months (clamped), 27 Feb is 11', () => {
    expect(monthsUntilExpiry('2029-02-28', day(2028, 2, 29))).toBe(12);
    expect(monthsUntilExpiry('2029-02-27', day(2028, 2, 29))).toBe(11);
    expect(monthsUntilExpiry('2029-03-01', day(2028, 2, 29))).toBe(12);
  });

  it('invalid date → null', () => {
    expect(monthsUntilExpiry('nope', TODAY)).toBeNull();
  });
});

describe('formatCoeLeft', () => {
  it('formats as Xy Ym, always both parts', () => {
    expect(formatCoeLeft(40)).toBe('3y 4m');
    expect(formatCoeLeft(12)).toBe('1y 0m');
    expect(formatCoeLeft(0)).toBe('0y 0m');
    expect(formatCoeLeft(5)).toBe('0y 5m');
  });
});

describe('defaultTenure', () => {
  it('equals the COE months left when under 7 years', () => {
    expect(defaultTenure(40)).toBe(40);
  });

  it('exactly 84 months stays 84', () => {
    expect(defaultTenure(84)).toBe(84);
  });

  it('more than 7 years left (9y) caps at 84', () => {
    expect(defaultTenure(108)).toBe(84);
  });

  it('under a month left (0) gives the 1-month minimum', () => {
    expect(defaultTenure(0)).toBe(1);
  });
});

describe('checkTenureVsCoe', () => {
  it('no COE entered → not over, no message', () => {
    expect(checkTenureVsCoe(84, null)).toEqual({ overCoe: false, message: '' });
  });

  it('tenure longer than the COE → over, with the exact message', () => {
    expect(checkTenureVsCoe(84, 40)).toEqual({ overCoe: true, message: "Loan can't outlast the COE: 3y 4m left" });
  });

  it('tenure equal to the COE is not over', () => {
    expect(checkTenureVsCoe(40, 40)).toEqual({ overCoe: false, message: "Loan can't outlast the COE: 3y 4m left" });
  });

  it('under a month left is always over, with its own message', () => {
    expect(checkTenureVsCoe(1, 0)).toEqual({ overCoe: true, message: 'COE expires in under a month' });
  });
});

describe('expiryFromLeft / expiryFromMonths', () => {
  it('3y 4m from 15 Nov 2026 is 15 Mar 2030', () => {
    expect(expiryFromLeft(3, 4, TODAY)).toBe('2030-03-15');
  });

  it('clamps to month end: 1 month from 31 Jan 2026 is 28 Feb 2026', () => {
    expect(expiryFromMonths(1, day(2026, 1, 31))).toBe('2026-02-28');
  });

  it('round-trips through monthsUntilExpiry', () => {
    const iso = expiryFromMonths(40, TODAY);
    expect(monthsUntilExpiry(iso, TODAY)).toBe(40);
  });
});

describe('switchCoeMode keeps the same COE value', () => {
  it('left → expiry writes the matching expiry date', () => {
    const patch = switchCoeMode(form({ coeYears: '3', coeMonths: '4' }), 'expiry', TODAY);
    expect(patch).toEqual({ coeMode: 'expiry', coeExpiry: '2030-03-15' });
  });

  it('expiry → left writes years and months', () => {
    const patch = switchCoeMode(form({ coeMode: 'expiry', coeExpiry: '2030-03-15' }), 'left', TODAY);
    expect(patch).toEqual({ coeMode: 'left', coeYears: '3', coeMonths: '4' });
  });

  it('switching with no COE entered only changes the mode', () => {
    expect(switchCoeMode(form(), 'expiry', TODAY)).toEqual({ coeMode: 'expiry' });
  });

  it('same mode → no change', () => {
    expect(switchCoeMode(form(), 'left', TODAY)).toEqual({});
  });
});

describe('coeExpiryOf (date to store with a saved car)', () => {
  it('expiry mode stores the typed date', () => {
    expect(coeExpiryOf(form({ coeMode: 'expiry', coeExpiry: '2029-03-15' }), TODAY)).toBe('2029-03-15');
  });

  it('expiry mode with an invalid or blank date stores nothing', () => {
    expect(coeExpiryOf(form({ coeMode: 'expiry', coeExpiry: '2026-02-30' }), TODAY)).toBeUndefined();
    expect(coeExpiryOf(form({ coeMode: 'expiry', coeExpiry: '' }), TODAY)).toBeUndefined();
  });

  it('left mode stores the date the years and months reach', () => {
    expect(coeExpiryOf(form({ coeYears: '3', coeMonths: '4' }), TODAY)).toBe('2030-03-15');
  });

  it('left mode with no COE entered stores nothing', () => {
    expect(coeExpiryOf(form(), TODAY)).toBeUndefined();
  });
});

describe('applyCoePatch (tenure follows COE entry)', () => {
  it('a COE change sets tenure to the COE months left', () => {
    const patch = applyCoePatch(form(), { coeYears: '3', coeMonths: '4' }, TODAY);
    expect(patch).toEqual({ coeYears: '3', coeMonths: '4', years: '3', months: '4' });
  });

  it('a COE change over 7 years sets tenure to 84 months', () => {
    const patch = applyCoePatch(form(), { coeYears: '9', coeMonths: '0' }, TODAY);
    expect(patch).toMatchObject({ years: '7', months: '0' });
  });

  it('COE under a month sets tenure to 1 month', () => {
    const patch = applyCoePatch(form(), { coeYears: '0', coeMonths: '0' }, TODAY);
    expect(patch).toMatchObject({ years: '0', months: '1' });
  });

  it('clearing the COE leaves the tenure the user set', () => {
    const patch = applyCoePatch(form({ coeYears: '3' }), { coeYears: '' }, TODAY);
    expect(patch).toEqual({ coeYears: '' });
  });

  it('a patch without COE fields (e.g. price) never touches tenure', () => {
    const patch = applyCoePatch(form({ coeYears: '3' }), { price: '99000' }, TODAY);
    expect(patch).toEqual({ price: '99000' });
  });
});
