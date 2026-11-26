/**
 * Relief catalogue metadata and per-relief caps for the UI.
 *
 * Every cap and rate here is composed from constants/functions that already
 * exist in bands.ts / engine.ts / reliefs.ts. The only new numbers are the two
 * named below. Pure TypeScript, no I/O.
 */

import type { YA } from './bands';
import {
  CPF_ANNUAL_WAGE_CEILING,
  OW_MONTHLY_CEILING,
  cpfEmployeeRate,
  earnedIncomeRelief,
  isReliefAvailable,
  LIFE_INSURANCE_CPF_NIL_THRESHOLD,
  NSMAN_PARENT_RELIEF_PER_PARENT,
  NSMAN_SELF_RELIEF,
  NSMAN_WIFE_RELIEF,
  PARENT_MAX_DEPENDANTS,
  PARENT_RELIEF,
  QCR_PER_CHILD,
  HCR_PER_CHILD,
  SPOUSE_RELIEF,
  SRS_CAP,
  WMCR_FIXED_AMOUNTS,
  COURSE_FEES_CAP,
  CPF_TOPUP_TOTAL_CAP,
  type IncomeYear,
  type ReliefId,
} from './reliefs';

/**
 * Maximum number of parents claimable for NSman (Parent) relief.
 * FACT-CHECK (Red): mirrors the clamp of 2 inside nsmanParentRelief() in
 * reliefs.ts. Confirm against IRAS before relying on it.
 */
export const NSMAN_PARENT_MAX_PARENTS = 2;

/**
 * Upper bound on the child / dependant counters the UI accepts.
 * This is an INPUT BOUND for the form, NOT a tax rule.
 */
export const UI_MAX_CHILDREN = 10;

export type Residency = 'citizenOrPr' | 'foreigner';

export interface ReliefContext {
  ya: YA;
  age: number;
  employmentIncome: number;
  bonus: number;
  residency: Residency;
  /** Amounts already claimed for other reliefs. Read by the lifeInsurance cap (claimed.cpf). */
  claimed: Partial<Record<ReliefId, number>>;
  /** Parents / children counts for unit-based reliefs. */
  units: Partial<Record<ReliefId, number>>;
}

export interface ReliefMeta {
  id: ReliefId;
  label: string;
  blurb: string;
  unitLabel?: string;
  maxUnits?: number;
  /** Every cap here is a maximum; the claimed amount may be lower. */
  capIsUpperBound: boolean;
  /** true when an amount of null means "use the computed suggestion". */
  autoSuggest: boolean;
}

export const RELIEF_CATALOGUE: Record<ReliefId, ReliefMeta> = {
  earnedIncome: {
    id: 'earnedIncome',
    label: 'Earned Income Relief',
    blurb: 'Automatic relief on earned income; the tier rises at 55 and 60.',
    capIsUpperBound: true,
    autoSuggest: true,
  },
  cpf: {
    id: 'cpf',
    label: 'CPF Relief',
    blurb: 'Your employee CPF contributions, plus any voluntary MediSave.',
    capIsUpperBound: true,
    autoSuggest: true,
  },
  lifeInsurance: {
    id: 'lifeInsurance',
    label: 'Life Insurance',
    blurb: 'Premiums on life policies; shrinks as your CPF + SEP MediSave rises.',
    capIsUpperBound: true,
    autoSuggest: false,
  },
  nsmanSelf: {
    id: 'nsmanSelf',
    label: 'NSman (Self)',
    blurb: 'Relief for your own reservist service.',
    capIsUpperBound: true,
    autoSuggest: false,
  },
  nsmanWife: {
    id: 'nsmanWife',
    label: 'NSman (Wife)',
    blurb: 'Relief when your husband is eligible for NSman Self relief.',
    capIsUpperBound: true,
    autoSuggest: false,
  },
  nsmanParent: {
    id: 'nsmanParent',
    label: 'NSman (Parent)',
    blurb: 'Per parent, when you have an NSman son.',
    unitLabel: 'parents',
    maxUnits: NSMAN_PARENT_MAX_PARENTS,
    capIsUpperBound: true,
    autoSuggest: false,
  },
  spouse: {
    id: 'spouse',
    label: 'Spouse Relief',
    blurb: 'For a spouse with low income (the income test is waived if disabled).',
    capIsUpperBound: true,
    autoSuggest: false,
  },
  parent: {
    id: 'parent',
    label: 'Parent Relief',
    blurb: 'Per parent or grandparent you support.',
    unitLabel: 'dependants',
    maxUnits: PARENT_MAX_DEPENDANTS,
    capIsUpperBound: true,
    autoSuggest: false,
  },
  qcr: {
    id: 'qcr',
    label: 'Qualifying Child Relief',
    blurb: 'Per qualifying child who is not disabled.',
    unitLabel: 'children',
    maxUnits: UI_MAX_CHILDREN,
    capIsUpperBound: true,
    autoSuggest: false,
  },
  hcr: {
    id: 'hcr',
    label: 'Handicapped Child Relief',
    blurb: 'Per qualifying child who is disabled.',
    unitLabel: 'children',
    maxUnits: UI_MAX_CHILDREN,
    capIsUpperBound: true,
    autoSuggest: false,
  },
  wmcr: {
    id: 'wmcr',
    label: "Working Mother's Child Relief",
    blurb: 'Per child, for a working mother; the amount depends on birth order.',
    unitLabel: 'children',
    maxUnits: UI_MAX_CHILDREN,
    capIsUpperBound: true,
    autoSuggest: false,
  },
  courseFees: {
    id: 'courseFees',
    label: 'Course Fees',
    blurb: 'Approved course fees. Only claimable for YA2025.',
    capIsUpperBound: true,
    autoSuggest: false,
  },
  cpfCashTopUp: {
    id: 'cpfCashTopUp',
    label: 'CPF Cash Top-up',
    blurb: 'Cash top-ups to your own or family members\u2019 CPF.',
    capIsUpperBound: true,
    autoSuggest: false,
  },
  srs: {
    id: 'srs',
    label: 'SRS Contributions',
    blurb: 'Supplementary Retirement Scheme contributions; cap depends on residency.',
    capIsUpperBound: true,
    autoSuggest: false,
  },
};

