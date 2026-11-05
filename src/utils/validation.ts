export interface Parsed {
  value: number;
  error?: string;
}

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

/**
 * Parse a user-typed number. Empty → 0 (no error) so fields can be cleared
 * while typing. Invalid / negative values return 0 plus an error message.
 */
export function parseNonNegative(raw: string, label: string, opts: { integer?: boolean; max?: number } = {}): Parsed {
  const s = raw.trim();
  if (s === '') return { value: 0 };
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: 0, error: `${label} must be a number.` };
  if (n < 0) return { value: 0, error: `${label} can't be negative.` };
  if (opts.integer && !Number.isInteger(n)) return { value: Math.floor(n), error: `${label} must be a whole number.` };
  if (opts.max !== undefined && n > opts.max) return { value: opts.max, error: `${label} can't exceed ${opts.max}.` };
  return { value: n };
}


export function validateMonthYear(year: string, month: string): { year: number; month: number; error?: string } {
  const y = Number(year);
  const m = Number(month);
  if (!/^\d{4}$/.test(year.trim()) || !Number.isInteger(y) || y < MIN_YEAR || y > MAX_YEAR) {
    return { year: 0, month: 0, error: `Enter a 4-digit year between ${MIN_YEAR} and ${MAX_YEAR}.` };
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    return { year: 0, month: 0, error: 'Select a valid month.' };
  }
  return { year: y, month: m };
}
