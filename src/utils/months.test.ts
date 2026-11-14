import { describe, expect, it } from 'vitest';
import type { FormState } from '../types/form';
import type { OtQuantities } from '../types/payroll';
import { DEFAULT_CONFIG } from './defaults';
import {
  EMPTY_STORE,
  MAX_BACKUP_BYTES,
  MONTHS_STORAGE_KEY,
  MONTHS_VERSION,
  backupFileName,
  buildSnapshot,
  defaultPlan,
  deleteMonth,
  diffVsLast,
  exportBackup,
  isBackupTooLarge,
  latestMonth,
  mergeStores,
  migrateMonthsStore,
  monthId,
  monthLabel,
  nextMonthAfter,
  parseBackup,
  planToForm,
  sanitizeCustomDeductions,
  sortNewestFirst,
  stats,
  trend,
  upsertMonth,
} from './months';
import type { MonthsStore, SavedMonth } from './months';
import { calculatePay, round2 } from './payroll';

const NOW = new Date('2026-04-01T09:00:00.000Z');

const baseForm: FormState = {
  year: '2026', month: '3', normalShifts: '22', inputMode: 'totals', weekdayOtHours: '4', saturdayShifts: '1',
  sundayShifts: '0', publicHolidayShifts: '', entries: [], customDeductions: [], targetNet: '1800',
};

interface Scenario extends OtQuantities {
  normalShifts: number;
  publicHolidayShifts: number;
}

const MARCH: Scenario = { normalShifts: 22, publicHolidayShifts: 0, weekdayOtHours: 4, saturdayShifts: 1, sundayShifts: 0 };

/** Real calculation for a scenario, shaped like the calculator's calc object. */
function calcFor(s: Scenario) {
  const result = calculatePay(
    {
      normalShifts: s.normalShifts,
      publicHolidayShifts: s.publicHolidayShifts,
      weekdayOtHours: s.weekdayOtHours,
      saturdayShifts: s.saturdayShifts,
      sundayShifts: s.sundayShifts,
      deductions: DEFAULT_CONFIG.defaultDeductions,
    },
    DEFAULT_CONFIG,
  );
  return {
    normalShifts: s.normalShifts,
    publicHolidayShifts: s.publicHolidayShifts,
    quantities: { weekdayOtHours: s.weekdayOtHours, saturdayShifts: s.saturdayShifts, sundayShifts: s.sundayShifts },
    result,
  };
}

/** A saved month for the given payout month, built through buildSnapshot. */
function snap(year: number, month: number, over: Partial<Scenario> = {}): SavedMonth {
  const snapshot = buildSnapshot(
    { ...baseForm, year: String(year), month: String(month) },
    calcFor({ ...MARCH, ...over }),
    NOW,
  );
  if (!snapshot) throw new Error('fixture snapshot must be valid');
  return snapshot;
}

