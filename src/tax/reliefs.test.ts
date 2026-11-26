import { describe, expect, it } from 'vitest';
import {
  CPF_ANNUAL_WAGE_CEILING,
  CPF_FRS_BHS_REFERENCE,
  CPF_RELIEF_PRACTICAL_MAX_AGE_55_AND_BELOW,
  CPF_TOPUP_TOTAL_CAP,
  COURSE_FEES_CAP,
  OW_MONTHLY_CEILING,
  PARENT_RELIEF,
  PERSONAL_RELIEF_CAP,
  RELIEF_IDS,
  RELIEF_ORDER,
  SPOUSE_RELIEF,
  SRS_CAP,
  courseFeesRelief,
  cpfCashTopUpRelief,
  cpfEmployeeRate,
  cpfRelief,
  earnedIncomeRelief,
  isReliefAvailable,
  lifeInsuranceRelief,
  nsmanParentRelief,
  nsmanSelfRelief,
  nsmanWifeRelief,
  parentRelief,
  qualifyingChildRelief,
  resolveNsmanSelfVsParent,
  spouseRelief,
  srsRelief,
  toReliefLines,
  workingMotherChildRelief,
} from './reliefs';

describe('§2.1 Earned Income Relief', () => {
  it('under 55 normal is $1,000 (age 54)', () => {
    expect(earnedIncomeRelief({ age: 54, disabled: false, earnedIncome: 100000 })).toBe(1000);
  });
  it('age 55 moves to the 55–59 tier at $6,000', () => {
    expect(earnedIncomeRelief({ age: 55, disabled: false, earnedIncome: 100000 })).toBe(6000);
  });
  it('age 59 is still in the 55–59 tier at $6,000', () => {
    expect(earnedIncomeRelief({ age: 59, disabled: false, earnedIncome: 100000 })).toBe(6000);
  });
  it('age 60 moves to the 60+ tier at $8,000', () => {
    expect(earnedIncomeRelief({ age: 60, disabled: false, earnedIncome: 100000 })).toBe(8000);
  });
  it('disabled under 55 is $4,000', () => {
    expect(earnedIncomeRelief({ age: 40, disabled: true, earnedIncome: 100000 })).toBe(4000);
  });
  it('disabled age 55 is $10,000', () => {
    expect(earnedIncomeRelief({ age: 55, disabled: true, earnedIncome: 100000 })).toBe(10000);
  });
  it('disabled age 59 is $10,000', () => {
    expect(earnedIncomeRelief({ age: 59, disabled: true, earnedIncome: 100000 })).toBe(10000);
  });
  it('disabled age 60 is $12,000', () => {
    expect(earnedIncomeRelief({ age: 60, disabled: true, earnedIncome: 100000 })).toBe(12000);
  });
  it('is capped at earned income when earned income is smaller than the tier', () => {
    expect(earnedIncomeRelief({ age: 40, disabled: false, earnedIncome: 600 })).toBe(600);
  });
  it('for a 55–59 filer earning $7,000 the tier (6,000) is the binding figure', () => {
    expect(earnedIncomeRelief({ age: 57, disabled: false, earnedIncome: 7000 })).toBe(6000);
  });
  it('is zero for zero earned income', () => {
    expect(earnedIncomeRelief({ age: 40, disabled: false, earnedIncome: 0 })).toBe(0);
  });
  it('is never negative for negative earned income', () => {
    expect(earnedIncomeRelief({ age: 40, disabled: false, earnedIncome: -500 })).toBe(0);
  });
});

