/**
 * Presentation helpers for the Tax tab. Formatting only: no tax maths here.
 */

const percentFmt = new Intl.NumberFormat('en-SG', { style: 'percent', maximumFractionDigits: 1 });

/** Fraction (0.07) to a percentage string ("7%"). Formatting only. */
export const percent = (fraction: number): string => percentFmt.format(fraction);

/** Text for a number input. Zero and "no amount" show blank, as NumInput does. */
export function numText(n: number | null): string {
  return n === null || n === 0 ? '' : String(n);
}

/** Parses a number input. Blank or non-finite input is null. */
export function parseNumber(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
