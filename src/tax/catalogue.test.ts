import { describe, expect, it } from 'vitest';
import {
  NSMAN_PARENT_MAX_PARENTS,
  RELIEF_CATALOGUE,
  UI_MAX_CHILDREN,
  incomeYearForYa,
  reliefCap,
  reliefTiers,
  selectedReliefTier,
  suggestCpfRelief,
  suggestEarnedIncomeRelief,
  type ReliefContext,
} from './catalogue';
import { RELIEF_IDS } from './reliefs';

function ctx(over: Partial<ReliefContext> = {}): ReliefContext {
  return {
    ya: 2026,
    age: 30,
    employmentIncome: 90000,
    bonus: 20000,
    residency: 'citizenOrPr',
    claimed: {},
    units: {},
    ...over,
  };
}

describe('reliefCap', () => {
  it('earnedIncome defaults to the standard tier for the age band', () => {
    expect(reliefCap('earnedIncome', ctx({ age: 30 }))).toBe(1000);
    expect(reliefCap('earnedIncome', ctx({ age: 55 }))).toBe(6000);
    expect(reliefCap('earnedIncome', ctx({ age: 60 }))).toBe(8000);
  });

  it('earnedIncome uses the disability tier when selected', () => {
    const tiers = { earnedIncome: 'disability' };
    expect(reliefCap('earnedIncome', ctx({ age: 30, tiers }))).toBe(4000);
    expect(reliefCap('earnedIncome', ctx({ age: 55, tiers }))).toBe(10000);
    expect(reliefCap('earnedIncome', ctx({ age: 60, tiers }))).toBe(12000);
  });

  it('earnedIncome cannot exceed the taxable earned income', () => {
    expect(reliefCap('earnedIncome', ctx({ employmentIncome: 500, bonus: 0 }))).toBe(500);
    expect(
      reliefCap('earnedIncome', ctx({ employmentIncome: 2000, bonus: 0, tiers: { earnedIncome: 'disability' } })),
    ).toBe(2000);
  });

  it('cpf is the compulsory max at 20% of the $102,000 ceiling for age 55 and below', () => {
    expect(reliefCap('cpf', ctx({ ya: 2026, age: 30 }))).toBeCloseTo(20400, 2);
  });

  it('cpf uses the older age-band employee rate (YA2026 uses income year 2025)', () => {
    // income year 2025, age 57 -> above55To60 employee rate 0.17
    expect(reliefCap('cpf', ctx({ ya: 2026, age: 57 }))).toBeCloseTo(0.17 * 102000, 2);
  });

  it('cpf is 0 for a foreigner', () => {
    expect(reliefCap('cpf', ctx({ residency: 'foreigner' }))).toBe(0);
  });

  it('lifeInsurance shrinks as claimed CPF rises and is 0 at or above $5,000', () => {
    expect(reliefCap('lifeInsurance', ctx({ claimed: { cpf: 0 } }))).toBe(5000);
    expect(reliefCap('lifeInsurance', ctx({ claimed: { cpf: 3000 } }))).toBe(2000);
    expect(reliefCap('lifeInsurance', ctx({ claimed: { cpf: 5000 } }))).toBe(0);
    expect(reliefCap('lifeInsurance', ctx({ claimed: { cpf: 6000 } }))).toBe(0);
  });

  it('nsman self defaults to the general, performed-activity amount', () => {
    expect(reliefCap('nsmanSelf', ctx())).toBe(3000);
    expect(reliefCap('nsmanSelf', ctx({ tiers: { nsmanSelf: 'keyAppointment-activity' } }))).toBe(5000);
    expect(reliefCap('nsmanSelf', ctx({ tiers: { nsmanSelf: 'general-noActivity' } }))).toBe(1500);
  });

  it('nsman wife cap is $750', () => {
    expect(reliefCap('nsmanWife', ctx())).toBe(750);
  });

  it('nsman parent clamps units to 0..NSMAN_PARENT_MAX_PARENTS', () => {
    expect(reliefCap('nsmanParent', ctx({ units: { nsmanParent: 0 } }))).toBe(0);
    expect(reliefCap('nsmanParent', ctx({ units: { nsmanParent: 1 } }))).toBe(750);
    expect(reliefCap('nsmanParent', ctx({ units: { nsmanParent: 2 } }))).toBe(1500);
    expect(reliefCap('nsmanParent', ctx({ units: { nsmanParent: 5 } }))).toBe(1500);
    expect(NSMAN_PARENT_MAX_PARENTS).toBe(2);
  });

  it('spouse defaults to the standard amount and uses the disabled tier when selected', () => {
    expect(reliefCap('spouse', ctx())).toBe(2000);
    expect(reliefCap('spouse', ctx({ tiers: { spouse: 'disability' } }))).toBe(5500);
  });

  it('parent defaults to stays-with, clamps units to 0..2 and multiplies by the tier', () => {
    expect(reliefCap('parent', ctx({ units: { parent: 0 } }))).toBe(0);
    expect(reliefCap('parent', ctx({ units: { parent: 1 } }))).toBe(9000);
    expect(reliefCap('parent', ctx({ units: { parent: 2 } }))).toBe(18000);
    expect(reliefCap('parent', ctx({ units: { parent: 9 } }))).toBe(18000);
  });

  it('parent uses the selected tier per dependant', () => {
    expect(reliefCap('parent', ctx({ units: { parent: 1 }, tiers: { parent: 'notStaysWith' } }))).toBe(5500);
    expect(
      reliefCap('parent', ctx({ units: { parent: 2 }, tiers: { parent: 'staysWithDisability' } })),
    ).toBe(28000);
    expect(
      reliefCap('parent', ctx({ units: { parent: 1 }, tiers: { parent: 'notStaysWithDisability' } })),
    ).toBe(10000);
  });

  it('falls back to the default tier for an unknown tier id', () => {
    expect(reliefCap('spouse', ctx({ tiers: { spouse: 'martian' } }))).toBe(2000);
    expect(reliefCap('parent', ctx({ units: { parent: 1 }, tiers: { parent: 'nope' } }))).toBe(9000);
    expect(reliefCap('earnedIncome', ctx({ tiers: { earnedIncome: 'nope' } }))).toBe(1000);
  });

  it('qcr is $4,000 per child, clamped to UI_MAX_CHILDREN', () => {
    expect(reliefCap('qcr', ctx({ units: { qcr: 3 } }))).toBe(12000);
    expect(reliefCap('qcr', ctx({ units: { qcr: 20 } }))).toBe(4000 * UI_MAX_CHILDREN);
  });

  it('hcr is $7,500 per child', () => {
    expect(reliefCap('hcr', ctx({ units: { hcr: 1 } }))).toBe(7500);
  });

  it('wmcr is the fixed-dollar sum for 1, 2, 3 and 4 children', () => {
    expect(reliefCap('wmcr', ctx({ units: { wmcr: 1 } }))).toBe(8000);
    expect(reliefCap('wmcr', ctx({ units: { wmcr: 2 } }))).toBe(18000);
    expect(reliefCap('wmcr', ctx({ units: { wmcr: 3 } }))).toBe(30000);
    expect(reliefCap('wmcr', ctx({ units: { wmcr: 4 } }))).toBe(42000);
  });

  describe('wmcr with pre-2024 children', () => {
    const wmcr = (over: Partial<ReliefContext>) => reliefCap('wmcr', ctx(over));

    it('1 pre-2024 child at income $100,000 → 15% = $15,000', () => {
      expect(wmcr({ employmentIncome: 100000, bonus: 0, wmcrPre2024: 1 })).toBe(15000);
    });

    it('3 pre-2024 children at income $100,000 → 15 + 20 + 25 = 60% = $60,000', () => {
      expect(wmcr({ employmentIncome: 100000, bonus: 0, wmcrPre2024: 3 })).toBe(60000);
    });

    it('2024+ children keep the fixed amounts when no pre-2024 children are given', () => {
      expect(wmcr({ employmentIncome: 100000, bonus: 0, units: { wmcr: 2 } })).toBe(18000);
    });

    it('mixed: 1 pre-2024 child (15%) then 1 born 2024+ (fixed $10,000 as 2nd child)', () => {
      expect(wmcr({ employmentIncome: 100000, bonus: 0, wmcrPre2024: 1, units: { wmcr: 1 } })).toBe(
        25000,
      );
    });

    it('total is capped at 100% of mother earned income (5 pre-2024 children = 110%)', () => {
      expect(wmcr({ employmentIncome: 10000, bonus: 0, wmcrPre2024: 5 })).toBe(10000);
    });

    it('earned income for the percentage is employment plus bonus', () => {
      expect(wmcr({ employmentIncome: 60000, bonus: 40000, wmcrPre2024: 1 })).toBe(15000);
    });

    it('per-child $50,000 cap: 15% of $1,000,000 less $4,000 QCR → $46,000', () => {
      expect(
        wmcr({ employmentIncome: 1000000, bonus: 0, wmcrPre2024: 1, claimed: { qcr: 4000 } }),
      ).toBe(46000);
    });

    it('per-child $50,000 cap applies to each of 3 children (QCR $4,000 each, 25% = $250k nominal)', () => {
      expect(
        wmcr({ employmentIncome: 1000000, bonus: 0, wmcrPre2024: 3, claimed: { qcr: 12000 } }),
      ).toBe(3 * 46000);
    });

    it('pre-2024 plus 2024+ children are clamped to UI_MAX_CHILDREN (10) in total', () => {
      // 8 pre-2024 children hit the $50,000 per-child cap (no QCR): 8 × 50,000.
      // Only 2 of the 2024+ units fit: they sit at positions 9–10 (3rd+ slot) → 12,000 each.
      expect(
        wmcr({ employmentIncome: 1000000, bonus: 0, wmcrPre2024: 8, units: { wmcr: 8 } }),
      ).toBe(8 * 50000 + 2 * 12000);
    });
  });

  it('courseFees is 0 in YA2026 and $5,500 in YA2025', () => {
    expect(reliefCap('courseFees', ctx({ ya: 2026 }))).toBe(0);
    expect(reliefCap('courseFees', ctx({ ya: 2025 }))).toBe(5500);
  });

  it('cpfCashTopUp is the $16,000 total cap', () => {
    expect(reliefCap('cpfCashTopUp', ctx())).toBe(16000);
  });

  it('srs cap depends on residency', () => {
    expect(reliefCap('srs', ctx({ residency: 'citizenOrPr' }))).toBe(15300);
    expect(reliefCap('srs', ctx({ residency: 'foreigner' }))).toBe(35700);
  });

  it('returns a non-negative cap for every relief', () => {
    for (const id of RELIEF_IDS) {
      expect(reliefCap(id, ctx({ units: { nsmanParent: 2, parent: 2, qcr: 1, hcr: 1, wmcr: 1 } })))
        .toBeGreaterThanOrEqual(0);
    }
  });
});