describe('§2.2 CPF relief and wage ceilings', () => {
  it('sums compulsory employee CPF and voluntary MediSave', () => {
    expect(cpfRelief({ employeeCompulsoryCpf: 20000, voluntaryMedisave: 8000 })).toBe(28000);
  });
  it('counts compulsory CPF alone when no voluntary MediSave is given', () => {
    expect(cpfRelief({ employeeCompulsoryCpf: 20000 })).toBe(20000);
  });
  it('is NOT hard-clamped at the age ≤55 practical max of 20,400', () => {
    expect(cpfRelief({ employeeCompulsoryCpf: 30000 })).toBe(30000);
  });
  it('practical max reference constant is 20,400 (20% × 102,000)', () => {
    expect(CPF_RELIEF_PRACTICAL_MAX_AGE_55_AND_BELOW).toBe(20400);
  });
  it('annual wage ceiling is 102,000', () => {
    expect(CPF_ANNUAL_WAGE_CEILING).toBe(102000);
  });
  it('monthly OW ceilings by income year are 6,800 / 7,400 / 8,000', () => {
    expect(OW_MONTHLY_CEILING).toEqual({ 2024: 6800, 2025: 7400, 2026: 8000 });
  });
});

describe('§2.3 CPF employee rates by age band', () => {
  it('2024: age 55 is still "55 and below" at 20%', () => {
    expect(cpfEmployeeRate(2024, 55)).toBe(0.2);
  });
  it('2024: age 56 is "above 55–60" at 16% (see FLAG in reliefs.ts)', () => {
    expect(cpfEmployeeRate(2024, 56)).toBe(0.16);
  });
  it('2024: age 60 is still "above 55–60" at 16%', () => {
    expect(cpfEmployeeRate(2024, 60)).toBe(0.16);
  });
  it('2024: age 61 is "above 60–65" at 10.5%', () => {
    expect(cpfEmployeeRate(2024, 61)).toBe(0.105);
  });
  it('2025: age 56 is "above 55–60" at 17%', () => {
    expect(cpfEmployeeRate(2025, 56)).toBe(0.17);
  });
  it('2025: age 61 is "above 60–65" at 11.5%', () => {
    expect(cpfEmployeeRate(2025, 61)).toBe(0.115);
  });
  it('2026: age 60 is "above 55–60" at 18%', () => {
    expect(cpfEmployeeRate(2026, 60)).toBe(0.18);
  });
  it('2026: age 61 is "above 60–65" at 12.5%', () => {
    expect(cpfEmployeeRate(2026, 61)).toBe(0.125);
  });
  it('age 66 is "above 65–70" at 7.5% in all years', () => {
    expect(cpfEmployeeRate(2024, 66)).toBe(0.075);
    expect(cpfEmployeeRate(2025, 66)).toBe(0.075);
    expect(cpfEmployeeRate(2026, 66)).toBe(0.075);
  });
  it('age 71 is "above 70" at 5% in all years', () => {
    expect(cpfEmployeeRate(2024, 71)).toBe(0.05);
    expect(cpfEmployeeRate(2025, 71)).toBe(0.05);
    expect(cpfEmployeeRate(2026, 71)).toBe(0.05);
  });
});

describe('§2.4 NSman relief', () => {
  it('self general, no activity: 1,500', () => {
    expect(nsmanSelfRelief({ keyAppointment: false, performedActivityInWorkYear: false })).toBe(1500);
  });
  it('self general, with activity: 3,000', () => {
    expect(nsmanSelfRelief({ keyAppointment: false, performedActivityInWorkYear: true })).toBe(3000);
  });
  it('self key appointment, no activity: 3,500', () => {
    expect(nsmanSelfRelief({ keyAppointment: true, performedActivityInWorkYear: false })).toBe(3500);
  });
  it('self key appointment, with activity: 5,000', () => {
    expect(nsmanSelfRelief({ keyAppointment: true, performedActivityInWorkYear: true })).toBe(5000);
  });
  it('wife relief is 750 when eligible and 0 when not', () => {
    expect(nsmanWifeRelief(true)).toBe(750);
    expect(nsmanWifeRelief(false)).toBe(0);
  });
  it('parent relief is 750 per parent', () => {
    expect(nsmanParentRelief(1)).toBe(750);
  });
  it('parent relief for two parents is 1,500', () => {
    expect(nsmanParentRelief(2)).toBe(1500);
  });
  it('parent relief count is clamped at two parents', () => {
    expect(nsmanParentRelief(3)).toBe(1500);
  });
  it('father-NSman takes Self over Parent when Self is higher', () => {
    expect(resolveNsmanSelfVsParent(3000, 1500)).toEqual({ nsmanSelf: 3000, nsmanParent: 0 });
  });
  it('father-NSman takes Parent when Parent is higher', () => {
    expect(resolveNsmanSelfVsParent(0, 1500)).toEqual({ nsmanSelf: 0, nsmanParent: 1500 });
  });
  it('father-NSman tie goes to Self, never both', () => {
    expect(resolveNsmanSelfVsParent(1500, 1500)).toEqual({ nsmanSelf: 1500, nsmanParent: 0 });
  });
});

