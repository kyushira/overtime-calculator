import type { DayKind, DayStatus, DayTotals, OtEntry, PayCycle } from '../types/payroll';
import { dayKind, isInOtCycle, parseIsoDate, toIsoDate } from './cycle';

/*
 * Pure helpers for the "Pick dates" calendar. The calendar is the OT cycle
 * (e.g. 14 Sep → 13 Oct) and is used for both OT and normal shifts, so the
 * shift allowance paid on payday counts shifts worked in that same window.
 */

/** Weekday OT hours for the two OT states. */
export interface OtHours {
  short: number;
  long: number;
}

export const DEFAULT_OT_HOURS: OtHours = { short: 1, long: 1.25 };

const sortByDate = (a: OtEntry, b: OtEntry) => a.date.localeCompare(b.date);

const newId = (date: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `d-${date}-${Math.random().toString(36).slice(2)}`;

/**
 * Next state when a day is TAPPED. `undefined` = off.
 * Weekday: off → worked → worked + short OT → off.
 * Sat / Sun: off ↔ worked.
 * Hold-menu states (long OT, public holiday): a tap clears them to off.
 */
export function nextDayStatus(kind: DayKind, current: DayStatus | undefined): DayStatus | undefined {
  if (current === 'ph' || current === 'otLong') return undefined;
  if (kind !== 'weekday') return current ? undefined : 'worked';
  if (current === undefined) return 'worked';
  if (current === 'worked') return 'ot';
  return undefined;
}

/** Options in the hold (long-press) menu. */
export type HoldOption = 'otLong' | 'ph';

/** Whether a hold-menu option applies to this kind of day (long OT is weekday-only). */
export function holdOptionAllowed(kind: DayKind, option: HoldOption): boolean {
  return option === 'ph' || kind === 'weekday';
}

/** Set (or clear, with `undefined`) a day's status directly. */
export function setDayStatus(entries: OtEntry[], iso: string, next: DayStatus | undefined): OtEntry[] {
  if (!next) return entries.filter((e) => e.date !== iso);
  if (entries.some((e) => e.date === iso)) return entries.map((e) => (e.date === iso ? { ...e, status: next } : e));
  return [...entries, { id: newId(iso), date: iso, status: next }].sort(sortByDate);
}

/** Apply a tap on `iso` and return the new entry list. */
export function tapDay(entries: OtEntry[], iso: string): OtEntry[] {
  const d = parseIsoDate(iso);
  if (!d) return entries;
  return setDayStatus(entries, iso, nextDayStatus(dayKind(d), entries.find((e) => e.date === iso)?.status));
}

/**
 * Pick an option from the hold menu. Choosing the option the day already has
 * clears the day (toggle). Long OT on a weekend is ignored.
 */
export function applyHoldOption(entries: OtEntry[], iso: string, option: HoldOption): OtEntry[] {
  const d = parseIsoDate(iso);
  if (!d || !holdOptionAllowed(dayKind(d), option)) return entries;
  const current = entries.find((e) => e.date === iso)?.status;
  return setDayStatus(entries, iso, current === option ? undefined : option);
}

/** Toggle "public holiday worked" (any day). A PH day goes back to off. */
export function togglePublicHoliday(entries: OtEntry[], iso: string): OtEntry[] {
  return applyHoldOption(entries, iso, 'ph');
}

export function cycleDays(cycle: PayCycle): Date[] {
  const days: Date[] = [];
  for (let d = new Date(cycle.otStart); d <= cycle.otEnd; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  return days;
}

/** Mark every day of `kind` in the cycle as worked. Days already marked (OT, PH) are kept. */
export function markAllWorked(entries: OtEntry[], cycle: PayCycle, kind: DayKind): OtEntry[] {
  const have = new Set(entries.map((e) => e.date));
  const add = cycleDays(cycle)
    .filter((d) => dayKind(d) === kind && !have.has(toIsoDate(d)))
    .map<OtEntry>((d) => ({ id: newId(toIsoDate(d)), date: toIsoDate(d), status: 'worked' }));
  return [...entries, ...add].sort(sortByDate);
}

/** Remove entries inside the cycle; dates from other cycles are kept. */
export function clearCycle(entries: OtEntry[], cycle: PayCycle): OtEntry[] {
  return entries.filter((e) => {
    const d = parseIsoDate(e.date);
    return !(d && isInOtCycle(d, cycle));
  });
}

/**
 * Derive totals from calendar entries that fall within the OT cycle:
 *   normal shifts   = weekdays marked worked / worked + OT (not PH)
 *   weekday OT hrs  = short OT days × short hrs + long OT days × long hrs
 *   Sat / Sun       = weekend days marked worked (full OT shifts)
 *   public holidays = days marked PH (any weekday or weekend day)
 * Entries outside the cycle belong to other payout months and are ignored.
 */
export function summariseEntries(entries: OtEntry[], cycle: PayCycle, otHours: OtHours = DEFAULT_OT_HOURS): DayTotals {
  const q: DayTotals = { normalShifts: 0, weekdayOtHours: 0, saturdayShifts: 0, sundayShifts: 0, publicHolidayShifts: 0 };
  for (const e of entries) {
    const d = parseIsoDate(e.date);
    if (!d || !isInOtCycle(d, cycle)) continue;
    if (e.status === 'ph') {
      q.publicHolidayShifts++;
      continue;
    }
    const k = dayKind(d);
    if (k === 'sunday') q.sundayShifts++;
    else if (k === 'saturday') q.saturdayShifts++;
    else {
      q.normalShifts++;
      if (e.status === 'ot') q.weekdayOtHours += otHours.short;
      else if (e.status === 'otLong') q.weekdayOtHours += otHours.long;
    }
  }
  q.weekdayOtHours = Math.round(q.weekdayOtHours * 100) / 100;
  return q;
}

/**
 * Upgrade saved calendar entries:
 * - very old format (no status): a weekday entry meant OT hours → worked + OT;
 *   a weekend entry meant a full OT shift → worked.
 * - previous format: status 'ot' with free `hours` → whichever OT state's hours
 *   is closest (1 → short, 1.25 → long; ties go to short).
 * Invalid items and duplicate dates are dropped. Output has no `hours` field.
 */
export function migrateEntries(raw: unknown, otHours: OtHours = DEFAULT_OT_HOURS): OtEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: OtEntry[] = [];
  const seen = new Set<string>();
  const closest = (h: unknown): DayStatus =>
    typeof h === 'number' && Number.isFinite(h) && Math.abs(h - otHours.long) < Math.abs(h - otHours.short) ? 'otLong' : 'ot';

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const e = item as Record<string, unknown>;
    const date = typeof e.date === 'string' ? e.date : '';
    const d = parseIsoDate(date);
    if (!d || seen.has(date)) continue;
    seen.add(date);
    let status: DayStatus;
    if (e.status === 'ph') status = 'ph';
    else if (dayKind(d) !== 'weekday') status = 'worked';
    else if (e.status === 'worked' || e.status === 'otLong') status = e.status;
    else status = closest(e.hours); // 'ot' or legacy no-status entry
    out.push({ id: typeof e.id === 'string' && e.id ? e.id : newId(date), date, status });
  }
  return out.sort(sortByDate);
}
