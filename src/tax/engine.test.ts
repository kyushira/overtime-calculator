import { describe, it, expect } from 'vitest';
import { taxOnChargeableIncome } from './bands';
import { computeTax, type TaxInput } from './engine';

// Sum of per-relief savings, compared in integer cents to avoid float noise.
const cents = (x: number): number => Math.round(x * 100);

describe('taxOnChargeableIncome (resident bands, research §1.1 / §5.1)', () => {
  const table: Array<[number, number]> = [
    [0, 0],
    [20000, 0],
    [20001, 0.02],
    [30000, 200],
    [40000, 550],
    [58200, 1824],
    [70000, 2650],
    [80000, 3350],
    [100000, 5650],
    [120000, 7950],
    [160000, 13950],
    [200000, 21150],
    [240000, 28750],
    [280000, 36550],
    [320000, 44550],
    [500000, 84150],
    [1000000, 199150],
    [1500000, 319150],
  ];

  for (const [income, expected] of table) {
    it(`taxes chargeable income ${income} at ${expected}`, () => {
      expect(taxOnChargeableIncome(income)).toBeCloseTo(expected, 2);
    });
  }

  it('treats negative chargeable income as zero tax', () => {
    expect(taxOnChargeableIncome(-5000)).toBe(0);
  });
});

