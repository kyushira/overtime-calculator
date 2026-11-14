import { describe, expect, it } from 'vitest';
import { formatPeriodLabel, money, moneyWhole, signedMoney } from './format';

describe('formatPeriodLabel', () => {
  it('formats the payout month as "Month YYYY"', () => {
    expect(formatPeriodLabel(2026, 11)).toBe('November 2026');
    expect(formatPeriodLabel(2027, 1)).toBe('January 2027');
    expect(formatPeriodLabel(2026, 12)).toBe('December 2026');
  });

  it('returns null for an out-of-range month or a non-integer year', () => {
    expect(formatPeriodLabel(2026, 0)).toBeNull();
    expect(formatPeriodLabel(2026, 13)).toBeNull();
    expect(formatPeriodLabel(2026.5, 3)).toBeNull();
    expect(formatPeriodLabel(Number.NaN, 3)).toBeNull();
  });
});

describe('money', () => {
  it('uses the S$ prefix with thousands separators and two decimals', () => {
    expect(money(1234.5)).toBe('S$1,234.50');
    expect(money(0)).toBe('S$0.00');
    expect(money(90000)).toBe('S$90,000.00');
  });

  it('puts the minus before S$ and drops it when the value rounds to zero', () => {
    expect(money(-12)).toBe('-S$12.00');
    expect(money(-0.001)).toBe('S$0.00');
  });
});

describe('moneyWhole', () => {
  it('shows whole dollars with no cents', () => {
    expect(moneyWhole(90000)).toBe('S$90,000');
    expect(moneyWhole(1234.4)).toBe('S$1,234');
    expect(moneyWhole(-500)).toBe('-S$500');
  });
});

describe('signedMoney', () => {
  it('prefixes + or a true minus, then S$ amount', () => {
    expect(signedMoney(5)).toBe('+S$5.00');
    expect(signedMoney(-5)).toBe('−S$5.00');
    expect(signedMoney(0)).toBe('S$0.00');
  });
});
