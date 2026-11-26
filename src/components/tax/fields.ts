/**
 * Presentation helpers for the Tax tab. Formatting only: no tax maths here.
 */

const percentFmt = new Intl.NumberFormat('en-SG', { style: 'percent', maximumFractionDigits: 1 });

/** Fraction (0.07) to a percentage string ("7%"). Formatting only. */
export const percent = (fraction: number): string => percentFmt.format(fraction);

const percentOneDpFmt = new Intl.NumberFormat('en-SG', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Fraction to a percentage with exactly one decimal place (0.002 to "0.2%", 0 to "0.0%").
 * Used for the effective rate so a small non-zero tax never reads as "0%".
 */
export const percentOneDp = (fraction: number): string => percentOneDpFmt.format(fraction);

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
