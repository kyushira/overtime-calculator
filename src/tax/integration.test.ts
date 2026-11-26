import { describe, expect, it } from 'vitest';
import {
  computeTax,
  courseFeesRelief,
  cpfRelief,
  earnedIncomeRelief,
  parentRelief,
  RELIEF_ORDER,
  srsRelief,
  toReliefLines,
} from './index';

// Research §5 worked example: age 40, employment income $100,000, no donations.
// Reliefs: EIR 1,000 + CPF 20,000 + SRS 15,300 + Parent 5,500 = 41,800 (< $80,000 cap).
const baseAmounts = () => ({
  earnedIncome: earnedIncomeRelief({ age: 40, disabled: false, earnedIncome: 100000 }),
  cpf: cpfRelief({ employeeCompulsoryCpf: 20000 }),
  srs: srsRelief({ contribution: 15300, status: 'citizenOrPr' }),
  parent: parentRelief([{ livesWithClaimant: false, disabled: false, annualIncome: 0 }]),
});

describe('research §5 worked example (end-to-end)', () => {
  const sumSavings = (ids: { saving: number }[]) =>
    Math.round(ids.reduce((acc, r) => acc + r.saving * 100, 0)) / 100;

  it('YA2026: chargeable 58,200, tax 1,824, no rebate, net 1,824', () => {
    const ya = 2026 as const;
    const reliefs = toReliefLines(baseAmounts(), ya);
    const result = computeTax({ ya, totalIncome: 100000, reliefs });

    expect(result.totalReliefsClaimed).toBe(41800);
    expect(result.reliefsAllowed).toBe(41800);
    expect(result.reliefCapApplied).toBe(false);
    expect(result.chargeableIncome).toBe(58200);
    expect(result.taxOnChargeable).toBe(1824);
    expect(result.rebate).toBe(0);
    expect(result.netTaxPayable).toBe(1824);
    expect(result.marginalRate).toBeCloseTo(0.07, 10);
    expect(result.estimatedSavings).toBe(3826);
    expect(sumSavings(result.perReliefSavings)).toBe(3826);
  });

  it('YA2025: same chargeable 58,200 and tax 1,824, $200 rebate, net 1,624', () => {
    const ya = 2025 as const;
    const reliefs = toReliefLines(baseAmounts(), ya);
    const result = computeTax({ ya, totalIncome: 100000, reliefs });

    expect(result.chargeableIncome).toBe(58200);
    expect(result.taxOnChargeable).toBe(1824);
    expect(result.rebate).toBe(200);
    expect(result.netTaxPayable).toBe(1624);
    expect(result.estimatedSavings).toBe(3826);
    expect(sumSavings(result.perReliefSavings)).toBe(3826);
  });

  it('emits relief lines in RELIEF_ORDER and per-relief savings follow that order', () => {
    const reliefs = toReliefLines(baseAmounts(), 2026);
    const indexes = reliefs.map((r) => RELIEF_ORDER.indexOf(r.id));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(reliefs.map((r) => r.id)).toEqual(['earnedIncome', 'cpf', 'parent', 'srs']);

    const result = computeTax({ ya: 2026, totalIncome: 100000, reliefs });
    expect(result.perReliefSavings.map((r) => r.id)).toEqual(['earnedIncome', 'cpf', 'parent', 'srs']);
  });

  it('YA2025 Course Fees 5,500 lowers chargeable to 52,700', () => {
    const ya = 2025 as const;
    const reliefs = toReliefLines(
      { ...baseAmounts(), courseFees: courseFeesRelief({ fees: 5500, ya }) },
      ya,
    );
    const result = computeTax({ ya, totalIncome: 100000, reliefs });

    expect(result.reliefsAllowed).toBe(47300);
    expect(result.chargeableIncome).toBe(52700);
    expect(sumSavings(result.perReliefSavings)).toBe(result.estimatedSavings);
  });

  it('YA2026 drops Course Fees: chargeable stays 58,200', () => {
    const ya = 2026 as const;
    const reliefs = toReliefLines(
      { ...baseAmounts(), courseFees: courseFeesRelief({ fees: 5500, ya: 2025 }) },
      ya,
    );
    expect(reliefs.some((r) => r.id === 'courseFees')).toBe(false);

    const result = computeTax({ ya, totalIncome: 100000, reliefs });
    expect(result.chargeableIncome).toBe(58200);
    expect(result.estimatedSavings).toBe(3826);
  });
});