describe('§2.5 Parent relief', () => {
  const stays = { livesWithClaimant: true, disabled: false, annualIncome: 0 };
  const notStays = { livesWithClaimant: false, disabled: false, annualIncome: 0 };

  it('constants match the research', () => {
    expect(PARENT_RELIEF).toEqual({
      staysWith: 9000,
      staysWithDisability: 14000,
      notStaysWith: 5500,
      notStaysWithDisability: 10000,
    });
  });
  it('stays with dependant: 9,000', () => {
    expect(parentRelief([stays])).toBe(9000);
  });
  it('stays with disabled dependant: 14,000', () => {
    expect(parentRelief([{ ...stays, disabled: true }])).toBe(14000);
  });
  it('does not stay with dependant: 5,500', () => {
    expect(parentRelief([notStays])).toBe(5500);
  });
  it('does not stay with disabled dependant: 10,000', () => {
    expect(parentRelief([{ ...notStays, disabled: true }])).toBe(10000);
  });
  it('income exactly $8,000 still qualifies (threshold inclusive)', () => {
    expect(parentRelief([{ ...stays, annualIncome: 8000 }])).toBe(9000);
  });
  it('income of $8,001 disqualifies a non-disabled dependant', () => {
    expect(parentRelief([{ ...stays, annualIncome: 8001 }])).toBe(0);
  });
  it('income test is waived for a disabled dependant', () => {
    expect(parentRelief([{ ...stays, disabled: true, annualIncome: 20000 }])).toBe(14000);
  });
  it('sums at most two dependants (3 eligible → 2 counted)', () => {
    expect(parentRelief([stays, stays, notStays])).toBe(18000);
  });
  it('an ineligible dependant does not use up a dependant slot', () => {
    expect(
      parentRelief([{ ...stays, annualIncome: 9000 }, stays, notStays]),
    ).toBe(9000 + 5500);
  });
  it('apportionment share scales the amount (0.5 share of 9,000 = 4,500)', () => {
    expect(parentRelief([{ ...stays, share: 0.5 }])).toBe(4500);
  });
  it('apportionment share is clamped to 0–1', () => {
    expect(parentRelief([{ ...stays, share: 2 }])).toBe(9000);
    expect(parentRelief([{ ...stays, share: -1 }])).toBe(0);
  });
});

