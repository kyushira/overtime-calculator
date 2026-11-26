import { describe, expect, it } from 'vitest';
import { percent, percentOneDp } from './fields';

describe('percentOneDp', () => {
  it('always shows one decimal place', () => {
    expect(percentOneDp(0)).toBe('0.0%');
    expect(percentOneDp(0.07)).toBe('7.0%');
    expect(percentOneDp(0.1234)).toBe('12.3%');
  });

  it('keeps a small non-zero rate from reading as 0%', () => {
    // $40 payable on $20,000 income is 0.2%, not 0%.
    expect(percentOneDp(40 / 20000)).toBe('0.2%');
    expect(percentOneDp(0.0004)).toBe('0.0%');
  });
});

describe('percent (unchanged, used for marginal rate and bars)', () => {
  it('drops a trailing zero decimal', () => {
    expect(percent(0.07)).toBe('7%');
  });
});
