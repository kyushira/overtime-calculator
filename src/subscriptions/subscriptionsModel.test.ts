import { describe, expect, it } from 'vitest';
import {
  annualCost,
  annualTotal,
  daysUntil,
  formatRenewalDate,
  isoDayNumber,
  monthlyEquivalent,
  monthlyTotal,
  relativeDays,
  sanitiseSubscriptions,
  toIsoDate,
  upcoming,
  type Subscription,
} from './subscriptionsModel';

const TODAY = new Date(2026, 10, 26); // 26 Nov 2026, local time

function sub(over: Partial<Subscription> & { name: string }): Subscription {
  return {
    id: over.name,
    cost: 10,
    cycle: 'monthly',
    nextRenewal: '2026-12-01',
    paymentMethod: '',
    ...over,
  };
}

describe('monthlyEquivalent / annualCost', () => {
  it('monthly plan: cost is the monthly figure', () => {
    const s = sub({ name: 'a', cost: 12.99, cycle: 'monthly' });
    expect(monthlyEquivalent(s)).toBe(12.99);
    expect(annualCost(s)).toBeCloseTo(155.88, 10);
  });

  it('yearly plan: monthly is cost / 12, annual is the cost', () => {
    const s = sub({ name: 'a', cost: 120, cycle: 'yearly' });
    expect(monthlyEquivalent(s)).toBe(10);
    expect(annualCost(s)).toBe(120);
  });
});

describe('monthlyTotal / annualTotal', () => {
  it('empty list totals to zero', () => {
    expect(monthlyTotal([])).toBe(0);
    expect(annualTotal([])).toBe(0);
  });

  it('a yearly plan contributes cost/12 per month and its full cost per year', () => {
    const subs = [sub({ name: 'yearly', cost: 120, cycle: 'yearly' })];
    expect(monthlyTotal(subs)).toBe(10);
    expect(annualTotal(subs)).toBe(120);
  });

  it('mixed monthly and yearly plans add up; annual equals monthly * 12', () => {
    const subs = [
      sub({ name: 'netflix', cost: 12.98, cycle: 'monthly' }),
      sub({ name: 'icloud', cost: 36, cycle: 'yearly' }),
      sub({ name: 'gym', cost: 60, cycle: 'monthly' }),
    ];
    // 12.98 + 36/12 + 60 = 75.98 per month; 12.98*12 + 36 + 60*12 = 911.76 per year
    expect(monthlyTotal(subs)).toBeCloseTo(75.98, 10);
    expect(annualTotal(subs)).toBeCloseTo(911.76, 10);
    expect(annualTotal(subs)).toBeCloseTo(monthlyTotal(subs) * 12, 8);
  });
});

describe('isoDayNumber / daysUntil', () => {
  it('rejects malformed and impossible dates', () => {
    expect(isoDayNumber('2026-02-31')).toBeNull();
    expect(isoDayNumber('2026-13-01')).toBeNull();
    expect(isoDayNumber('26-11-01')).toBeNull();
    expect(isoDayNumber('')).toBeNull();
    expect(isoDayNumber('2026-11-01T00:00')).toBeNull();
    expect(daysUntil('nope', TODAY)).toBeNull();
  });

  it('counts calendar days, not milliseconds', () => {
    expect(daysUntil('2026-11-26', TODAY)).toBe(0);
    expect(daysUntil('2026-11-27', TODAY)).toBe(1);
    expect(daysUntil('2026-12-26', TODAY)).toBe(30);
    expect(daysUntil('2026-11-25', TODAY)).toBe(-1);
  });

  it('crosses month and year boundaries and leap days', () => {
    expect(daysUntil('2027-01-01', new Date(2026, 11, 31))).toBe(1);
    expect(daysUntil('2028-03-01', new Date(2028, 1, 28))).toBe(2);
  });

  it('ignores the time of day on today', () => {
    expect(daysUntil('2026-11-26', new Date(2026, 10, 26, 23, 59, 59))).toBe(0);
    expect(daysUntil('2026-11-27', new Date(2026, 10, 26, 0, 0, 1))).toBe(1);
  });
});

