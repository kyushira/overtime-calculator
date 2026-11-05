const sgd = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' });

export const money = (n: number) => sgd.format(n);

export const signedMoney = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + sgd.format(Math.abs(n));

export const num = (n: number, dp = 2) =>
  n.toLocaleString('en-SG', { minimumFractionDigits: 0, maximumFractionDigits: dp });

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
