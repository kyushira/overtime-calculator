import { describe, expect, it } from 'vitest';
import type { OtEntry } from '../types/payroll';
import { getPayCycle } from './cycle';
import { DEFAULT_CONFIG } from './defaults';
import { applyHoldOption, clearCycle, holdOptionAllowed, markAllWorked, migrateEntries, nextDayStatus, setDayStatus, summariseEntries, tapDay, togglePublicHoliday } from './dayLog';
import { calculatePay } from './payroll';

const cfg = DEFAULT_CONFIG;
// Oct 2026 payout → OT cycle 14 Sep – 13 Oct 2026: 22 weekdays, 4 Sat, 4 Sun.
const cycle = getPayCycle(2026, 10, cfg);
const TUE = '2026-09-15';
const WED = '2026-09-16';
const SAT = '2026-09-19';
const SUN = '2026-09-20';
const zero = { normalShifts: 0, weekdayOtHours: 0, saturdayShifts: 0, sundayShifts: 0, publicHolidayShifts: 0 };
const status = (e: OtEntry[], iso: string) => e.find((x) => x.date === iso)?.status;

describe('day tap cycle', () => {
  it('weekday: off → worked → +1h → off (no +1.25h tap state)', () => {
    expect(nextDayStatus('weekday', undefined)).toBe('worked');
    expect(nextDayStatus('weekday', 'worked')).toBe('ot');
    expect(nextDayStatus('weekday', 'ot')).toBeUndefined();
  });

  it('tapping a hold-menu state (+1.25h or PH) clears it', () => {
    expect(nextDayStatus('weekday', 'otLong')).toBeUndefined();
    expect(nextDayStatus('weekday', 'ph')).toBeUndefined();
  });

  it('weekend: off ↔ worked; tapping a PH clears it', () => {
    expect(nextDayStatus('saturday', undefined)).toBe('worked');
    expect(nextDayStatus('sunday', 'worked')).toBeUndefined();
    expect(nextDayStatus('weekday', 'ph')).toBeUndefined();
    expect(nextDayStatus('sunday', 'ph')).toBeUndefined();
  });

  it('tapDay walks a weekday through every state with matching totals', () => {
    let e: OtEntry[] = [];
    e = tapDay(e, TUE);
    expect(summariseEntries(e, cycle)).toEqual({ ...zero, normalShifts: 1 });
    e = tapDay(e, TUE);
    expect(summariseEntries(e, cycle)).toEqual({ ...zero, normalShifts: 1, weekdayOtHours: 1 });
    e = tapDay(e, TUE);
    expect(e).toHaveLength(0);
  });

  it('OT hours follow the short / long settings', () => {
    const e = applyHoldOption([], TUE, 'otLong'); // +long
    const w = tapDay(tapDay(e, WED), WED); // +short
    expect(summariseEntries(w, cycle, { short: 2, long: 3.5 }).weekdayOtHours).toBe(5.5);
  });

  it('quarter hours add up, e.g. 5 × 1.25 = 6.25', () => {
    let e = markAllWorked([], cycle, 'weekday');
    for (const d of ['2026-09-14', TUE, WED, '2026-09-17', '2026-09-18']) e = applyHoldOption(e, d, 'otLong');
    expect(summariseEntries(e, cycle)).toMatchObject({ normalShifts: 22, weekdayOtHours: 6.25 });
  });
});

describe('hold menu options', () => {
  it('+1¼ hr OT sets worked + long OT on any weekday state; choosing it again clears', () => {
    for (const start of [undefined, 'worked', 'ot', 'ph'] as const) {
      let e = start ? setDayStatus([], TUE, start) : [];
      e = applyHoldOption(e, TUE, 'otLong');
      expect(status(e, TUE)).toBe('otLong');
      expect(summariseEntries(e, cycle)).toEqual({ ...zero, normalShifts: 1, weekdayOtHours: 1.25 });
    }
    expect(applyHoldOption(applyHoldOption([], TUE, 'otLong'), TUE, 'otLong')).toHaveLength(0);
  });

  it('+1¼ hr OT is weekday-only; PH works on any day', () => {
    expect(holdOptionAllowed('weekday', 'otLong')).toBe(true);
    expect(holdOptionAllowed('saturday', 'otLong')).toBe(false);
    expect(holdOptionAllowed('sunday', 'ph')).toBe(true);
    const sat = setDayStatus([], SAT, 'worked');
    expect(applyHoldOption(sat, SAT, 'otLong')).toBe(sat);
    expect(status(applyHoldOption(sat, SAT, 'ph'), SAT)).toBe('ph');
  });

  it('switching between the two options replaces the state', () => {
    let e = applyHoldOption([], TUE, 'ph');
    e = applyHoldOption(e, TUE, 'otLong');
    expect(status(e, TUE)).toBe('otLong');
    e = applyHoldOption(e, TUE, 'ph');
    expect(status(e, TUE)).toBe('ph');
    expect(e).toHaveLength(1);
  });

  it('Clear removes the day', () => {
    expect(setDayStatus(applyHoldOption([], TUE, 'ph'), TUE, undefined)).toEqual([]);
  });

  it('saved +1.25h days (old tap state) still count and still clear on tap', () => {
    const e = migrateEntries([{ id: 'x', date: TUE, status: 'otLong' }]);
    expect(summariseEntries(e, cycle).weekdayOtHours).toBe(1.25);
    expect(tapDay(e, TUE)).toEqual([]);
  });
});