describe('§2.6 Spouse relief', () => {
  it('constants match the research', () => {
    expect(SPOUSE_RELIEF).toEqual({ normal: 2000, disability: 5500 });
  });
  it('living with a spouse earning $0: 2,000', () => {
    expect(
      spouseRelief({ ya: 2026, spouseDisabled: false, spouseAnnualIncome: 0, legallySeparated: false }),
    ).toBe(2000);
  });
  it('spouse income exactly $8,000 still qualifies', () => {
    expect(
      spouseRelief({ ya: 2026, spouseDisabled: false, spouseAnnualIncome: 8000, legallySeparated: false }),
    ).toBe(2000);
  });
  it('spouse income of $8,001 disqualifies', () => {
    expect(
      spouseRelief({ ya: 2026, spouseDisabled: false, spouseAnnualIncome: 8001, legallySeparated: false }),
    ).toBe(0);
  });
  it('disabled spouse: 5,500, income test waived', () => {
    expect(
      spouseRelief({ ya: 2026, spouseDisabled: true, spouseAnnualIncome: 20000, legallySeparated: false }),
    ).toBe(5500);
  });
  it('separated, YA2025, wife pays → 0 (only husbands qualify in YA2025)', () => {
    expect(
      spouseRelief({
        ya: 2025,
        spouseDisabled: false,
        spouseAnnualIncome: 0,
        legallySeparated: true,
        maintenancePaid: 3000,
        payerIsHusband: false,
      }),
    ).toBe(0);
  });
  it('separated, YA2026, wife pays 3,000 → min(3000, 2000) = 2,000', () => {
    expect(
      spouseRelief({
        ya: 2026,
        spouseDisabled: false,
        spouseAnnualIncome: 0,
        legallySeparated: true,
        maintenancePaid: 3000,
        payerIsHusband: false,
      }),
    ).toBe(2000);
  });
  it('separated, YA2026, wife pays 1,200 → 1,200 (maintenance is the lower)', () => {
    expect(
      spouseRelief({
        ya: 2026,
        spouseDisabled: false,
        spouseAnnualIncome: 0,
        legallySeparated: true,
        maintenancePaid: 1200,
        payerIsHusband: false,
      }),
    ).toBe(1200);
  });
  it('separated, YA2025, husband pays 3,000 → 2,000', () => {
    expect(
      spouseRelief({
        ya: 2025,
        spouseDisabled: false,
        spouseAnnualIncome: 0,
        legallySeparated: true,
        maintenancePaid: 3000,
        payerIsHusband: true,
      }),
    ).toBe(2000);
  });
  it('separated, disabled spouse, maintenance 6,000 → min(6000, 5500) = 5,500', () => {
    expect(
      spouseRelief({
        ya: 2026,
        spouseDisabled: true,
        spouseAnnualIncome: 0,
        legallySeparated: true,
        maintenancePaid: 6000,
        payerIsHusband: false,
      }),
    ).toBe(5500);
  });
  it('separated, spouse income above $8,000 (not disabled) → 0', () => {
    expect(
      spouseRelief({
        ya: 2026,
        spouseDisabled: false,
        spouseAnnualIncome: 9000,
        legallySeparated: true,
        maintenancePaid: 3000,
        payerIsHusband: false,
      }),
    ).toBe(0);
  });
});

