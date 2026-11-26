/**
 * Singapore resident personal income tax relief catalogue.
 *
 * Source of truth: /opt/data/projects/_research/sg-tax-2025.md §2 (2.1–2.12) and §3.
 * All amounts are SGD per person per Year of Assessment (YA), resident only.
 * Pure TypeScript, no dependencies.
 *
 * Calculators return the relief allowable for ONE relief, capped per that
 * relief's own rules, and never negative. The $80,000 total cap (§3) is NOT
 * applied here — the engine applies it to the summed stack.
 */

import type { YA } from './bands';
export type { YA } from './bands';

export { PERSONAL_RELIEF_CAP } from './engine';

// ---------------------------------------------------------------------------
// Relief identifiers
// ---------------------------------------------------------------------------

/**
 * Every personal relief in the catalogue.
 *
 * FDWL (Foreign Domestic Worker Levy) relief is deliberately EXCLUDED: it
 * lapsed from YA2025 (research §2.12; final claim year YA2024), so it does not
 * exist in either target YA. Do not re-add it.
 */
export const RELIEF_IDS = [
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
] as const;

export type ReliefId = (typeof RELIEF_IDS)[number];

/**
 * Canonical stacking order used to attribute per-relief tax savings.
 *
 * PRODUCT DECISION (not an IRAS rule): reliefs are stacked from the top of the
 * income downward in this order, so each relief's saving is the tax on the
 * slice of income it removes. Mandatory/automatic reliefs come first, then
 * claim-based reliefs, then voluntary top-ups last. The savings attributed to
 * voluntary actions (CPF cash top-ups, SRS) are therefore the conservative
 * bottom slice of the income stack.
 */
export const RELIEF_ORDER: readonly ReliefId[] = RELIEF_IDS;

/**
 * Whether a relief can be claimed for a given YA.
 * Course Fees Relief is YA2025 only (§2.11; discontinued from YA2026).
 */
export function isReliefAvailable(id: ReliefId, ya: YA): boolean {
  if (id === 'courseFees') return ya === 2025;
  return true;
}

/** Non-zero relief line for a single relief, as consumed by the engine. */
export interface ReliefLine {
  id: ReliefId;
  amount: number;
}

/**
 * Builds the relief lines for a YA, in RELIEF_ORDER. Drops reliefs that are
 * zero, non-positive, non-finite-or-missing (`!(amount > 0)`), or not available
 * in `ya`. Does NOT apply the $80,000 cap.
 */
