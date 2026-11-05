import type { DayKind, PayCycle, PayrollConfig } from '../types/payroll';

const daysInMonth = (year: number, month1: number) => new Date(year, month1, 0).getDate();

/** Local-date ISO string (avoids UTC shift from toISOString). */
export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

export function dayKind(d: Date): DayKind {
  const dow = d.getDay();
  return dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'weekday';
}

/**
 * Pay cycle for the salary paid in (year, month).
 *
 * Salary covers the 1st → 30th of the month (clamped to month end for Feb).
 * OT is paid one cycle in arrears: the 28 Oct payout includes OT worked
 * 14 Sep → 13 Oct. `new Date(y, m-1, day)` handles January → previous
 * December rollover automatically.
 */
export function getPayCycle(year: number, month: number, config: PayrollConfig): PayCycle {
  const salaryEndDay = Math.min(config.salaryPeriodEndDay, daysInMonth(year, month));
  const otStart = new Date(year, month - 2, Math.min(config.otCycleStartDay, daysInMonth(year, month - 1)));
  const otEnd = new Date(year, month - 1, Math.min(config.otCycleEndDay, daysInMonth(year, month)));

  let weekdays = 0;
  let saturdays = 0;
  let sundays = 0;
  for (let d = new Date(otStart); d <= otEnd; d.setDate(d.getDate() + 1)) {
    const k = dayKind(d);
    if (k === 'sunday') sundays++;
    else if (k === 'saturday') saturdays++;
    else weekdays++;
  }

  return {
    year,
    month,
    salaryStart: new Date(year, month - 1, 1),
    salaryEnd: new Date(year, month - 1, salaryEndDay),
    otStart,
    otEnd,
    payDate: new Date(year, month - 1, Math.min(config.payDay, daysInMonth(year, month))),
    weekdays,
    saturdays,
    sundays,
  };
}

export function isInOtCycle(date: Date, cycle: PayCycle): boolean {
  const t = date.getTime();
  return t >= cycle.otStart.getTime() && t <= cycle.otEnd.getTime();
}


export function formatDate(d: Date, withYear = true): string {
  return d.toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}