describe('§2.7 Child reliefs', () => {
  it('one non-disabled child is QCR 4,000', () => {
    expect(qualifyingChildRelief([{ disabled: false }])).toEqual({ qcr: 4000, hcr: 0 });
  });
  it('one disabled child is HCR 7,500', () => {
    expect(qualifyingChildRelief([{ disabled: true }])).toEqual({ qcr: 0, hcr: 7500 });
  });
  it('mixed children split into qcr and hcr', () => {
    expect(
      qualifyingChildRelief([{ disabled: false }, { disabled: false }, { disabled: true }]),
    ).toEqual({ qcr: 8000, hcr: 7500 });
  });
  it('shared QCR (share 0.5) is half of 4,000', () => {
    expect(qualifyingChildRelief([{ disabled: false, shareOfClaim: 0.5 }])).toEqual({
      qcr: 2000,
      hcr: 0,
    });
  });

  it('research example: $320k mother, first child pre-2024, father claims QCR 4,000 → WMCR 46,000', () => {
    expect(
      workingMotherChildRelief({
        motherEarnedIncome: 320000,
        children: [{ bornOrAdoptedOn: '2023-05-01', qcrOrHcrClaimed: 4000 }],
      }),
    ).toBe(46000);
  });
  it('same example without QCR claimed → nominal 15% × 320,000 = 48,000', () => {
    expect(
      workingMotherChildRelief({
        motherEarnedIncome: 320000,
        children: [{ bornOrAdoptedOn: '2023-05-01', qcrOrHcrClaimed: 0 }],
      }),
    ).toBe(48000);
  });
  it('fixed 8,000 fits within the 10,000 room left after 40,000 QCR/HCR (first child)', () => {
    expect(
      workingMotherChildRelief({
        motherEarnedIncome: 100000,
        children: [
          { bornOrAdoptedOn: '2024-03-01', qcrOrHcrClaimed: 40000 },
        ],
      }),
    ).toBe(8000);
  });
  it('WMCR is limited to the balance when QCR/HCR leaves less than the fixed amount', () => {
    expect(
      workingMotherChildRelief({
        motherEarnedIncome: 100000,
        children: [{ bornOrAdoptedOn: '2024-03-01', qcrOrHcrClaimed: 45000 }],
      }),
    ).toBe(5000);
  });
  it('post-2024 fixed amounts: 8,000 / 10,000 / 12,000 / 12,000 for four children', () => {
    expect(
      workingMotherChildRelief({
        motherEarnedIncome: 100000,
        children: [
          { bornOrAdoptedOn: '2024-01-01', qcrOrHcrClaimed: 0 },
          { bornOrAdoptedOn: '2025-01-01', qcrOrHcrClaimed: 0 },
          { bornOrAdoptedOn: '2026-01-01', qcrOrHcrClaimed: 0 },
          { bornOrAdoptedOn: '2026-06-01', qcrOrHcrClaimed: 0 },
        ],
      }),
    ).toBe(42000);
  });
  it('mixed regimes: pre-2024 first child at 15% + post-2024 second child at fixed 10,000', () => {
    expect(
      workingMotherChildRelief({
        motherEarnedIncome: 100000,
        children: [
          { bornOrAdoptedOn: '2023-01-01', qcrOrHcrClaimed: 0 },
          { bornOrAdoptedOn: '2024-06-01', qcrOrHcrClaimed: 0 },
        ],
      }),
    ).toBe(25000);
  });
  it('pre-2024 child who became a Citizen on/after 2024-01-01 uses the fixed 8,000', () => {
    expect(
      workingMotherChildRelief({
        motherEarnedIncome: 100000,
        children: [
          { bornOrAdoptedOn: '2023-01-01', citizenshipOn: '2024-06-01', qcrOrHcrClaimed: 0 },
        ],
      }),
    ).toBe(8000);
  });
  it('children are ordered by birth date regardless of input order', () => {
    expect(
      workingMotherChildRelief({
        motherEarnedIncome: 100000,
        children: [
          { bornOrAdoptedOn: '2024-06-01', qcrOrHcrClaimed: 0 },
          { bornOrAdoptedOn: '2023-01-01', qcrOrHcrClaimed: 0 },
        ],
      }),
    ).toBe(25000);
  });
  it('total WMCR is capped at 100% of mother earned income (5 pre-2024 children = 110%)', () => {
    expect(
      workingMotherChildRelief({
        motherEarnedIncome: 10000,
        children: [
          { bornOrAdoptedOn: '2018-01-01', qcrOrHcrClaimed: 0 },
          { bornOrAdoptedOn: '2019-01-01', qcrOrHcrClaimed: 0 },
          { bornOrAdoptedOn: '2020-01-01', qcrOrHcrClaimed: 0 },
          { bornOrAdoptedOn: '2021-01-01', qcrOrHcrClaimed: 0 },
          { bornOrAdoptedOn: '2022-01-01', qcrOrHcrClaimed: 0 },
        ],
      }),
    ).toBe(10000);
  });
  it('zero earned income gives zero WMCR', () => {
    expect(
      workingMotherChildRelief({
        motherEarnedIncome: 0,
        children: [{ bornOrAdoptedOn: '2023-05-01', qcrOrHcrClaimed: 0 }],
      }),
    ).toBe(0);
  });
  it('no children gives zero WMCR', () => {
    expect(workingMotherChildRelief({ motherEarnedIncome: 100000, children: [] })).toBe(0);
  });
});

