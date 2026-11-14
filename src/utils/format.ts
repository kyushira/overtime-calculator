/* Money is always shown as S$ (Singapore dollars), e.g. S$1,234.50 or -S$12.00. */
const amountFmt = new Intl.NumberFormat('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wholeFmt = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 });

/** Sign prefix for a formatted magnitude: a value that rounds to zero never shows a minus. */
function signFor(n: number, body: string): string {
  return n < 0 && Number(body.replace(/,/g, '')) !== 0 ? '-' : '';
}

/** S$1,234.50 (cents). Negatives: -S$12.00. */
export const money = (n: number): string => {
  const body = amountFmt.format(Math.abs(n));
  return `${signFor(n, body)}S$${body}`;
};

/** S$90,000 (no cents), for loan principal and similar whole-dollar figures. */
export const moneyWhole = (n: number): string => {
  const body = wholeFmt.format(Math.abs(n));
  return `${signFor(n, body)}S$${body}`;
};

export const signedMoney = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));

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
