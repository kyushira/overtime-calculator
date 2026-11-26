/**
 * Singapore resident income-tax engine (pure TypeScript, no I/O).
 *
 * Computation chain (research §4.1):
 *   total income − allowable expenses − donations×2.5 = assessable income
 *   − personal reliefs (clamped to $80,000 and to assessable income) = chargeable income
 *   → resident band table → tax on chargeable income
 *   − Personal Income Tax Rebate (YA2025 only) = net tax payable (floored at 0)
 *
 * Money is handled in integer cents. Inputs and outputs are dollars (number).
 * Negative, NaN or non-finite inputs are treated as 0.
 *
 * Savings and per-relief split (research §4.2, §3):
 *   - estimatedSavings = tax(assessable income, no reliefs) − tax(chargeable income
 *     after clamped reliefs). This is PRE-REBATE: the YA2025 rebate is applied to
 *     tax payable after reliefs, so quoting savings pre-rebate avoids double-
 *     counting the $200 rebate cap.
 *   - Per-relief split uses the STACK method. Reliefs are applied in the order of
 *     the `reliefs` array (the caller's canonical order). Relief #1 removes the TOP
 *     slice of income (highest rates), relief #2 the next slice down, and so on.
 *     The $80,000 cap is consumed in the same order, so late reliefs can be
 *     truncated (recorded in `allowedAmount`). Each relief's saving is the tax
 *     difference across its own slice, computed from cumulative tax values, so
 *     the per-relief savings telescope and sum EXACTLY to estimatedSavings.
 */

import {
  dollarsToCents,
  marginalRateCents,
  taxOnChargeableCents,
  type YA,
} from './bands';

export type { YA } from './bands';

export const PERSONAL_RELIEF_CAP = 80000;

/** Donations are deducted at 2.5x the amount donated: $1 donated = $2.50 deducted. */
export const DONATION_DEDUCTION_MULTIPLIER = 2.5;

/**
 * Personal Income Tax Rebate (research §1.2): YA2025 = 60% of tax payable, capped
 * at $200. YA2026 = none.
 */
export const PERSONAL_INCOME_TAX_REBATE: Record<YA, { rate: number; cap: number } | null> = {
  2025: { rate: 0.6, cap: 200 },
  2026: null,
};

export interface ReliefLine {
  id: string;
  /** Amount in dollars, already individually capped by the caller. */
  amount: number;
}

export interface TaxInput {
  ya: YA;
  totalIncome: number;
  /** Allowable expenses and deductions, in dollars. */
  deductions?: number;
  /** Cash amount donated, in dollars. Deducted at 2.5x. */
  donations?: number;
  /** Stacking order = array order (see file header). */
  reliefs: ReliefLine[];
}

export interface PerReliefSaving {
  id: string;
  /** Amount claimed, as given. */
  amount: number;
  /** Amount that survived the $80,000 cap and the assessable-income floor. */
  allowedAmount: number;
  /** Tax saved by this relief's slice of income (pre-rebate). */
  saving: number;
}

export interface TaxResult {
  assessableIncome: number;
  donationDeduction: number;
  totalReliefsClaimed: number;
  reliefsAllowed: number;
  /** True when the sum of claimed reliefs exceeded the $80,000 cap. */
  reliefCapApplied: boolean;
  chargeableIncome: number;
  taxOnChargeable: number;
  rebate: number;
  netTaxPayable: number;
  /** Marginal rate on chargeable income, as a fraction (0.07 = 7%). */
  marginalRate: number;
  /** tax(assessable) − tax(chargeable), pre-rebate. */
  estimatedSavings: number;
  perReliefSavings: PerReliefSaving[];
}

const toCentsSafe = dollarsToCents;

function centsToDollars(cents: number): number {
  return cents / 100;
}

export function computeTax(input: TaxInput): TaxResult {
  const totalC = toCentsSafe(input.totalIncome);
  const deductionsC = toCentsSafe(input.deductions ?? 0);
  const donationC = toCentsSafe(input.donations ?? 0);
  // Donation deduction is 2.5x; rounded half-up to whole cents.
  const donationDeductionC = Math.round(donationC * DONATION_DEDUCTION_MULTIPLIER);
  const assessableC = Math.max(0, totalC - deductionsC - donationDeductionC);

  const claims = input.reliefs.map((r) => ({
    id: r.id,
    amount: r.amount,
    amountC: toCentsSafe(r.amount),
  }));
  const totalClaimedC = claims.reduce((acc, c) => acc + c.amountC, 0);

  // Clamp: total reliefs cannot exceed the $80,000 cap or assessable income.
  // Consumed in array order, so late reliefs are the ones truncated.
  const capC = PERSONAL_RELIEF_CAP * 100;
  const allowableC = Math.min(capC, assessableC);
  let remainingC = allowableC;
  const allowedC = claims.map((c) => {
    const take = Math.min(c.amountC, remainingC);
    remainingC -= take;
    return take;
  });
  const reliefsAllowedC = allowableC - remainingC;

  const chargeableC = assessableC - reliefsAllowedC; // >= 0 by construction
  const taxC = taxOnChargeableCents(chargeableC);

  const rebateRule = PERSONAL_INCOME_TAX_REBATE[input.ya];
  const rebateC = rebateRule
    ? Math.min(Math.round(taxC * rebateRule.rate), Math.round(rebateRule.cap * 100))
    : 0;
  const netC = Math.max(0, taxC - rebateC);

  // Savings: exact, band-by-band, pre-rebate (research §4.2).
  const taxAssessableC = taxOnChargeableCents(assessableC);
  const savingsC = taxAssessableC - taxC;

  // Stack method: walk down the income stack in array order. Each relief's
  // saving is the tax difference across its own slice; the differences telescope
  // to taxAssessableC - taxC, so they sum exactly to savingsC.
  let runningC = assessableC;
  let prevTaxC = taxAssessableC;
  const perReliefSavings: PerReliefSaving[] = claims.map((c, i) => {
    runningC -= allowedC[i];
    const afterTaxC = taxOnChargeableCents(runningC);
    const sliceSavingC = prevTaxC - afterTaxC;
    prevTaxC = afterTaxC;
    return {
      id: c.id,
      amount: c.amount,
      allowedAmount: centsToDollars(allowedC[i]),
      saving: centsToDollars(sliceSavingC),
    };
  });

  return {
    assessableIncome: centsToDollars(assessableC),
    donationDeduction: centsToDollars(donationDeductionC),
    totalReliefsClaimed: centsToDollars(totalClaimedC),
    reliefsAllowed: centsToDollars(reliefsAllowedC),
    reliefCapApplied: totalClaimedC > capC,
    chargeableIncome: centsToDollars(chargeableC),
    taxOnChargeable: centsToDollars(taxC),
    rebate: centsToDollars(rebateC),
    netTaxPayable: centsToDollars(netC),
    marginalRate: marginalRateCents(chargeableC),
    estimatedSavings: centsToDollars(savingsC),
    perReliefSavings,
  };
}