describe('computeTax', () => {
  it('caps total reliefs at $80,000 (IRAS example, YA2026)', () => {
    // Reliefs are synthetic amounts that sum to the IRAS example total of 86,650.
    const input: TaxInput = {
      ya: 2026,
      totalIncome: 150000,
      reliefs: [
        { id: 'CPF', amount: 20400 },
        { id: 'SRS', amount: 15300 },
        { id: 'QCR', amount: 4000 },
        { id: 'synthetic-top-up', amount: 46950 },
      ],
    };
    const r = computeTax(input);
    expect(r.totalReliefsClaimed).toBe(86650);
    expect(r.reliefsAllowed).toBe(80000);
    expect(r.reliefCapApplied).toBe(true);
    expect(r.chargeableIncome).toBe(70000);
    expect(r.taxOnChargeable).toBeCloseTo(2650, 2);
  });

  it('matches the IRAS YA2026 sample (donation of $100 cash = $250 deduction)', () => {
    // IRAS sample lists "$250 donations" as the already-2.5x deduction, which
    // corresponds to a $100 cash donation. 50,000 - 250 = 49,750 assessable.
    // Reliefs: EIR 1,000 + QCR 4,000 + CPF 10,000 = 15,000 -> chargeable 34,750.
    const r = computeTax({
      ya: 2026,
      totalIncome: 50000,
      donations: 100,
      reliefs: [
        { id: 'EIR', amount: 1000 },
        { id: 'QCR', amount: 4000 },
        { id: 'CPF', amount: 10000 },
      ],
    });
    expect(r.donationDeduction).toBe(250);
    expect(r.assessableIncome).toBe(49750);
    expect(r.chargeableIncome).toBe(34750);
    expect(r.taxOnChargeable).toBeCloseTo(366.25, 2);
  });

  describe('worked example (research §5): income 100,000, reliefs 41,800', () => {
    const reliefs = [
      { id: 'EIR', amount: 1000 },
      { id: 'CPF', amount: 20000 },
      { id: 'SRS', amount: 15300 },
      { id: 'Parent', amount: 5500 },
    ];

    it('YA2026: chargeable 58,200, tax 1,824, no rebate, net 1,824', () => {
      const r = computeTax({ ya: 2026, totalIncome: 100000, reliefs });
      expect(r.totalReliefsClaimed).toBe(41800);
      expect(r.chargeableIncome).toBe(58200);
      expect(r.taxOnChargeable).toBeCloseTo(1824, 2);
      expect(r.rebate).toBe(0);
      expect(r.netTaxPayable).toBeCloseTo(1824, 2);
    });

    it('YA2025: same tax 1,824, rebate capped at 200, net 1,624', () => {
      const r = computeTax({ ya: 2025, totalIncome: 100000, reliefs });
      expect(r.chargeableIncome).toBe(58200);
      expect(r.taxOnChargeable).toBeCloseTo(1824, 2);
      expect(r.rebate).toBe(200);
      expect(r.netTaxPayable).toBeCloseTo(1624, 2);
    });

    it('estimated savings is 3,826 in both YAs (band-by-band, not a flat rate)', () => {
      const r2025 = computeTax({ ya: 2025, totalIncome: 100000, reliefs });
      const r2026 = computeTax({ ya: 2026, totalIncome: 100000, reliefs });
      expect(r2025.estimatedSavings).toBe(3826);
      expect(r2026.estimatedSavings).toBe(3826);
      // 11.5% x 20,000 + 7% x 21,800 = 3,826
      expect(0.115 * 20000 + 0.07 * 21800).toBeCloseTo(3826, 6);
      expect(r2026.estimatedSavings).not.toBe(41800 * 0.07); // 2,926
      expect(r2026.estimatedSavings).not.toBe(41800 * 0.115); // 4,807
    });

    it('per-relief savings sum exactly to estimated savings, CPF gets the top 11.5% slice', () => {
      // CPF first in the stack so its slice is exactly 100,000 -> 80,000 at 11.5%.
      const cpfFirst = [reliefs[1], reliefs[0], reliefs[2], reliefs[3]];
      const r = computeTax({ ya: 2026, totalIncome: 100000, reliefs: cpfFirst });
      const sum = r.perReliefSavings.reduce((acc, p) => acc + cents(p.saving), 0);
      expect(sum).toBe(cents(r.estimatedSavings));
      const cpf = r.perReliefSavings.find((p) => p.id === 'CPF');
      expect(cpf?.saving).toBeCloseTo(2300, 2); // 20,000 x 11.5%
    });
  });

  it('per-relief split: first relief in array removes the top slice', () => {
    const r = computeTax({
      ya: 2026,
      totalIncome: 100000,
      reliefs: [
        { id: 'CPF', amount: 20000 },
        { id: 'SRS', amount: 15300 },
        { id: 'Parent', amount: 5500 },
        { id: 'EIR', amount: 1000 },
      ],
    });
    expect(r.perReliefSavings.map((p) => p.id)).toEqual(['CPF', 'SRS', 'Parent', 'EIR']);
    expect(r.perReliefSavings[0].saving).toBeCloseTo(2300, 2);
    expect(cents(r.perReliefSavings[1].saving)).toBe(107100); // 80,000 -> 64,700 band slice
    const sum = r.perReliefSavings.reduce((acc, p) => acc + cents(p.saving), 0);
    expect(sum).toBe(cents(r.estimatedSavings));
    expect(r.estimatedSavings).toBe(3826);
  });

  it('floors: reliefs above assessable income give zero chargeable, tax, and net', () => {
    const r = computeTax({
      ya: 2025,
      totalIncome: 10000,
      reliefs: [{ id: 'CPF', amount: 15000 }],
    });
    expect(r.reliefsAllowed).toBe(10000);
    expect(r.chargeableIncome).toBe(0);
    expect(r.taxOnChargeable).toBe(0);
    expect(r.rebate).toBe(0);
    expect(r.netTaxPayable).toBe(0);
    expect(r.estimatedSavings).toBe(0);
  });

  it('rebate never makes net tax negative (chargeable 20,100 -> tax 2, rebate 1.2, net 0.8)', () => {
    const r = computeTax({ ya: 2025, totalIncome: 20100, reliefs: [] });
    expect(r.taxOnChargeable).toBe(2);
    expect(r.rebate).toBe(1.2);
    expect(r.netTaxPayable).toBe(0.8);
  });

  it('cap truncation follows array order: last relief is truncated', () => {
    const r = computeTax({
      ya: 2026,
      totalIncome: 100000,
      reliefs: [
        { id: 'A', amount: 50000 },
        { id: 'B', amount: 40000 },
      ],
    });
    expect(r.reliefCapApplied).toBe(true);
    expect(r.reliefsAllowed).toBe(80000);
    expect(r.perReliefSavings[0].allowedAmount).toBe(50000);
    expect(r.perReliefSavings[1].allowedAmount).toBe(30000);
    expect(r.chargeableIncome).toBe(20000);
  });

  it('treats negative and NaN inputs as zero', () => {
    const r = computeTax({
      ya: 2026,
      totalIncome: 50000,
      deductions: -100,
      donations: Number.NaN,
      reliefs: [{ id: 'EIR', amount: -1000 }],
    });
    expect(r.assessableIncome).toBe(50000);
    expect(r.reliefsAllowed).toBe(0);
    expect(r.chargeableIncome).toBe(50000);
  });
});