describe('upcoming', () => {
  it('includes 0 and 30 days out, excludes 31 and past dates', () => {
    const subs = [
      sub({ name: 'today', nextRenewal: '2026-11-26' }),
      sub({ name: 'edge30', nextRenewal: '2026-12-26' }),
      sub({ name: 'edge31', nextRenewal: '2026-12-27' }),
      sub({ name: 'past', nextRenewal: '2026-11-25' }),
    ];
    expect(upcoming(subs, TODAY).map((u) => u.sub.name)).toEqual(['today', 'edge30']);
  });

  it('sorts soonest first and carries the day count', () => {
    const subs = [
      sub({ name: 'c', nextRenewal: '2026-12-10' }),
      sub({ name: 'a', nextRenewal: '2026-11-27' }),
      sub({ name: 'b', nextRenewal: '2026-11-26' }),
    ];
    const items = upcoming(subs, TODAY);
    expect(items.map((u) => u.sub.name)).toEqual(['b', 'a', 'c']);
    expect(items.map((u) => u.days)).toEqual([0, 1, 14]);
  });

  it('returns nothing for an empty list or when nothing is due soon', () => {
    expect(upcoming([], TODAY)).toEqual([]);
    expect(upcoming([sub({ name: 'far', nextRenewal: '2027-06-01' })], TODAY)).toEqual([]);
  });

  it('respects a custom window', () => {
    const subs = [sub({ name: 'x', nextRenewal: '2026-12-06' })];
    expect(upcoming(subs, TODAY, 7)).toHaveLength(0);
    expect(upcoming(subs, TODAY, 10)).toHaveLength(1);
  });
});

describe('relativeDays', () => {
  it('reads as today, tomorrow, or in N days', () => {
    expect(relativeDays(0)).toBe('today');
    expect(relativeDays(1)).toBe('tomorrow');
    expect(relativeDays(7)).toBe('in 7 days');
  });
});

describe('formatRenewalDate / toIsoDate', () => {
  it('formats as "3 Dec 2026"', () => {
    expect(formatRenewalDate('2026-12-03')).toBe('3 Dec 2026');
  });

  it('returns the raw string when it is not a valid date', () => {
    expect(formatRenewalDate('garbage')).toBe('garbage');
  });

  it('writes local yyyy-mm-dd with zero padding', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('sanitiseSubscriptions', () => {
  const good = { id: 'a1', name: ' Netflix ', cost: 12.98, cycle: 'monthly', nextRenewal: '2026-12-01', paymentMethod: 'Visa' };

  it('returns an empty list for anything that is not an array', () => {
    expect(sanitiseSubscriptions(null)).toEqual([]);
    expect(sanitiseSubscriptions(undefined)).toEqual([]);
    expect(sanitiseSubscriptions('oops')).toEqual([]);
    expect(sanitiseSubscriptions({ 0: good })).toEqual([]);
  });

  it('keeps well-formed items and trims the name', () => {
    expect(sanitiseSubscriptions([good])).toEqual([{ ...good, name: 'Netflix' }]);
  });

  it('drops malformed items and keeps the rest', () => {
    const raw = [
      good,
      null,
      42,
      { ...good, id: '' },
      { ...good, name: '   ' },
      { ...good, cost: -1 },
      { ...good, cost: 'ten' },
      { ...good, cost: Number.NaN },
      { ...good, cycle: 'weekly' },
      { ...good, nextRenewal: '2026-02-31' },
      { ...good, nextRenewal: undefined },
    ];
    expect(sanitiseSubscriptions(raw)).toEqual([{ ...good, name: 'Netflix' }]);
  });

  it('defaults a missing payment method to empty text', () => {
    const { paymentMethod: _omit, ...noPay } = good;
    expect(sanitiseSubscriptions([noPay])[0].paymentMethod).toBe('');
  });
});
