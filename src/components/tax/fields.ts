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

/**
 * Display text for an amount field: thousand separators on the integer part, decimals kept as
 * typed. Drops every character other than digits and '.', and keeps only the first '.'.
 * "90000" to "90,000"; "0012.5" to "12.5"; "12a3" to "123".
 */
export function formatAmountInput(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  const intRaw = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const decRaw = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, '');
  const intPart = intRaw.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decRaw === null ? intPart : `${intPart}.${decRaw}`;
}

/**
 * Number for an amount field's text. Commas are stripped. Blank input is null. Any other
 * character (or a lone '.') makes the input invalid, so the result is null.
 */
export function parseAmountInput(text: string): number | null {
  const s = text.replace(/,/g, '').trim();
  if (s === '' || s === '.' || !/^\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Caret position in `formatted` that keeps the same number of digits and '.' characters before
 * it as `raw` had before `caret`. Lets the caret stay put while separators are inserted.
 */
export function amountCaretAfterFormat(raw: string, caret: number, formatted: string): number {
  const keep = (raw.slice(0, caret).match(/[0-9.]/g) ?? []).length;
  if (keep === 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[0-9.]/.test(formatted[i])) {
      seen++;
      if (seen === keep) return i + 1;
    }
  }
  return formatted.length;
}
