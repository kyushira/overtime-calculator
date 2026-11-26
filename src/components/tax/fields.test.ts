import { describe, expect, it } from 'vitest';
import {
  amountCaretAfterFormat,
  formatAmountInput,
  parseAmountInput,
  percent,
  percentOneDp,
} from './fields';

describe('formatAmountInput', () => {
  it('adds thousand separators to the integer part', () => {
    expect(formatAmountInput('90000')).toBe('90,000');
    expect(formatAmountInput('1234567')).toBe('1,234,567');
    expect(formatAmountInput('999')).toBe('999');
    expect(formatAmountInput('1000')).toBe('1,000');
  });

  it('keeps decimals as typed', () => {
    expect(formatAmountInput('20160.5')).toBe('20,160.5');
    expect(formatAmountInput('20160.')).toBe('20,160.');
    expect(formatAmountInput('1234.00')).toBe('1,234.00');
  });

  it('handles empty input', () => {
    expect(formatAmountInput('')).toBe('');
  });

  it('drops invalid characters and extra decimal points', () => {
    expect(formatAmountInput('12a3')).toBe('123');
    expect(formatAmountInput('-5')).toBe('5');
    expect(formatAmountInput('S$90,000')).toBe('90,000');
    expect(formatAmountInput('1.2.3')).toBe('1.23');
  });

  it('removes leading zeros but keeps a single zero', () => {
    expect(formatAmountInput('0012.5')).toBe('12.5');
    expect(formatAmountInput('0')).toBe('0');
    expect(formatAmountInput('000')).toBe('0');
  });
});

describe('parseAmountInput', () => {
  it('strips commas', () => {
    expect(parseAmountInput('90,000')).toBe(90000);
    expect(parseAmountInput('1,234,567.5')).toBe(1234567.5);
  });

  it('keeps decimals', () => {
    expect(parseAmountInput('20160.5')).toBe(20160.5);
    expect(parseAmountInput('0.25')).toBe(0.25);
    expect(parseAmountInput('12.')).toBe(12);
  });

  it('returns null for empty or blank input', () => {
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('   ')).toBeNull();
    expect(parseAmountInput('.')).toBeNull();
  });

  it('returns null for invalid characters', () => {
    expect(parseAmountInput('12a3')).toBeNull();
    expect(parseAmountInput('1e5')).toBeNull();
    expect(parseAmountInput('-5')).toBeNull();
    expect(parseAmountInput('1.2.3')).toBeNull();
  });

  it('round-trips with formatAmountInput', () => {
    for (const n of [0, 5, 990, 90000, 20160.5, 1234567.25]) {
      expect(parseAmountInput(formatAmountInput(String(n)))).toBe(n);
    }
  });
});

describe('amountCaretAfterFormat', () => {
  it('keeps the caret after the typed digit when a separator is inserted', () => {
    // User types "5" after "9000" in the middle: raw "95000", caret after "9" + "5" = 2.
    const raw = '95000';
    const formatted = formatAmountInput(raw); // "95,000"
    expect(amountCaretAfterFormat(raw, 2, formatted)).toBe(2);
    // Raw "950000" with caret after 4 digits lands after the 4th digit of "950,000".
    expect(amountCaretAfterFormat('950000', 4, formatAmountInput('950000'))).toBe(5);
  });

  it('moves to the start when nothing precedes the caret', () => {
    expect(amountCaretAfterFormat('1000', 0, '1,000')).toBe(0);
  });

  it('clamps to the end of the formatted text', () => {
    expect(amountCaretAfterFormat('12a', 3, '12')).toBe(2);
  });
});

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