/** Income year whose CPF and OW rules apply to a YA: YA = income year + 1. */
export function incomeYearForYa(ya: YA): IncomeYear {
  return (ya - 1) as IncomeYear;
}

function nonNegFinite(x: number): number {
  return Number.isFinite(x) ? Math.max(0, x) : 0;
}

function roundCents(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Integer unit count in 0..max. Non-finite input becomes 0. */
function clampUnits(units: number | undefined, max: number): number {
  if (units === undefined || !Number.isFinite(units)) return 0;
  return Math.min(Math.max(Math.floor(units), 0), max);
}

/** WMCR summed over `count` children in birth order (fixed-dollar regime only). */
function wmcrForCount(count: number): number {
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    total += WMCR_FIXED_AMOUNTS[Math.min(i, WMCR_FIXED_AMOUNTS.length - 1)];
  }
  return total;
}

/**
 * Maximum claimable amount for one relief in the given context. Returns 0 when
 * the relief is not available in `ctx.ya`.
 */
export function reliefCap(id: ReliefId, ctx: ReliefContext): number {
  if (!isReliefAvailable(id, ctx.ya)) return 0;
  const units = ctx.units[id];
  switch (id) {
    case 'earnedIncome':
      return earnedIncomeRelief({
        age: ctx.age,
        disabled: true,
        earnedIncome: nonNegFinite(ctx.employmentIncome) + nonNegFinite(ctx.bonus),
      });
    case 'cpf':
      return ctx.residency === 'foreigner'
        ? 0
        : roundCents(
            cpfEmployeeRate(incomeYearForYa(ctx.ya), ctx.age) * CPF_ANNUAL_WAGE_CEILING,
          );
    case 'lifeInsurance':
      return Math.max(0, LIFE_INSURANCE_CPF_NIL_THRESHOLD - (ctx.claimed.cpf ?? 0));
    case 'nsmanSelf':
      return NSMAN_SELF_RELIEF.keyAppointment.activity;
    case 'nsmanWife':
      return NSMAN_WIFE_RELIEF;
    case 'nsmanParent':
      return NSMAN_PARENT_RELIEF_PER_PARENT * clampUnits(units, NSMAN_PARENT_MAX_PARENTS);
    case 'spouse':
      return SPOUSE_RELIEF.disability;
    case 'parent':
      return PARENT_RELIEF.staysWithDisability * clampUnits(units, PARENT_MAX_DEPENDANTS);
    case 'qcr':
      return QCR_PER_CHILD * clampUnits(units, UI_MAX_CHILDREN);
    case 'hcr':
      return HCR_PER_CHILD * clampUnits(units, UI_MAX_CHILDREN);
    case 'wmcr':
      return wmcrForCount(clampUnits(units, UI_MAX_CHILDREN));
    case 'courseFees':
      return COURSE_FEES_CAP;
    case 'cpfCashTopUp':
      return CPF_TOPUP_TOTAL_CAP;
    case 'srs':
      return SRS_CAP[ctx.residency];
  }
}

/** Earned Income Relief for the user's own income (normal tier, not disabled). */
export function suggestEarnedIncomeRelief(ctx: ReliefContext): number {
  return earnedIncomeRelief({
    age: ctx.age,
    disabled: false,
    earnedIncome: nonNegFinite(ctx.employmentIncome) + nonNegFinite(ctx.bonus),
  });
}

/**
 * Estimated CPF relief. ESTIMATE: assumes an even monthly salary, so the annual
 * ordinary wage is 12 × monthly salary, capped at 12 × the OW ceiling. Bonus
 * fills the rest of the annual wage ceiling. Foreigners get 0.
 */
export function suggestCpfRelief(ctx: ReliefContext): number {
  if (ctx.residency === 'foreigner') return 0;
  const iy = incomeYearForYa(ctx.ya);
  const rate = cpfEmployeeRate(iy, ctx.age);
  const ow = Math.min(nonNegFinite(ctx.employmentIncome), OW_MONTHLY_CEILING[iy] * 12);
  const aw = Math.min(
    nonNegFinite(ctx.bonus),
    Math.max(0, CPF_ANNUAL_WAGE_CEILING - ow),
  );
  return roundCents(rate * (ow + aw));
}
