import { describe, expect, it } from 'vitest';
import { PERSONAL_RELIEF_CAP, RELIEF_IDS, computeTax, toReliefLines, type ReliefId } from '../../tax';
import {
  buildTaxView,
  defaultTaxState,
  migrateTaxState,
  type EntryState,
  type TaxState,
} from './taxModel';

/** Default state with per-relief patches and top-level overrides. */
function stateWith(
  patch: Partial<Record<ReliefId, Partial<EntryState>>>,
  base: Partial<Omit<TaxState, 'entries'>> = {},
): TaxState {
  const state = { ...defaultTaxState(), ...base };
  const entries: Partial<Record<ReliefId, EntryState>> = { ...state.entries };
  for (const id of RELIEF_IDS) {
    const p = patch[id];
    if (!p) continue;
    const base = entries[id] ?? { eligible: true, amount: null, units: 0 };
    entries[id] = { ...base, eligible: true, ...p };
  }
  return { ...state, entries };
}

function rowOf(view: ReturnType<typeof buildTaxView>, id: ReliefId) {
  const row = view.rows.find((r) => r.id === id);
  if (!row) throw new Error(`no row for ${id}`);
  return row;
}

describe('buildTaxView clamping and suggestions', () => {
  it('clamps a typed amount to the relief cap', () => {
    const view = buildTaxView(stateWith({ cpf: { amount: 999999 } }));
    expect(rowOf(view, 'cpf').claimed).toBeCloseTo(20400, 2);
    expect(rowOf(view, 'cpf').isSuggested).toBe(false);
  });

  it('treats a negative or NaN typed amount as 0', () => {
    expect(rowOf(buildTaxView(stateWith({ cpf: { amount: -500 } })), 'cpf').claimed).toBe(0);
    expect(rowOf(buildTaxView(stateWith({ cpf: { amount: Number.NaN } })), 'cpf').claimed).toBe(0);
  });

  it('uses the suggestion when the amount is null', () => {
    const view = buildTaxView(stateWith({}, { employmentIncome: 90000, bonus: 20000 }));
    expect(rowOf(view, 'earnedIncome')).toMatchObject({ suggested: 1000, claimed: 1000, isSuggested: true });
    expect(rowOf(view, 'cpf').claimed).toBeCloseTo(20400, 2);
    expect(rowOf(view, 'cpf').isSuggested).toBe(true);
  });

  it('does not treat a relief without autoSuggest as suggested', () => {
    const view = buildTaxView(stateWith({}, { employmentIncome: 90000, bonus: 20000 }));
    expect(rowOf(view, 'srs')).toMatchObject({ claimed: 0, isSuggested: false });
  });

  it('ineligible rows contribute 0 to the total', () => {
    const on = buildTaxView(stateWith({ srs: { eligible: true, amount: 15000 } }));
    const off = buildTaxView(stateWith({ srs: { eligible: false, amount: 15000 } }));
    expect(rowOf(off, 'srs').claimed).toBe(0);
    expect(on.totalClaimed - off.totalClaimed).toBeCloseTo(15000, 2);
  });

  it('courseFees contributes 0 in YA2026 even if eligible', () => {
    expect(rowOf(buildTaxView(stateWith({ courseFees: { amount: 5000 } }, { ya: 2026 })), 'courseFees').claimed).toBe(0);
    expect(rowOf(buildTaxView(stateWith({ courseFees: { amount: 5000 } }, { ya: 2025 })), 'courseFees').claimed).toBe(5000);
  });
});

