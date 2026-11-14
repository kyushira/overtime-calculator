const sgd = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' });

export const money = (n: number) => sgd.format(n);

export const signedMoney = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + sgd.format(Math.abs(n));

export const num = (n: number, dp = 2) =>
  n.toLocaleString('en-SG', { minimumFractionDigits: 0, maximumFractionDigits: dp });

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Payout period label, e.g. "November 2026". Null when the month/year isn't valid. */
export function formatPeriodLabel(year: number, month: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return `${MONTHS[month - 1]} ${year}`;
}