function storeOf(...months: SavedMonth[]): MonthsStore {
  return months.reduce((s, m) => upsertMonth(s, m), EMPTY_STORE);
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('monthId / monthLabel', () => {
  it('zero-pads the month', () => {
    expect(monthId(2026, 3)).toBe('2026-03');
    expect(monthId(2026, 11)).toBe('2026-11');
  });

  it('labels long and short forms', () => {
    expect(monthLabel(2026, 3)).toBe('March 2026');
    expect(monthLabel(2026, 3, true)).toBe('Mar 26');
  });

  it('exposes the storage key and version', () => {
    expect(MONTHS_STORAGE_KEY).toBe('otcalc.months.v1');
    expect(MONTHS_VERSION).toBe(1);
  });
});

describe('buildSnapshot', () => {
  it('captures inputs, figures and line items from the real calculation', () => {
    const calc = calcFor(MARCH);
    const s = buildSnapshot(baseForm, calc, NOW);
    expect(s).not.toBeNull();
    expect(s?.id).toBe('2026-03');
    expect(s?.year).toBe(2026);
    expect(s?.month).toBe(3);
    expect(s?.savedAt).toBe(NOW.toISOString());
    expect(s?.figures).toEqual({
      normalShifts: 22,
      weekdayOtHours: 4,
      saturdayShifts: 1,
      sundayShifts: 0,
      publicHolidayShifts: 0,
      gross: calc.result.gross,
      cpf: calc.result.cpf,
      totalDeductions: calc.result.totalDeductions,
      net: calc.result.net,
    });
  });

  it('saves CPF first, then the other deductions, and the earnings lines', () => {
    const s = buildSnapshot(baseForm, calcFor(MARCH), NOW);
    const r = calcFor(MARCH).result;
    expect(s?.deductions).toEqual([
      { label: 'CPF', amount: r.cpf },
      ...r.otherDeductions.map((d) => ({ label: d.label, amount: d.amount })),
    ]);
    expect(s?.earnings).toEqual(r.earnings.map((e) => ({ label: e.label, amount: e.amount })));
  });

  it('strips targetNet from the saved form but keeps the other inputs', () => {
    const s = buildSnapshot(baseForm, calcFor(MARCH), NOW);
    expect(s?.form.targetNet).toBe('');
    expect(s?.form.normalShifts).toBe('22');
    expect(s?.form.weekdayOtHours).toBe('4');
  });

  it('returns null for an invalid month', () => {
    expect(buildSnapshot({ ...baseForm, month: '13' }, calcFor(MARCH), NOW)).toBeNull();
    expect(buildSnapshot({ ...baseForm, month: '0' }, calcFor(MARCH), NOW)).toBeNull();
  });

  it('returns null for an empty or out-of-range year', () => {
    expect(buildSnapshot({ ...baseForm, year: '' }, calcFor(MARCH), NOW)).toBeNull();
    expect(buildSnapshot({ ...baseForm, year: '1999' }, calcFor(MARCH), NOW)).toBeNull();
  });
});

describe('upsertMonth / sortNewestFirst / deleteMonth / latestMonth', () => {
  it('overwrites the same payout month instead of duplicating it', () => {
    const first = snap(2026, 3, { normalShifts: 22 });
    const second = snap(2026, 3, { normalShifts: 18 });
    const store = upsertMonth(upsertMonth(EMPTY_STORE, first), second);
    expect(store.months).toHaveLength(1);
    expect(store.months[0].figures.normalShifts).toBe(18);
    expect(store.months[0].figures.net).toBe(second.figures.net);
  });

  it('orders across a year boundary: 2026-01 is newer than 2025-12', () => {
    const store = storeOf(snap(2025, 12), snap(2026, 1));
    expect(store.months.map((m) => m.id)).toEqual(['2026-01', '2025-12']);
    expect(latestMonth(store.months)?.id).toBe('2026-01');
  });

  it('does not mutate the input store or array', () => {
    const before = storeOf(snap(2026, 3));
    const after = upsertMonth(before, snap(2026, 4));
    expect(before.months).toHaveLength(1);
    expect(after.months).toHaveLength(2);
    const input = [snap(2026, 1), snap(2026, 2)];
    sortNewestFirst(input);
    expect(input.map((m) => m.id)).toEqual(['2026-01', '2026-02']);
  });

  it('deletes by id and leaves other months alone', () => {
    const store = storeOf(snap(2026, 2), snap(2026, 3));
    expect(deleteMonth(store, '2026-02').months.map((m) => m.id)).toEqual(['2026-03']);
    expect(deleteMonth(store, 'nope').months.map((m) => m.id)).toEqual(['2026-03', '2026-02']);
  });

  it('latestMonth is null for an empty list', () => {
    expect(latestMonth([])).toBeNull();
  });
});

describe('trend', () => {
  const months = [5, 1, 8, 3, 7, 2, 6, 4].map((m) => snap(2026, m, { normalShifts: 10 + m }));

  it('returns the latest six months ordered oldest to newest by default', () => {
    expect(trend(months).map((p) => p.label)).toEqual(['Mar 26', 'Apr 26', 'May 26', 'Jun 26', 'Jul 26', 'Aug 26']);
  });

  it('carries id and net for each point', () => {
    expect(trend(months)[5]).toEqual({ id: '2026-08', label: 'Aug 26', net: snap(2026, 8, { normalShifts: 18 }).figures.net });
  });

  it('respects a custom limit', () => {
    expect(trend(months, 2).map((p) => p.label)).toEqual(['Jul 26', 'Aug 26']);
  });

  it('is empty for no months', () => {
    expect(trend([])).toEqual([]);
  });
});

describe('stats', () => {
  it('is all zeros when empty', () => {
    expect(stats([])).toEqual({ count: 0, totalNet: 0, averageNet: 0 });
  });

  it('sums and averages net, rounded to cents', () => {
    const a = snap(2026, 1, { normalShifts: 22 });
    const b = snap(2026, 2, { normalShifts: 20 });
    const s = stats([a, b]);
    expect(s.count).toBe(2);
    expect(s.totalNet).toBe(round2(a.figures.net + b.figures.net));
    expect(s.averageNet).toBe(round2((a.figures.net + b.figures.net) / 2));
  });
});

describe('nextMonthAfter', () => {
  it('rolls December over to January of the next year', () => {
    expect(nextMonthAfter(2026, 12)).toEqual({ year: 2027, month: 1 });
  });

  it('adds one month otherwise', () => {
    expect(nextMonthAfter(2026, 3)).toEqual({ year: 2026, month: 4 });
  });
});

describe('defaultPlan', () => {
  it('plans the month after the latest saved month, copying its figures as strings', () => {
    const store = storeOf(
      snap(2026, 2, { normalShifts: 20 }),
      snap(2026, 3, { normalShifts: 21, weekdayOtHours: 6, saturdayShifts: 2, sundayShifts: 1 }),
    );
    expect(defaultPlan(store.months, baseForm, NOW)).toEqual({
      year: '2026', month: '4', normalShifts: '21', weekdayOtHours: '6', saturdayShifts: '2', sundayShifts: '1', publicHolidayShifts: '0',
    });
  });

  it('with no history, plans the month after the form and copies its totals', () => {
    expect(defaultPlan([], baseForm, NOW)).toEqual({
      year: '2026', month: '4', normalShifts: '22', weekdayOtHours: '4', saturdayShifts: '1', sundayShifts: '0', publicHolidayShifts: '',
    });
  });

  it('with no history and no valid form month, falls back to the next calendar month from now', () => {
    const plan = defaultPlan([], { ...baseForm, year: '', month: '' }, new Date(2026, 10, 14));
    expect(plan).toMatchObject({ year: '2026', month: '12' });
  });
});

describe('planToForm', () => {
  it('forces totals mode, clears entries and custom deductions, keeps base targetNet', () => {
    const base: FormState = {
      ...baseForm,
      inputMode: 'log',
      entries: [{ id: 'e1', date: '2026-03-02', status: 'ot' }],
      customDeductions: [{ id: 'c1', label: 'Loan', amount: '10' }],
    };
    const form = planToForm(
      { year: '2026', month: '4', normalShifts: '21', weekdayOtHours: '6', saturdayShifts: '2', sundayShifts: '1', publicHolidayShifts: '0' },
      base,
    );
    expect(form).toEqual({
      ...baseForm,
      year: '2026', month: '4', normalShifts: '21', weekdayOtHours: '6', saturdayShifts: '2', sundayShifts: '1', publicHolidayShifts: '0',
      inputMode: 'totals', entries: [], customDeductions: [],
    });
  });
});

describe('diffVsLast', () => {
  it('has no last month and no diff without history', () => {
    expect(diffVsLast(2000, [])).toEqual({ last: null, diff: null });
  });

  it('diffs the projected net against the latest saved net', () => {
    const last = snap(2026, 3);
    const older = snap(2026, 2, { normalShifts: 10 });
    const r = diffVsLast(last.figures.net + 100.5, [older, last]);
    expect(r.last?.id).toBe('2026-03');
    expect(r.diff).toBe(100.5);
  });
});

describe('migrateMonthsStore', () => {
  it('returns an empty store for null and garbage, never throws', () => {
    expect(migrateMonthsStore(null)).toEqual(EMPTY_STORE);
    expect(migrateMonthsStore('nope')).toEqual(EMPTY_STORE);
    expect(migrateMonthsStore(42)).toEqual(EMPTY_STORE);
    expect(migrateMonthsStore({})).toEqual(EMPTY_STORE);
  });

  it('reads a bare array of months as legacy data, sorted newest first', () => {
    const store = migrateMonthsStore([snap(2026, 2), snap(2026, 3)]);
    expect(store.months.map((m) => m.id)).toEqual(['2026-03', '2026-02']);
    expect(store.plan).toBeNull();
  });

  it('reads a future version number, still taking the months', () => {
    expect(migrateMonthsStore({ version: 9, months: [snap(2026, 3)] }).months).toHaveLength(1);
  });

  it('dedupes duplicate ids keeping the latest savedAt, in either order', () => {
    const older = snap(2026, 3, { normalShifts: 20 });
    const newer = { ...snap(2026, 3, { normalShifts: 22 }), savedAt: '2026-04-05T00:00:00.000Z' };
    expect(migrateMonthsStore([newer, older]).months.map((m) => m.figures.normalShifts)).toEqual([22]);
    expect(migrateMonthsStore([older, newer]).months.map((m) => m.figures.normalShifts)).toEqual([22]);
  });

  it('drops bad entries among good ones', () => {
    const good = snap(2026, 2);
    const badYear = { ...clone(snap(2026, 4)), year: 'abc' };
    const badNet = { ...clone(snap(2026, 5)), figures: { ...snap(2026, 5).figures, net: 'x' } };
    const noForm = { ...clone(snap(2026, 6)), form: undefined };
    const store = migrateMonthsStore([good, badYear, badNet, noForm, 'junk', null]);
    expect(store.months.map((m) => m.id)).toEqual(['2026-02']);
  });

  it('recomputes the id from year and month', () => {
    const store = migrateMonthsStore([{ ...snap(2026, 7), id: 'garbage' }]);
    expect(store.months[0].id).toBe('2026-07');
  });

  it('coerces plan fields to strings', () => {
    const store = migrateMonthsStore({ version: 1, months: [], plan: { year: 2026, month: '4', normalShifts: 22 } });
    expect(store.plan).toEqual({
      year: '2026', month: '4', normalShifts: '22', weekdayOtHours: '', saturdayShifts: '', sundayShifts: '', publicHolidayShifts: '',
    });
  });
});

describe('backup export / import', () => {
  it('round-trips a store through exportBackup and parseBackup', () => {
    const base = storeOf(snap(2026, 2), snap(2026, 3));
    const store: MonthsStore = { ...base, plan: defaultPlan(base.months, baseForm, NOW) };
    const text = exportBackup(store, DEFAULT_CONFIG, NOW);
    expect(JSON.parse(text)).toMatchObject({ app: 'otcalc', kind: 'backup', version: 1, exportedAt: NOW.toISOString() });
    expect(parseBackup(text)).toEqual({ ok: true, store, config: DEFAULT_CONFIG });
  });

  it('names the file by local date', () => {
    expect(backupFileName(new Date(2026, 10, 14))).toBe('otcalc-backup-2026-11-14.json');
  });

  it('rejects invalid JSON', () => {
    expect(parseBackup('{not json')).toEqual({ ok: false, error: 'Not a valid JSON file' });
  });

  it('rejects an object that is neither an otcalc backup nor a months store', () => {
    expect(parseBackup(JSON.stringify({ app: 'other', foo: 1 }))).toEqual({ ok: false, error: 'Not an Overtime Calculator backup' });
    expect(parseBackup('null')).toEqual({ ok: false, error: 'Not an Overtime Calculator backup' });
  });

  it('accepts a raw store and a bare months array', () => {
    const store = storeOf(snap(2026, 3));
    expect(parseBackup(JSON.stringify(store))).toEqual({ ok: true, store, config: null });
    expect(parseBackup(JSON.stringify(store.months))).toEqual({ ok: true, store, config: null });
  });

  it('gives config null when it is not an object', () => {
    expect(parseBackup(JSON.stringify({ app: 'otcalc', months: [], config: 'x' }))).toEqual({
      ok: true, store: EMPTY_STORE, config: null,
    });
  });
});

describe('mergeStores', () => {
  it('unions by id, incoming wins on conflict, sorted newest first', () => {
    const current = storeOf(snap(2026, 2, { normalShifts: 20 }), snap(2026, 3, { normalShifts: 20 }));
    const incoming = storeOf(snap(2026, 3, { normalShifts: 22 }), snap(2026, 4));
    const merged = mergeStores(current, incoming);
    expect(merged.months.map((m) => m.id)).toEqual(['2026-04', '2026-03', '2026-02']);
    expect(merged.months[1].figures.normalShifts).toBe(22);
  });

  it('keeps the current plan when incoming has none', () => {
    const current: MonthsStore = { ...EMPTY_STORE, plan: defaultPlan([], baseForm, NOW) };
    expect(mergeStores(current, EMPTY_STORE).plan).toEqual(current.plan);
  });

  it('takes the incoming plan when it has one', () => {
    const incomingPlan = defaultPlan([snap(2026, 3)], baseForm, NOW);
    const merged = mergeStores({ ...EMPTY_STORE, plan: null }, { ...EMPTY_STORE, plan: incomingPlan });
    expect(merged.plan).toEqual(incomingPlan);
  });
});

describe('sanitizeCustomDeductions', () => {
  it('keeps valid drafts unchanged', () => {
    const valid = [{ id: 'a', label: 'Gym', amount: '12.5' }];
    expect(sanitizeCustomDeductions(valid)).toEqual(valid);
  });

  it('drops items that are not plain objects', () => {
    const raw = [null, 'x', 4, [1], { id: 'b', label: 'Gym', amount: '3' }];
    expect(sanitizeCustomDeductions(raw)).toEqual([{ id: 'b', label: 'Gym', amount: '3' }]);
  });

  it('uses a stable imported-<index> id when id is missing or not a string', () => {
    const raw = [{ label: 'A', amount: '1' }, { id: 7, label: 'B', amount: '2' }];
    expect(sanitizeCustomDeductions(raw).map((d) => d.id)).toEqual(['imported-0', 'imported-1']);
  });

  it('coerces label and amount: finite numbers to strings, anything else to empty', () => {
    const raw = [
      { id: 'a', label: 5, amount: 12.5 },
      { id: 'b', label: null, amount: NaN },
      { id: 'c', label: 'x', amount: {} },
    ];
    expect(sanitizeCustomDeductions(raw)).toEqual([
      { id: 'a', label: '5', amount: '12.5' },
      { id: 'b', label: '', amount: '' },
      { id: 'c', label: 'x', amount: '' },
    ]);
  });

  it('returns an empty list when the value is not an array', () => {
    expect(sanitizeCustomDeductions(undefined)).toEqual([]);
    expect(sanitizeCustomDeductions({ id: 'a' })).toEqual([]);
  });
});

describe('saved form reading (no crash on bad saved data)', () => {
  it('sanitizes custom deductions and migrates entries inside a saved month', () => {
    const good = snap(2026, 3);
    const raw = {
      ...good,
      form: {
        ...good.form,
        customDeductions: [null, { id: 9, label: 4, amount: 3 }, { id: 'ok', label: 'Gym', amount: '20' }],
        entries: [null, { date: 5 }, { id: 'a', date: '2026-03-02', status: 'ot', hours: 1.25 }],
      },
    };
    const [m] = migrateMonthsStore({ version: 1, months: [raw], plan: null }).months;
    expect(m.form.customDeductions).toEqual([
      { id: 'imported-1', label: '4', amount: '3' },
      { id: 'ok', label: 'Gym', amount: '20' },
    ]);
    expect(m.form.entries).toEqual([{ id: 'a', date: '2026-03-02', status: 'otLong' }]);
  });
});

describe('backup size cap', () => {
  it('allows files up to 2 MB and rejects anything bigger', () => {
    expect(MAX_BACKUP_BYTES).toBe(2 * 1024 * 1024);
    expect(isBackupTooLarge(MAX_BACKUP_BYTES)).toBe(false);
    expect(isBackupTooLarge(MAX_BACKUP_BYTES + 1)).toBe(true);
  });
});
