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
    // parent 2×14000 (disabled tier) + qcr 10×4000 + hcr 1×7500 + spouse 5500 (disabled tier) = 81000
    const view = buildTaxView(
      stateWith(
        {
          earnedIncome: { eligible: false },
          cpf: { eligible: false },
          parent: { units: 2, amount: 28000, tier: 'staysWithDisability' },
          qcr: { units: 10, amount: 40000 },
          hcr: { units: 1, amount: 7500 },
          spouse: { amount: 5500, tier: 'disability' },
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

  it('totalShare is claimed over the overall cap, clamped to 0..1', () => {
    expect(buildTaxView(defaultTaxState()).totalShare).toBe(0);
    const view = buildTaxView(stateWith({ spouse: { amount: 2000 } }));
    expect(view.totalShare).toBeCloseTo(2000 / PERSONAL_RELIEF_CAP, 10);
    const over = buildTaxView(
      stateWith({ parent: { units: 2, amount: 28000, tier: 'staysWithDisability' }, qcr: { units: 10, amount: 40000 }, hcr: { units: 1, amount: 7500 }, spouse: { amount: 5500, tier: 'disability' } }),
    );
    expect(over.totalShare).toBe(1);
  });

  it('row.entered is the typed amount before clamping', () => {
    expect(rowOf(buildTaxView(stateWith({ cpf: { amount: 999999 } })), 'cpf')).toMatchObject({
      entered: 999999,
      claimed: expect.any(Number),
    });
    expect(rowOf(buildTaxView(defaultTaxState()), 'cpf').entered).toBeNull();
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
    expect(ids).toEqual(expect.arrayContaining(['cpf', 'srs', 'cpfCashTopUp']));
    // The standard Earned Income tier is fully claimed by the automatic suggestion.
    expect(ids).not.toContain('earnedIncome');
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

describe('buildTaxView relief tiers', () => {
  it('caps tiered reliefs at the default tier when none is selected', () => {
    const view = buildTaxView(
      stateWith({ spouse: {}, parent: { units: 1 }, nsmanSelf: {}, earnedIncome: {} }, { employmentIncome: 90000 }),
    );
    expect(rowOf(view, 'spouse')).toMatchObject({ cap: 2000, tierId: 'normal' });
    expect(rowOf(view, 'parent')).toMatchObject({ cap: 9000, tierId: 'staysWith' });
    expect(rowOf(view, 'nsmanSelf')).toMatchObject({ cap: 3000, tierId: 'general-activity' });
    expect(rowOf(view, 'earnedIncome')).toMatchObject({ cap: 1000, tierId: 'normal' });
  });

  it('exposes the tier list on tiered rows only', () => {
    const view = buildTaxView(defaultTaxState());
    expect(rowOf(view, 'parent').tiers.map((t) => t.amount)).toEqual([9000, 5500, 14000, 10000]);
    expect(rowOf(view, 'srs')).toMatchObject({ tiers: [], tierId: null });
  });

  it('uses the selected tier for cap, claimed and totals', () => {
    const view = buildTaxView(stateWith({ spouse: { tier: 'disability', amount: 5500 } }));
    expect(rowOf(view, 'spouse')).toMatchObject({ cap: 5500, claimed: 5500, tierId: 'disability' });
    expect(view.totalClaimed).toBe(5500);
  });

  it('reminder room follows the selected parent tier', () => {
    const standard = buildTaxView(stateWith({ parent: { units: 1 } }, { employmentIncome: 150000 }));
    const disabled = buildTaxView(
      stateWith({ parent: { units: 1, tier: 'staysWithDisability' } }, { employmentIncome: 150000 }),
    );
    expect(standard.reminders.find((r) => r.id === 'parent')?.room).toBe(9000);
    expect(disabled.reminders.find((r) => r.id === 'parent')?.room).toBe(14000);
  });

  it('earned income reminder room uses the selected tier', () => {
    // Standard tier, automatic suggestion: fully claimed, so no reminder.
    const standard = buildTaxView(stateWith({}, { employmentIncome: 150000 }));
    expect(standard.reminders.map((r) => r.id)).not.toContain('earnedIncome');
    // Disability tier: the suggestion follows the tier, so it is claimed in full.
    const suggested = buildTaxView(stateWith({ earnedIncome: { tier: 'disability' } }, { employmentIncome: 150000 }));
    expect(rowOf(suggested, 'earnedIncome')).toMatchObject({ claimed: 4000, suggested: 4000 });
    expect(suggested.reminders.map((r) => r.id)).not.toContain('earnedIncome');
    // Typed amount of 1000 under the disability tier leaves 3000 of room.
    const typed = buildTaxView(
      stateWith({ earnedIncome: { tier: 'disability', amount: 1000 } }, { employmentIncome: 150000 }),
    );
    expect(typed.reminders.find((r) => r.id === 'earnedIncome')?.room).toBe(3000);
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

  it('keeps known tier ids and drops unknown ones', () => {
    const migrated = migrateTaxState({
      v: 1,
      entries: {
        spouse: { eligible: true, amount: null, units: 0, tier: 'disability' },
        parent: { eligible: true, amount: null, units: 1, tier: 'martian' },
        cpf: { eligible: true, amount: null, units: 0, tier: 42 },
      },
    });
    expect(migrated.entries.spouse?.tier).toBe('disability');
    expect(migrated.entries.parent?.tier).toBeUndefined();
    expect(migrated.entries.cpf?.tier).toBeUndefined();
    // A tier id from another relief is not valid here either.
    const cross = migrateTaxState({ v: 1, entries: { spouse: { tier: 'staysWith' } } });
    expect(cross.entries.spouse?.tier).toBeUndefined();
    expect(buildTaxView(migrated).rows.find((r) => r.id === 'parent')?.tierId).toBe('staysWith');
  });

  it('clamps unit counts to UI_MAX_CHILDREN', () => {
    const migrated = migrateTaxState({ v: 1, entries: { qcr: { eligible: true, amount: null, units: 99 } } });
    expect(migrated.entries.qcr?.units).toBe(10);
  });
});