export function toReliefLines(
  amounts: Partial<Record<ReliefId, number>>,
  ya: YA,
): ReliefLine[] {
  const lines: ReliefLine[] = [];
  for (const id of RELIEF_ORDER) {
    const amount = amounts[id];
    if (amount === undefined || !(amount > 0)) continue;
    if (!isReliefAvailable(id, ya)) continue;
    lines.push({ id, amount });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// §2.1 Earned Income Relief
// Age is as at 31 Dec of the PRECEDING year — the caller supplies that age.
// ---------------------------------------------------------------------------

export const EARNED_INCOME_RELIEF = {
  under55: { normal: 1000, disability: 4000 },
  age55To59: { normal: 6000, disability: 10000 },
  age60AndAbove: { normal: 8000, disability: 12000 },
} as const;

export function earnedIncomeRelief(input: {
  age: number;
  disabled: boolean;
  earnedIncome: number;
}): number {
  const tier =
    input.age >= 60
      ? EARNED_INCOME_RELIEF.age60AndAbove
      : input.age >= 55
        ? EARNED_INCOME_RELIEF.age55To59
        : EARNED_INCOME_RELIEF.under55;
  const tierAmount = input.disabled ? tier.disability : tier.normal;
  // Relief can never exceed taxable earned income.
  return Math.max(0, Math.min(tierAmount, input.earnedIncome));
}

// ---------------------------------------------------------------------------
// §2.2 / §2.3 CPF relief and contribution rates
// ---------------------------------------------------------------------------

export const CPF_ANNUAL_WAGE_CEILING = 102000;

/** Income year (calendar year of employment) — YA = income year + 1. */
export type IncomeYear = 2024 | 2025 | 2026;

/** Monthly Ordinary Wage ceiling by income year (§2.2). */
export const OW_MONTHLY_CEILING: Record<IncomeYear, number> = {
  2024: 6800,
  2025: 7400,
  2026: 8000,
};

/**
 * Practical maximum CPF relief for age 55 and below: 20% × $102,000.
 * This is a DERIVED reference figure only. cpfRelief() does NOT clamp to it,
 * because older employees have different employee rates and voluntary
 * MediSave can be added on top.
 */
export const CPF_RELIEF_PRACTICAL_MAX_AGE_55_AND_BELOW = 20400;

export type CpfAgeBand =
  | 'upTo55'
  | 'above55To60'
  | 'above60To65'
  | 'above65To70'
  | 'above70';

export interface CpfRateRow {
  employer: number;
  employee: number;
  total: number;
}

/**
 * CPF contribution rates for Singapore Citizens / PRs, monthly wages > $750,
 * 3rd year onwards (§2.3). Fractions, not percentages.
 */
export const CPF_CONTRIBUTION_RATES: Record<
  IncomeYear,
  Record<CpfAgeBand, CpfRateRow>
> = {
  2024: {
    upTo55: { employer: 0.17, employee: 0.2, total: 0.37 },
    // FLAG: research §6 item 2 — 2024 above-55-to-60 employee rate (16%) was
    // read from a partially elided CPF PDF table; total 31% is confirmed by
    // CPF's own comparison. Secondary-verified only. Matters for YA2025 CPF
    // relief of users aged 56–60.
    above55To60: { employer: 0.15, employee: 0.16, total: 0.31 },
    above60To65: { employer: 0.115, employee: 0.105, total: 0.22 },
    above65To70: { employer: 0.09, employee: 0.075, total: 0.165 },
    above70: { employer: 0.075, employee: 0.05, total: 0.125 },
  },
  2025: {
    upTo55: { employer: 0.17, employee: 0.2, total: 0.37 },
    above55To60: { employer: 0.155, employee: 0.17, total: 0.325 },
    above60To65: { employer: 0.12, employee: 0.115, total: 0.235 },
    above65To70: { employer: 0.09, employee: 0.075, total: 0.165 },
    above70: { employer: 0.075, employee: 0.05, total: 0.125 },
  },
  // Income year 2026 (→ YA2027). Included for forward compatibility.
  2026: {
    upTo55: { employer: 0.17, employee: 0.2, total: 0.37 },
    above55To60: { employer: 0.16, employee: 0.18, total: 0.34 },
    above60To65: { employer: 0.125, employee: 0.125, total: 0.25 },
    above65To70: { employer: 0.09, employee: 0.075, total: 0.165 },
    above70: { employer: 0.075, employee: 0.05, total: 0.125 },
  },
};

/** Maps an age to its CPF rate band. Age 55 is "55 and below"; 56 is "above 55". */
export function cpfAgeBand(age: number): CpfAgeBand {
  if (age <= 55) return 'upTo55';
  if (age <= 60) return 'above55To60';
  if (age <= 65) return 'above60To65';
  if (age <= 70) return 'above65To70';
  return 'above70';
}

/** Employee CPF rate (fraction) for an income year and age. */
export function cpfEmployeeRate(incomeYear: IncomeYear, age: number): number {
  return CPF_CONTRIBUTION_RATES[incomeYear][cpfAgeBand(age)].employee;
}

/**
 * CPF relief = compulsory employee CPF on OW + AW, plus voluntary MediSave.
 * Inputs are taken from the user's statement; negative inputs count as zero.
 */
export function cpfRelief(input: {
  employeeCompulsoryCpf: number;
  voluntaryMedisave?: number;
}): number {
  return (
    Math.max(0, input.employeeCompulsoryCpf) +
    Math.max(0, input.voluntaryMedisave ?? 0)
  );
}

// ---------------------------------------------------------------------------
// §2.4 NSman relief (Self / Wife / Parent)
// ---------------------------------------------------------------------------

export const NSMAN_SELF_RELIEF = {
  general: { noActivity: 1500, activity: 3000 },
  keyAppointment: { noActivity: 3500, activity: 5000 },
} as const;

export const NSMAN_WIFE_RELIEF = 750;
export const NSMAN_PARENT_RELIEF_PER_PARENT = 750;

/** NSman Self relief. `performedActivityInWorkYear` refers to the prior work year (1 Apr–31 Mar). */
export function nsmanSelfRelief(input: {
  keyAppointment: boolean;
  performedActivityInWorkYear: boolean;
}): number {
  const table = input.keyAppointment
    ? NSMAN_SELF_RELIEF.keyAppointment
    : NSMAN_SELF_RELIEF.general;
  return input.performedActivityInWorkYear ? table.activity : table.noActivity;
}

/** NSman Wife relief: $750 if the claimant's husband is eligible for NSman Self relief. */
export function nsmanWifeRelief(eligible: boolean): number {
  return eligible ? NSMAN_WIFE_RELIEF : 0;
}

/**
 * NSman Parent relief: $750 per parent, regardless of how many NSmen sons.
 * A claimant has at most two parents, so the count is clamped to 0–2.
 */
export function nsmanParentRelief(parentsClaimed: number): number {
  const count = Math.min(2, Math.max(0, Math.floor(parentsClaimed)));
  return count * NSMAN_PARENT_RELIEF_PER_PARENT;
}

/**
 * A father who is himself an NSman takes whichever of Self or Parent relief is
 * higher, never both (§2.4). Ties go to Self.
 */
export function resolveNsmanSelfVsParent(
  selfAmount: number,
  parentAmount: number,
): { nsmanSelf: number; nsmanParent: number } {
  if (selfAmount >= parentAmount) {
    return { nsmanSelf: selfAmount, nsmanParent: 0 };
  }
  return { nsmanSelf: 0, nsmanParent: parentAmount };
}

// ---------------------------------------------------------------------------
// §2.5 Parent relief / Parent relief (Disability)
// ---------------------------------------------------------------------------

export const PARENT_RELIEF = {
  staysWith: 9000,
  staysWithDisability: 14000,
  notStaysWith: 5500,
  notStaysWithDisability: 10000,
} as const;

export const PARENT_MAX_DEPENDANTS = 2;
export const DEPENDANT_INCOME_THRESHOLD = 8000;

export interface ParentDependant {
  /** true = taxpayer stays with the dependant (or supports a separate household ≥ $2,000; caller decides). */
  livesWithClaimant: boolean;
  disabled: boolean;
  /** Dependant's annual income. Income test does not apply to disabled dependants. */
  annualIncome: number;
  /** Agreed apportionment share, 0–1. Default 1. */
  share?: number;
}

/**
 * Sums Parent relief across dependants.
 *
 * - Ineligible dependants (non-disabled with income above $8,000) are skipped
 *   and do not use up one of the two dependant slots.
 * - At most PARENT_MAX_DEPENDANTS eligible dependants are counted, in the order
 *   given. FLAG: the caller should order dependants by the claimant's preference
 *   if more than two are eligible; this function does not choose the best two.
 * - Age (≥55) and support tests are the caller's responsibility.
 */
export function parentRelief(dependants: readonly ParentDependant[]): number {
  let total = 0;
  let counted = 0;
  for (const dependant of dependants) {
    if (counted >= PARENT_MAX_DEPENDANTS) break;
    if (!dependant.disabled && dependant.annualIncome > DEPENDANT_INCOME_THRESHOLD) {
      continue;
    }
    counted += 1;
    const base = dependant.livesWithClaimant
      ? dependant.disabled
        ? PARENT_RELIEF.staysWithDisability
        : PARENT_RELIEF.staysWith
      : dependant.disabled
        ? PARENT_RELIEF.notStaysWithDisability
        : PARENT_RELIEF.notStaysWith;
    const share = Math.min(1, Math.max(0, dependant.share ?? 1));
    total += base * share;
  }
  return total;
}

// ---------------------------------------------------------------------------
// §2.6 Spouse relief / Spouse relief (Disability)
// ---------------------------------------------------------------------------

export const SPOUSE_RELIEF = {
  normal: 2000,
  disability: 5500,
} as const;

export const SPOUSE_INCOME_THRESHOLD = 8000;

export interface SpouseReliefInput {
  ya: YA;
  spouseDisabled: boolean;
  spouseAnnualIncome: number;
  /** true = legally separated (Court Order / Deed of Separation). */
  legallySeparated: boolean;
  /** Maintenance paid in the prior year. Used only when legallySeparated. */
  maintenancePaid?: number;
  /** true if the payer of the maintenance is the husband. Used only when legallySeparated. */
  payerIsHusband?: boolean;
}

/**
 * Spouse relief for one claimant.
 *
 * - Living with spouse: $2,000, or $5,500 if the spouse is disabled.
 * - Legally separated: min(maintenance paid, cap). Qualifies only if the payer
 *   is the husband for YA2025; from YA2026 a wife paying a husband also qualifies.
 * - The $8,000 spouse-income test applies to both paths and is waived for a
 *   disabled spouse. FLAG: research §2.6 states the income test as a general
 *   condition; it is applied to the separated path too.
 * - Alimony to a divorced former spouse does not qualify (not modelled; caller
 *   must not pass it as a separated maintenance claim).
 */
export function spouseRelief(input: SpouseReliefInput): number {
  const cap = input.spouseDisabled ? SPOUSE_RELIEF.disability : SPOUSE_RELIEF.normal;
  if (!input.spouseDisabled && input.spouseAnnualIncome > SPOUSE_INCOME_THRESHOLD) {
    return 0;
  }
  if (!input.legallySeparated) return cap;

  const maintenanceQualifies = input.ya === 2026 || input.payerIsHusband === true;
  if (!maintenanceQualifies) return 0;
  return Math.min(Math.max(0, input.maintenancePaid ?? 0), cap);
}

// ---------------------------------------------------------------------------
// §2.7 Child reliefs: QCR / HCR and WMCR
// ---------------------------------------------------------------------------

export const QCR_PER_CHILD = 4000;
export const HCR_PER_CHILD = 7500;

/** Combined QCR/HCR + WMCR cap per child (§2.7). */
export const CHILD_COMBINED_CAP = 50000;

/** Fixed WMCR amounts for children born/adopted on or after 2024-01-01: 1st, 2nd, 3rd+. */
export const WMCR_FIXED_AMOUNTS = [8000, 10000, 12000] as const;

/** Percentage of mother's earned income for children born before 2024-01-01: 1st, 2nd, 3rd+. */
export const WMCR_PERCENT_PRE_2024 = [15, 20, 25] as const;

/** Cutoff for the fixed-dollar WMCR regime (ISO date, YYYY-MM-DD). */
export const WMCR_FIXED_REGIME_CUTOFF = '2024-01-01';

export interface QualifyingChild {
  disabled: boolean;
  /** Share of this child's relief claimed by this claimant, 0–1. Default 1. */
  shareOfClaim?: number;
}

/**
 * QCR (4000) for a non-disabled child; HCR (7500) for a disabled child.
 * Income and age tests are the caller's responsibility.
 * Summed per relief id so the caller can place them in `qcr` / `hcr`.
 */
export function qualifyingChildRelief(children: readonly QualifyingChild[]): {
  qcr: number;
  hcr: number;
} {
  let qcr = 0;
  let hcr = 0;
  for (const child of children) {
    const share = Math.min(1, Math.max(0, child.shareOfClaim ?? 1));
    if (child.disabled) {
      hcr += HCR_PER_CHILD * share;
    } else {
      qcr += QCR_PER_CHILD * share;
    }
  }
  return { qcr, hcr };
}

export interface WmcrChild {
  /** Birth or adoption date, ISO YYYY-MM-DD. Also determines child order. */
  bornOrAdoptedOn: string;
  /**
   * Citizenship date, ISO YYYY-MM-DD, if the child became a Citizen after birth.
   * Per §2.7, a child born before 2024 who became a Citizen on/after 2024-01-01
   * uses the fixed-dollar regime.
   */
  citizenshipOn?: string;
  /** QCR/HCR already allocated to this child (by either parent). Reduces the per-child WMCR room. */
  qcrOrHcrClaimed: number;
}

export interface WmcrInput {
  motherEarnedIncome: number;
  /** All of the mother's children, in any order. They are sorted by birth/adoption date to establish child order. */
  children: readonly WmcrChild[];
}

/**
 * Working Mother's Child Relief.
 *
 * For each child, in birth order:
 *   - fixed regime (born/adopted, or Citizen, on/after 2024-01-01): 8000 / 10000 / 12000
 *   - percentage regime (pre-2024): 15% / 20% / 25% of mother's earned income
 *   - per-child room = 50000 − QCR/HCR already claimed for that child; WMCR is limited to it
 * Total is then capped at 100% of mother's earned income.
 *
 * Child order is inferred from the ISO dates; FLAG: adoptions are ordered by
 * adoption date, which may not match the order the family would list them.
 */
export function workingMotherChildRelief(input: WmcrInput): number {
  const earned = Math.max(0, input.motherEarnedIncome);
  const ordered = [...input.children].sort((a, b) =>
    a.bornOrAdoptedOn < b.bornOrAdoptedOn
      ? -1
      : a.bornOrAdoptedOn > b.bornOrAdoptedOn
        ? 1
        : 0,
  );

  let total = 0;
  ordered.forEach((child, index) => {
    const slot = Math.min(index, 2);
    const fixedRegime =
      child.bornOrAdoptedOn >= WMCR_FIXED_REGIME_CUTOFF ||
      (child.citizenshipOn !== undefined &&
        child.citizenshipOn >= WMCR_FIXED_REGIME_CUTOFF);
    const nominal = fixedRegime
      ? WMCR_FIXED_AMOUNTS[slot]
      : (WMCR_PERCENT_PRE_2024[slot] * earned) / 100;
    const roomForChild = Math.max(
      0,
      CHILD_COMBINED_CAP - Math.max(0, child.qcrOrHcrClaimed),
    );
    total += Math.min(nominal, roomForChild);
  });

  return Math.min(total, earned);
}

// ---------------------------------------------------------------------------
// §2.8 CPF Cash Top-up Relief
// ---------------------------------------------------------------------------

export const CPF_TOPUP_SELF_CAP = 8000;
export const CPF_TOPUP_FAMILY_CAP = 8000;
export const CPF_TOPUP_TOTAL_CAP = 16000;

/**
 * FRS / BHS reference balances (§2.8). Reference constants only: not used by
 * the relief calculator. Keyed by the YA the relief is claimed in.
 */
export const CPF_FRS_BHS_REFERENCE: Record<
  2026 | 2027,
  { frs: number; bhs: number }
> = {
  2026: { frs: 213000, bhs: 75500 },
  2027: { frs: 220400, bhs: 79000 },
};

/**
 * CPF cash top-up relief.
 * FLAG: research §2.8 gives a $8,000 family bucket ("$8,000 for family members")
 * and a per-recipient rule. This implements the family bucket as ONE $8,000 cap
 * across all family recipients. Confirm against IRAS before relying on
 * per-recipient behaviour.
 * Eligibility (income tests, MRSS/MMSS exclusions) is the caller's responsibility.
 */
export function cpfCashTopUpRelief(input: {
  selfTopUp: number;
  familyTopUp: number;
}): number {
  const self = Math.min(Math.max(0, input.selfTopUp), CPF_TOPUP_SELF_CAP);
  const family = Math.min(Math.max(0, input.familyTopUp), CPF_TOPUP_FAMILY_CAP);
  return Math.min(self + family, CPF_TOPUP_TOTAL_CAP);
}

// ---------------------------------------------------------------------------
// §2.9 SRS relief
// ---------------------------------------------------------------------------

export const SRS_CAP = {
  citizenOrPr: 15300,
  foreigner: 35700,
} as const;

/** Relief = min(contribution made in the prior year, annual cap). */
export function srsRelief(input: {
  contribution: number;
  status: 'citizenOrPr' | 'foreigner';
}): number {
  const cap = SRS_CAP[input.status];
  return Math.min(Math.max(0, input.contribution), cap);
}

// ---------------------------------------------------------------------------
// §2.10 Life insurance relief
// ---------------------------------------------------------------------------

export const LIFE_INSURANCE_CPF_NIL_THRESHOLD = 5000;
export const LIFE_INSURANCE_RATE_PERCENT = 7;

export interface LifeInsuranceInput {
  ya: YA;
  /** Compulsory employee CPF + SEP MediSave contributions, prior year. */
  employeeCompulsoryCpfAndSepMediSave: number;
  /** Sum insured of the policy. */
  insuredValue: number;
  /** Premiums paid by the claimant in the prior year. */
  premiumsPaid: number;
  claimantIsWife: boolean;
  /** true if the policy insures the claimant's spouse (husband, for a wife claimant). */
  policyInsuresSpouse: boolean;
}

/**
 * Life insurance relief.
 *
 * - Nil if employee CPF + SEP MediSave ≥ $5,000.
 * - Otherwise min(5000 − CPF, 7% of insured value, premiums paid), floored at 0.
 * - Eligible policies: own, or wife's policy paid by husband (all YAs). A wife
 *   paying premiums on her husband's policy qualifies from YA2026 only.
 *
 * 7% is computed as value × 7 / 100 to avoid float drift.
 */
export function lifeInsuranceRelief(input: LifeInsuranceInput): number {
  const wifePayingOnHusbandPolicy = input.claimantIsWife && input.policyInsuresSpouse;
  if (wifePayingOnHusbandPolicy && input.ya === 2025) return 0;

  const cpf = Math.max(0, input.employeeCompulsoryCpfAndSepMediSave);
  if (cpf >= LIFE_INSURANCE_CPF_NIL_THRESHOLD) return 0;

  const sevenPercent = (Math.max(0, input.insuredValue) * LIFE_INSURANCE_RATE_PERCENT) / 100;
  return Math.max(
    0,
    Math.min(
      LIFE_INSURANCE_CPF_NIL_THRESHOLD - cpf,
      sevenPercent,
      Math.max(0, input.premiumsPaid),
    ),
  );
}

// ---------------------------------------------------------------------------
// §2.11 Course fees relief — YA2025 only
// ---------------------------------------------------------------------------

export const COURSE_FEES_CAP = 5500;

export function courseFeesRelief(input: { fees: number; ya: YA }): number {
  if (input.ya !== 2025) return 0;
  return Math.min(Math.max(0, input.fees), COURSE_FEES_CAP);
}

// §2.12 FDWL relief: intentionally NOT implemented. It lapsed from YA2025
// (final claim year YA2024). Do not add it back.