describe('§2.8 CPF cash top-up relief', () => {
  it('self 10,000 and family 10,000 → 8,000 + 8,000 = 16,000', () => {
    expect(cpfCashTopUpRelief({ selfTopUp: 10000, familyTopUp: 10000 })).toBe(16000);
  });
  it('self below cap uses actual amount (3,000)', () => {
    expect(cpfCashTopUpRelief({ selfTopUp: 3000, familyTopUp: 0 })).toBe(3000);
  });
  it('self capped at 8,000 and family 5,000 → 13,000', () => {
    expect(cpfCashTopUpRelief({ selfTopUp: 20000, familyTopUp: 5000 })).toBe(13000);
  });
  it('total cap constant is 16,000', () => {
    expect(CPF_TOPUP_TOTAL_CAP).toBe(16000);
  });
  it('FRS/BHS reference constants: YA2026 213,000 / 75,500; YA2027 220,400 / 79,000', () => {
    expect(CPF_FRS_BHS_REFERENCE).toEqual({
      2026: { frs: 213000, bhs: 75500 },
      2027: { frs: 220400, bhs: 79000 },
    });
  });
});

describe('§2.9 SRS relief', () => {
  it('SRS caps are 15,300 for citizen/PR and 35,700 for foreigner', () => {
    expect(SRS_CAP).toEqual({ citizenOrPr: 15300, foreigner: 35700 });
  });
  it('citizen contribution of 20,000 is capped at 15,300', () => {
    expect(srsRelief({ contribution: 20000, status: 'citizenOrPr' })).toBe(15300);
  });
  it('citizen contribution of 10,000 is 10,000', () => {
    expect(srsRelief({ contribution: 10000, status: 'citizenOrPr' })).toBe(10000);
  });
  it('foreigner contribution of 40,000 is capped at 35,700', () => {
    expect(srsRelief({ contribution: 40000, status: 'foreigner' })).toBe(35700);
  });
  it('foreigner contribution of 20,000 is 20,000', () => {
    expect(srsRelief({ contribution: 20000, status: 'foreigner' })).toBe(20000);
  });
});

describe('§2.10 Life insurance relief', () => {
  const base = {
    ya: 2026 as const,
    employeeCompulsoryCpfAndSepMediSave: 0,
    insuredValue: 100000,
    premiumsPaid: 10000,
    claimantIsWife: false,
    policyInsuresSpouse: false,
  };

  it('CPF of exactly 5,000 gives nil relief', () => {
    expect(lifeInsuranceRelief({ ...base, employeeCompulsoryCpfAndSepMediSave: 5000 })).toBe(0);
  });
  it('CPF of 6,000 gives nil relief', () => {
    expect(lifeInsuranceRelief({ ...base, employeeCompulsoryCpfAndSepMediSave: 6000 })).toBe(0);
  });
  it('three-way min: premiums (3,000) is the lowest of 5,000 / 7,000 / 3,000', () => {
    expect(lifeInsuranceRelief({ ...base, premiumsPaid: 3000 })).toBe(3000);
  });
  it('three-way min: CPF room (5,000) is the lowest of 5,000 / 7,000 / 10,000', () => {
    expect(lifeInsuranceRelief(base)).toBe(5000);
  });
  it('three-way min: 7% of insured value (3,500) is the lowest of 5,000 / 3,500 / 10,000', () => {
    expect(lifeInsuranceRelief({ ...base, insuredValue: 50000 })).toBe(3500);
  });
  it('CPF room is 5,000 minus CPF: CPF 2,000 leaves 3,000', () => {
    expect(
      lifeInsuranceRelief({ ...base, employeeCompulsoryCpfAndSepMediSave: 2000 }),
    ).toBe(3000);
  });
  it('own policy in YA2025 is eligible', () => {
    expect(lifeInsuranceRelief({ ...base, ya: 2025, premiumsPaid: 3000 })).toBe(3000);
  });
  it('husband paying on wife\'s policy in YA2025 is eligible', () => {
    expect(
      lifeInsuranceRelief({ ...base, ya: 2025, premiumsPaid: 3000, policyInsuresSpouse: true }),
    ).toBe(3000);
  });
  it('wife paying on husband\'s policy in YA2025 → 0', () => {
    expect(
      lifeInsuranceRelief({
        ...base,
        ya: 2025,
        claimantIsWife: true,
        policyInsuresSpouse: true,
        premiumsPaid: 3000,
      }),
    ).toBe(0);
  });
  it('wife paying on husband\'s policy in YA2026 is eligible', () => {
    expect(
      lifeInsuranceRelief({
        ...base,
        ya: 2026,
        claimantIsWife: true,
        policyInsuresSpouse: true,
        premiumsPaid: 3000,
      }),
    ).toBe(3000);
  });
});