describe('buildTaxView totals and cap', () => {
  it('sums claimed amounts and reports no cap reached below $80,000', () => {
    const view = buildTaxView(stateWith({}, { employmentIncome: 90000, bonus: 20000 }));
    expect(view.totalClaimed).toBeCloseTo(1000 + 20400, 2);
    expect(view.overallCap).toBe(PERSONAL_RELIEF_CAP);
    expect(view.capReached).toBe(false);
  });

  it('reports the cap reached when claimed rows sum past $80,000', () => {
    // parent 2×14000 + qcr 10×4000 + hcr 1×7500 + spouse 5500 = 81000
    const view = buildTaxView(
      stateWith(
        {
          earnedIncome: { eligible: false },
          cpf: { eligible: false },
          parent: { units: 2, amount: 28000 },
          qcr: { units: 10, amount: 40000 },
          hcr: { units: 1, amount: 7500 },
          spouse: { amount: 5500 },
        },
        { bonus: 300000 },
      ),
    );
    expect(view.totalClaimed).toBe(81000);
    expect(view.capReached).toBe(true);
    expect(view.result.reliefCapApplied).toBe(true);
    expect(view.result.reliefsAllowed).toBe(PERSONAL_RELIEF_CAP);
  });

  it('result equals computeTax called directly with the same claimed lines', () => {
    const view = buildTaxView(stateWith({}, { employmentIncome: 90000, bonus: 20000 }));
    const direct = computeTax({
      ya: 2026,
      totalIncome: 110000,
      reliefs: toReliefLines({ earnedIncome: 1000, cpf: 20400 }, 2026),
    });
    expect(view.result).toEqual(direct);
  });

  it('effectiveRate is 0 with no income and netTaxPayable / totalIncome otherwise', () => {
    expect(buildTaxView(defaultTaxState()).effectiveRate).toBe(0);
    const view = buildTaxView(stateWith({}, { employmentIncome: 90000, bonus: 20000 }));
    expect(view.effectiveRate).toBeCloseTo(view.result.netTaxPayable / 110000, 10);
  });
});

describe('buildTaxView reminders', () => {
  it('lists eligible, available reliefs with room, sorted by extraSaving descending', () => {
    const view = buildTaxView(stateWith({}, { employmentIncome: 150000 }));
    const ids = view.reminders.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['earnedIncome', 'cpf', 'srs', 'cpfCashTopUp']));
    expect(ids).not.toContain('courseFees');
    // claimed CPF (17760) ≥ $5,000, so the life-insurance cap is 0 and there is no room to remind about.
    expect(ids).not.toContain('lifeInsurance');
    for (let i = 1; i < view.reminders.length; i += 1) {
      expect(view.reminders[i - 1].extraSaving).toBeGreaterThanOrEqual(view.reminders[i].extraSaving);
    }
  });

  it('computes room as cap minus claimed, and extraSaving via computeTax at cap', () => {
    // employment 150000: CPF suggestion = 0.2 × 88800 = 17760, cap 20400 → room 2640
    const view = buildTaxView(stateWith({}, { employmentIncome: 150000 }));
    const cpf = view.reminders.find((r) => r.id === 'cpf');
    expect(cpf?.room).toBeCloseTo(2640, 2);
    const srs = view.reminders.find((r) => r.id === 'srs');
    expect(srs?.room).toBe(15300);
    const withSrsAtCap = computeTax({
      ya: 2026,
      totalIncome: 150000,
      reliefs: toReliefLines({ earnedIncome: 1000, cpf: 17760, srs: 15300 }, 2026),
    });
    const base = computeTax({
      ya: 2026,
      totalIncome: 150000,
      reliefs: toReliefLines({ earnedIncome: 1000, cpf: 17760 }, 2026),
    });
    expect(srs?.extraSaving).toBeCloseTo(base.netTaxPayable - withSrsAtCap.netTaxPayable, 2);
  });
});

describe('migrateTaxState', () => {
  it.each([null, undefined, 'x', 42, [], { v: 2 }, { v: '1' }])(
    'returns defaults for garbage input %#',
    (raw) => {
      expect(migrateTaxState(raw)).toEqual(defaultTaxState());
    },
  );

  it('falls back field by field for junk inside a v1 object', () => {
    const junk = {
      v: 1,
      ya: 1999,
      employmentIncome: 'x',
      bonus: Number.NaN,
      age: -4,
      residency: 'martian',
      entries: { cpf: 'junk' },
    };
    expect(migrateTaxState(junk)).toEqual(defaultTaxState());
  });

  it('keeps a valid state unchanged across a JSON round trip', () => {
    const state = stateWith(
      { parent: { units: 2, amount: 1000 }, srs: { eligible: false } },
      { ya: 2025, age: 58, residency: 'foreigner', employmentIncome: 70000 },
    );
    expect(migrateTaxState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('clamps unit counts to UI_MAX_CHILDREN', () => {
    const migrated = migrateTaxState({ v: 1, entries: { qcr: { eligible: true, amount: null, units: 99 } } });
    expect(migrated.entries.qcr?.units).toBe(10);
  });
});
