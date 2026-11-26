/**
 * Singapore resident individual income-tax bands.
 *
 * Source: /opt/data/projects/_research/sg-tax-2025.md §1.1 (IRAS resident rates).
 * The bands are identical for YA2024, YA2025, YA2026 and YA2027, so one table
 * serves both supported years.
 *
 * Arithmetic is done in integer cents. Each band contributes
 * sliceCents * rateBp (basis points) accumulated as an integer; the sum is
 * divided by 10000 and rounded ONCE to whole cents, half-up for positives.
 *
 * ASSUMPTION: IRAS's own rounding convention for tax payable is not stated in
 * the research file. Rounding the total once to the cent (half-up) is our
 * choice; it matches the IRAS sample figures in §5 to the cent.
 */

export type YA = 2025 | 2026;

export interface ResidentBand {
  /** Upper bound of the band in whole dollars (inclusive). Infinity for the last band. */
  readonly upper: number;
  /** Marginal rate in basis points (1 bp = 0.01%). */
  readonly rateBp: number;
}

export const RESIDENT_BANDS: ReadonlyArray<ResidentBand> = [
  { upper: 20000, rateBp: 0 },
  { upper: 30000, rateBp: 200 },
  { upper: 40000, rateBp: 350 },
  { upper: 80000, rateBp: 700 },
  { upper: 120000, rateBp: 1150 },
  { upper: 160000, rateBp: 1500 },
  { upper: 200000, rateBp: 1800 },
  { upper: 240000, rateBp: 1900 },
  { upper: 280000, rateBp: 1950 },
  { upper: 320000, rateBp: 2000 },
  { upper: 500000, rateBp: 2200 },
  { upper: 1000000, rateBp: 2300 },
  { upper: Infinity, rateBp: 2400 },
];

/** Converts a dollar amount to integer cents. Non-finite or negative values become 0. */
export function dollarsToCents(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

/** Tax on a chargeable income given in integer cents. Result is integer cents. */
export function taxOnChargeableCents(chargeableCents: number): number {
  const c = Math.max(0, Math.round(chargeableCents));
  let lower = 0;
  let acc = 0; // sum of sliceCents * rateBp, integer
  for (const band of RESIDENT_BANDS) {
    const upperCents = band.upper === Infinity ? Infinity : band.upper * 100;
    const top = Math.min(c, upperCents);
    if (top > lower) {
      acc += (top - lower) * band.rateBp;
    }
    if (c <= upperCents) break;
    lower = upperCents;
  }
  // Divide by 10000 (bp -> fraction) and round half-up to whole cents, once.
  return Math.floor((acc + 5000) / 10000);
}

/** Tax on chargeable income, dollars in, dollars out. Negative input is treated as 0. */
export function taxOnChargeableIncome(chargeable: number): number {
  return taxOnChargeableCents(dollarsToCents(chargeable)) / 100;
}

/** Marginal rate for chargeable income given in integer cents, as a fraction (0.07 = 7%). */
export function marginalRateCents(chargeableCents: number): number {
  const c = Math.max(0, Math.round(chargeableCents));
  for (const band of RESIDENT_BANDS) {
    const upperCents = band.upper === Infinity ? Infinity : band.upper * 100;
    if (c <= upperCents) return band.rateBp / 10000;
  }
  // Unreachable: the last band's upper bound is Infinity.
  return RESIDENT_BANDS[RESIDENT_BANDS.length - 1].rateBp / 10000;
}

/** Marginal rate for chargeable income in dollars, as a fraction. Negative input is treated as 0. */
export function marginalRate(chargeable: number): number {
  return marginalRateCents(dollarsToCents(chargeable));
}