describe('public holiday', () => {
  it('toggles any day to PH and back to off', () => {
    let e = togglePublicHoliday([], TUE);
    expect(status(e, TUE)).toBe('ph');
    e = togglePublicHoliday(e, TUE);
    expect(e).toHaveLength(0);
  });

  it('turns a worked / OT day into PH; tap on PH clears it', () => {
    let e = tapDay(tapDay([], TUE), TUE); // +1h
    e = togglePublicHoliday(e, TUE);
    expect(status(e, TUE)).toBe('ph');
    e = tapDay(e, TUE);
    expect(e).toHaveLength(0);
  });

  it('counts as a public holiday, not a normal / Sunday shift', () => {
    let e = togglePublicHoliday([], TUE); // weekday PH
    e = togglePublicHoliday(e, SUN); // PH on a Sunday
    e = tapDay(e, WED); // a normal shift
    expect(summariseEntries(e, cycle)).toEqual({ ...zero, normalShifts: 1, publicHolidayShifts: 2 });
  });

  it('All weekdays worked keeps existing PH days', () => {
    const e = markAllWorked(togglePublicHoliday([], TUE), cycle, 'weekday');
    expect(summariseEntries(e, cycle)).toMatchObject({ normalShifts: 21, publicHolidayShifts: 1 });
  });
});

describe('quick buttons', () => {
  it('All Saturdays / All Sundays / Clear cycle', () => {
    let e = markAllWorked([], cycle, 'saturday');
    e = markAllWorked(e, cycle, 'sunday');
    expect(summariseEntries(e, cycle)).toEqual({ ...zero, saturdayShifts: 4, sundayShifts: 4 });
    const outside: OtEntry = { id: 'x', date: '2026-10-20', status: 'worked' };
    expect(clearCycle([...e, outside], cycle)).toEqual([outside]);
  });
});

describe('dates → pay', () => {
  it('22 weekdays (2 at +1.25h) + 1 PH day → net 3014.35', () => {
    let e = markAllWorked([], cycle, 'weekday');
    e = applyHoldOption(e, TUE, 'otLong'); // hold menu → +1¼ hr OT
    e = applyHoldOption(e, WED, 'otLong');
    e = togglePublicHoliday(e, SUN);
    const t = summariseEntries(e, cycle);
    expect(t).toEqual({ ...zero, normalShifts: 22, weekdayOtHours: 2.5, publicHolidayShifts: 1 });
    const r = calculatePay({ ...t, deductions: cfg.defaultDeductions }, cfg);
    expect(r.gross).toBe(3779.35);
    expect(r.net).toBe(3014.35);
  });
});

describe('calendar migration', () => {
  it('previous format: OT hours map to the closest OT state', () => {
    const e = migrateEntries([
      { id: 'a', date: '2026-09-14', status: 'ot', hours: 1 },
      { id: 'b', date: TUE, status: 'ot', hours: 1.25 },
      { id: 'c', date: WED, status: 'ot', hours: 2 }, // closer to 1.25
      { id: 'd', date: '2026-09-17', status: 'ot', hours: 0.5 }, // closer to 1
      { id: 'e', date: '2026-09-18', status: 'ot', hours: 1.125 }, // tie → short
      { id: 'f', date: '2026-09-21', status: 'worked', hours: 1 },
      { id: 'g', date: SAT, status: 'worked', hours: 1 },
    ]);
    expect(e.map((x) => [x.date, x.status])).toEqual([
      ['2026-09-14', 'ot'],
      [TUE, 'otLong'],
      [WED, 'otLong'],
      ['2026-09-17', 'ot'],
      ['2026-09-18', 'ot'],
      [SAT, 'worked'],
      ['2026-09-21', 'worked'],
    ]);
    expect(e.every((x) => !('hours' in x))).toBe(true);
  });

  it('very old format (no status): weekday = OT, weekend = worked; junk dropped', () => {
    const e = migrateEntries([{ id: 'a', date: TUE, hours: 1.5 }, { id: 'b', date: SAT }, { date: 'bad' }, null, 7, { id: 'dup', date: TUE }]);
    expect(e.map((x) => [x.date, x.status])).toEqual([[TUE, 'otLong'], [SAT, 'worked']]);
  });

  it('keeps PH and otLong, is idempotent, tolerates non-arrays', () => {
    const once = migrateEntries([{ id: 'p', date: SUN, status: 'ph' }, { id: 'q', date: TUE, status: 'otLong' }]);
    expect(once.map((x) => x.status)).toEqual(['otLong', 'ph']);
    expect(migrateEntries(once)).toEqual(once);
    expect(migrateEntries('nope')).toEqual([]);
  });
});
