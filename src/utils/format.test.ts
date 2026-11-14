import { describe, expect, it } from 'vitest';
import { formatPeriodLabel } from './format';

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