describe('suggestEarnedIncomeRelief', () => {
  it('uses the normal (non-disabled) tier on employment plus bonus', () => {
    expect(suggestEarnedIncomeRelief(ctx({ age: 30 }))).toBe(1000);
    expect(suggestEarnedIncomeRelief(ctx({ age: 60, employmentIncome: 500, bonus: 0 }))).toBe(500);
  });

  it('follows the disability tier when selected', () => {
    expect(suggestEarnedIncomeRelief(ctx({ age: 30, tiers: { earnedIncome: 'disability' } }))).toBe(4000);
  });
});

describe('reliefTiers', () => {
  it('lists the earned income tiers for the age band, standard first', () => {
    expect(reliefTiers('earnedIncome', { age: 30 })?.map((t) => [t.id, t.amount])).toEqual([
      ['normal', 1000],
      ['disability', 4000],
    ]);
    expect(reliefTiers('earnedIncome', { age: 57 })?.map((t) => t.amount)).toEqual([6000, 10000]);
    expect(reliefTiers('earnedIncome', { age: 60 })?.map((t) => t.amount)).toEqual([8000, 12000]);
  });

  it('lists the spouse, parent and NSman self tiers with the default first', () => {
    expect(reliefTiers('spouse', { age: 30 })?.map((t) => [t.id, t.amount])).toEqual([
      ['normal', 2000],
      ['disability', 5500],
    ]);
    expect(reliefTiers('parent', { age: 30 })?.map((t) => [t.id, t.amount])).toEqual([
      ['staysWith', 9000],
      ['notStaysWith', 5500],
      ['staysWithDisability', 14000],
      ['notStaysWithDisability', 10000],
    ]);
    expect(reliefTiers('nsmanSelf', { age: 30 })?.map((t) => [t.id, t.amount])).toEqual([
      ['general-activity', 3000],
      ['general-noActivity', 1500],
      ['keyAppointment-activity', 5000],
      ['keyAppointment-noActivity', 3500],
    ]);
  });

  it('is undefined for reliefs without tiers', () => {
    expect(reliefTiers('cpf', { age: 30 })).toBeUndefined();
    expect(reliefTiers('qcr', { age: 30 })).toBeUndefined();
    expect(reliefTiers('srs', { age: 30 })).toBeUndefined();
  });

  it('every tier id is unique within its relief', () => {
    for (const id of RELIEF_IDS) {
      const ids = (reliefTiers(id, { age: 30 }) ?? []).map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('selectedReliefTier', () => {
  it('returns the selected tier, else the default', () => {
    expect(selectedReliefTier('spouse', ctx())?.id).toBe('normal');
    expect(selectedReliefTier('spouse', ctx({ tiers: { spouse: 'disability' } }))?.id).toBe('disability');
    expect(selectedReliefTier('cpf', ctx())).toBeUndefined();
  });
});

describe('suggestCpfRelief', () => {
  it('matches rate × (capped OW + capped AW) for age 30, YA2026, employment 90k, bonus 20k', () => {
    // income year 2025: OW monthly ceiling 7400 → annual 88800; AW room 102000 − 88800 = 13200
    const expected = 0.2 * (Math.min(90000, 7400 * 12) + Math.min(20000, 102000 - 88800));
    expect(suggestCpfRelief(ctx({ ya: 2026, age: 30, employmentIncome: 90000, bonus: 20000 })))
      .toBeCloseTo(expected, 2);
    expect(suggestCpfRelief(ctx({ ya: 2026, age: 30, employmentIncome: 90000, bonus: 20000 })))
      .toBeCloseTo(20400, 2);
  });

  it('caps the ordinary wage at 12 × the OW ceiling and bonus at the remaining room', () => {
    expect(suggestCpfRelief(ctx({ employmentIncome: 200000, bonus: 0 }))).toBeCloseTo(0.2 * 88800, 2);
  });

  it('uses the older age-band employee rate', () => {
    expect(
      suggestCpfRelief(ctx({ age: 57, employmentIncome: 50000, bonus: 0 })),
    ).toBeCloseTo(0.17 * 50000, 2);
  });

  it('is 0 for a foreigner', () => {
    expect(suggestCpfRelief(ctx({ residency: 'foreigner' }))).toBe(0);
  });

  it('never exceeds the cpf cap', () => {
    const c = ctx({ employmentIncome: 500000, bonus: 500000 });
    expect(suggestCpfRelief(c)).toBeLessThanOrEqual(reliefCap('cpf', c));
  });
});

describe('incomeYearForYa', () => {
  it('maps YA to the preceding income year', () => {
    expect(incomeYearForYa(2026)).toBe(2025);
    expect(incomeYearForYa(2025)).toBe(2024);
  });
});

describe('RELIEF_CATALOGUE', () => {
  it('has metadata for every relief id with a label and blurb', () => {
    for (const id of RELIEF_IDS) {
      expect(RELIEF_CATALOGUE[id].id).toBe(id);
      expect(RELIEF_CATALOGUE[id].label.length).toBeGreaterThan(0);
      expect(RELIEF_CATALOGUE[id].blurb.length).toBeGreaterThan(0);
    }
  });

  it('uses the expected labels', () => {
    expect(RELIEF_CATALOGUE.earnedIncome.label).toBe('Earned Income Relief');
    expect(RELIEF_CATALOGUE.cpf.label).toBe('CPF Relief');
    expect(RELIEF_CATALOGUE.srs.label).toBe('SRS Contributions');
    expect(RELIEF_CATALOGUE.cpfCashTopUp.label).toBe('CPF Cash Top-up');
  });

  it('cpf blurb does not claim voluntary MediSave under Employee CPF relief', () => {
    expect(RELIEF_CATALOGUE.cpf.blurb).not.toMatch(/medisave/i);
  });

  it('cpf blurb points voluntary top-ups to CPF Cash Top-up Relief', () => {
    expect(RELIEF_CATALOGUE.cpf.blurb).toMatch(/CPF Cash Top-up Relief/);
  });

  it('cash top-up blurb covers voluntary MediSave and the $8,000 + $8,000 caps', () => {
    const blurb = RELIEF_CATALOGUE.cpfCashTopUp.blurb;
    expect(blurb).toMatch(/MediSave/);
    expect(blurb).toMatch(/\$8,000/);
    expect(blurb).toMatch(/\$16,000/);
  });

  it('sets unit labels and bounds only for unit-based reliefs', () => {
    expect(RELIEF_CATALOGUE.nsmanParent).toMatchObject({ unitLabel: 'parents', maxUnits: 2 });
    expect(RELIEF_CATALOGUE.parent).toMatchObject({ unitLabel: 'dependants', maxUnits: 2 });
    for (const id of ['qcr', 'hcr', 'wmcr'] as const) {
      expect(RELIEF_CATALOGUE[id]).toMatchObject({ unitLabel: 'children', maxUnits: UI_MAX_CHILDREN });
    }
    expect(RELIEF_CATALOGUE.spouse.unitLabel).toBeUndefined();
    expect(RELIEF_CATALOGUE.spouse.maxUnits).toBeUndefined();
  });

  it('auto-suggests only earnedIncome and cpf', () => {
    const auto = RELIEF_IDS.filter((id) => RELIEF_CATALOGUE[id].autoSuggest);
    expect(auto).toEqual(['earnedIncome', 'cpf']);
  });
});
