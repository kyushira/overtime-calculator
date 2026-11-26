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
  /**
   * Selected tier id per tiered relief (see reliefTiers). Missing or unknown ids
   * fall back to the default (first) tier.
   */
  tiers?: Partial<Record<ReliefId, string>>;
}

/** One selectable tier of a relief. `amount` is per unit for unit-based reliefs. */
export interface ReliefTier {
  id: string;
  label: string;
  amount: number;
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
 * Selectable tiers for a relief, default (standard, non-disability) tier first.
 * Built only from the constants in reliefs.ts. Returns undefined for reliefs
 * without tiers. Earned Income depends on age, so it takes the context.
 * Tier ids do not depend on age, so callers may pass any age to read ids.
 */
export function reliefTiers(
  id: ReliefId,
  ctx: Pick<ReliefContext, 'age'>,
): readonly ReliefTier[] | undefined {
  switch (id) {
    case 'earnedIncome':
      // earnedIncomeRelief with an infinite income returns the bare tier amount.
      return [
        {
          id: 'normal',
          label: 'Standard',
          amount: earnedIncomeRelief({ age: ctx.age, disabled: false, earnedIncome: Infinity }),
        },
        {
          id: 'disability',
          label: 'Disability',
          amount: earnedIncomeRelief({ age: ctx.age, disabled: true, earnedIncome: Infinity }),
        },
      ];
    case 'spouse':
      return [
        { id: 'normal', label: 'Standard', amount: SPOUSE_RELIEF.normal },
        { id: 'disability', label: 'Disabled spouse', amount: SPOUSE_RELIEF.disability },
      ];
    case 'parent':
      return [
        { id: 'staysWith', label: 'Stays with you', amount: PARENT_RELIEF.staysWith },
        { id: 'notStaysWith', label: 'Does not stay with you', amount: PARENT_RELIEF.notStaysWith },
        {
          id: 'staysWithDisability',
          label: 'Stays with you (disabled)',
          amount: PARENT_RELIEF.staysWithDisability,
        },
        {
          id: 'notStaysWithDisability',
          label: 'Does not stay with you (disabled)',
          amount: PARENT_RELIEF.notStaysWithDisability,
        },
      ];
    case 'nsmanSelf':
      return [
        {
          id: 'general-activity',
          label: 'General, performed activity',
          amount: NSMAN_SELF_RELIEF.general.activity,
        },
        {
          id: 'general-noActivity',
          label: 'General, no activity',
          amount: NSMAN_SELF_RELIEF.general.noActivity,
        },
        {
          id: 'keyAppointment-activity',
          label: 'Key appointment, performed activity',
          amount: NSMAN_SELF_RELIEF.keyAppointment.activity,
        },
        {
          id: 'keyAppointment-noActivity',
          label: 'Key appointment, no activity',
          amount: NSMAN_SELF_RELIEF.keyAppointment.noActivity,
        },
      ];
    default:
      return undefined;
  }
}

/**
 * The tier in force for a relief: the selected one when it exists, otherwise
 * the default (first). Undefined for reliefs without tiers.
 */
export function selectedReliefTier(id: ReliefId, ctx: ReliefContext): ReliefTier | undefined {
  const tiers = reliefTiers(id, ctx);
  if (!tiers || tiers.length === 0) return undefined;
  const chosen = ctx.tiers?.[id];
  return tiers.find((t) => t.id === chosen) ?? tiers[0];
}

/**
 * Maximum claimable amount for one relief in the given context. Returns 0 when
 * the relief is not available in `ctx.ya`. Tiered reliefs use the selected tier.
 */
export function reliefCap(id: ReliefId, ctx: ReliefContext): number {
  if (!isReliefAvailable(id, ctx.ya)) return 0;
  const units = ctx.units[id];
  const tier = selectedReliefTier(id, ctx);
  switch (id) {
    case 'earnedIncome':
      // Relief can never exceed earned income.
      return Math.min(tier?.amount ?? 0, nonNegFinite(ctx.employmentIncome) + nonNegFinite(ctx.bonus));
    case 'cpf':
      return ctx.residency === 'foreigner'
        ? 0
        : roundCents(
            cpfEmployeeRate(incomeYearForYa(ctx.ya), ctx.age) * CPF_ANNUAL_WAGE_CEILING,
          );
    case 'lifeInsurance':
      return Math.max(0, LIFE_INSURANCE_CPF_NIL_THRESHOLD - (ctx.claimed.cpf ?? 0));
    case 'nsmanSelf':
      return tier?.amount ?? 0;
    case 'nsmanWife':
      return NSMAN_WIFE_RELIEF;
    case 'nsmanParent':
      return NSMAN_PARENT_RELIEF_PER_PARENT * clampUnits(units, NSMAN_PARENT_MAX_PARENTS);
    case 'spouse':
      return tier?.amount ?? 0;
    case 'parent':
      return (tier?.amount ?? 0) * clampUnits(units, PARENT_MAX_DEPENDANTS);
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

/**
 * Earned Income Relief for the user's own income. Follows the selected tier:
 * the standard tier unless the user picked the disability tier.
 */
export function suggestEarnedIncomeRelief(ctx: ReliefContext): number {
  return earnedIncomeRelief({
    age: ctx.age,
    disabled: ctx.tiers?.earnedIncome === 'disability',
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