describe('§2.11 Course fees relief', () => {
  it('YA2025 fees of 8,000 are capped at 5,500', () => {
    expect(courseFeesRelief({ fees: 8000, ya: 2025 })).toBe(5500);
  });
  it('YA2025 fees of 3,000 are 3,000', () => {
    expect(courseFeesRelief({ fees: 3000, ya: 2025 })).toBe(3000);
  });
  it('YA2026 gives 0 even with fees of 8,000', () => {
    expect(courseFeesRelief({ fees: 8000, ya: 2026 })).toBe(0);
  });
  it('cap constant is 5,500', () => {
    expect(COURSE_FEES_CAP).toBe(5500);
  });
});

describe('§3 Catalogue, availability and relief lines', () => {
  it('personal relief cap is 80,000', () => {
    expect(PERSONAL_RELIEF_CAP).toBe(80000);
  });

  it('catalogue contains no FDWL relief id (lapsed from YA2025)', () => {
    const fdwlLike = RELIEF_IDS.filter((id) => /fdwl|foreign.?domestic/i.test(id));
    expect(fdwlLike).toEqual([]);
  });

  it('RELIEF_ORDER is the canonical stacking order (voluntary top-ups last)', () => {
    expect([...RELIEF_ORDER]).toEqual([
      'earnedIncome',
      'cpf',
      'lifeInsurance',
      'nsmanSelf',
      'nsmanWife',
      'nsmanParent',
      'spouse',
      'parent',
      'qcr',
      'hcr',
      'wmcr',
      'courseFees',
      'cpfCashTopUp',
      'srs',
    ]);
  });

  it('RELIEF_ORDER contains exactly the RELIEF_IDS set, once each', () => {
    expect(new Set(RELIEF_ORDER)).toEqual(new Set(RELIEF_IDS));
    expect(RELIEF_ORDER.length).toBe(RELIEF_IDS.length);
  });

  it('courseFees is available only for YA2025', () => {
    expect(isReliefAvailable('courseFees', 2025)).toBe(true);
    expect(isReliefAvailable('courseFees', 2026)).toBe(false);
  });

  it('every other relief is available in YA2026', () => {
    const others = RELIEF_IDS.filter((id) => id !== 'courseFees');
    for (const id of others) {
      expect(isReliefAvailable(id, 2026)).toBe(true);
    }
  });

  it('toReliefLines drops courseFees for YA2026', () => {
    expect(
      toReliefLines({ courseFees: 5500, earnedIncome: 1000, srs: 15300 }, 2026),
    ).toEqual([
      { id: 'earnedIncome', amount: 1000 },
      { id: 'srs', amount: 15300 },
    ]);
  });

  it('toReliefLines keeps courseFees for YA2025 and emits lines in RELIEF_ORDER', () => {
    const lines = toReliefLines(
      { srs: 15300, courseFees: 5500, cpf: 20000, earnedIncome: 1000 },
      2025,
    );
    expect(lines.map((l) => l.id)).toEqual(['earnedIncome', 'cpf', 'courseFees', 'srs']);
  });

  it('toReliefLines drops zero, negative and missing amounts', () => {
    const lines = toReliefLines({ earnedIncome: 0, cpf: 100, srs: -5 }, 2026);
    expect(lines).toEqual([{ id: 'cpf', amount: 100 }]);
  });

  it('toReliefLines returns empty array for empty input', () => {
    expect(toReliefLines({}, 2026)).toEqual([]);
  });

  it('toReliefLines does not apply the $80,000 cap', () => {
    const lines = toReliefLines({ cpf: 90000 }, 2026);
    expect(lines).toEqual([{ id: 'cpf', amount: 90000 }]);
  });
});
