import { describe, expect, it } from 'vitest';
import { computeCar, DEFAULT_CAR_FORM, type CarForm } from './car';
import { currentDownPct, loadPatch, savedCarFigures } from './carSaved';
import type { SavedCar } from './savedCars';

const form = (patch: Partial<CarForm> = {}): CarForm => ({ ...DEFAULT_CAR_FORM, ...patch });
const car = (patch: Partial<SavedCar> = {}): SavedCar => ({
  id: 'c1',
  name: 'Audi A4',
  price: 47800,
  omv: 33419,
  savedAt: '2026-11-15T00:00:00.000Z',
  ...patch,
});

describe('currentDownPct', () => {
  it('reads the percent field in percent mode', () => {
    expect(currentDownPct(form({ downPct: '40' }))).toBe(40);
  });

  it('derives the percent from the S$ field in amount mode', () => {
    expect(currentDownPct(form({ price: '200000', downMode: 'amt', downAmt: '50000' }))).toBe(25);
  });
});

describe('savedCarFigures', () => {
  it('computes the monthly instalment at the current downpayment % for that car price', () => {
    const f = form({ downPct: '40', price: '150000' });
    const got = savedCarFigures(car(), f);
    const expected = computeCar({ ...f, price: '47800', omv: '33419', downMode: 'pct', downPct: '40', downAmt: '' });
    expect(got.monthly).toBeCloseTo(expected.instalment, 10);
    expect(got.interest).toBeCloseTo(expected.interest, 10);
    expect(got.downPct).toBe(40);
  });

  it('uses the same tenure and rate as the calculator form', () => {
    const short = savedCarFigures(car(), form({ years: '5', months: '0' }));
    const long = savedCarFigures(car(), form({ years: '7', months: '0' }));
    expect(short.monthly!).toBeGreaterThan(long.monthly!);
  });

  it('gives a higher instalment for a full loan than at the current downpayment', () => {
    const got = savedCarFigures(car(), form({ downPct: '40' }));
    expect(got.monthlyFullLoan!).toBeGreaterThan(got.monthly!);
    const full = computeCar({ ...form(), price: '47800', omv: '33419', downMode: 'pct', downPct: '0', downAmt: '' });
    expect(got.monthlyFullLoan).toBeCloseTo(full.instalment, 10);
  });

  it('uses the 40% MAS minimum when the car has no OMV, and flags a downpayment below it', () => {
    const noOmv = savedCarFigures(car({ omv: undefined }), form({ downPct: '30' }));
    expect(noOmv.masMinPct).toBe(40);
    expect(noOmv.belowMas).toBe(true);
    const withOmv = savedCarFigures(car({ omv: 20000 }), form({ downPct: '30' }));
    expect(withOmv.masMinPct).toBe(30);
    expect(withOmv.belowMas).toBe(false);
  });

  it('returns null figures for a car with no usable price, without throwing', () => {
    const got = savedCarFigures(car({ price: undefined }), form());
    expect(got.monthly).toBeNull();
    expect(got.interest).toBeNull();
    expect(got.monthlyFullLoan).toBeNull();
    expect(savedCarFigures(car({ price: 0 }), form()).monthly).toBeNull();
  });

  it('does not mutate the calculator form', () => {
    const f = form({ price: '150000', omv: '', downPct: '40' });
    const snapshot = JSON.stringify(f);
    savedCarFigures(car(), f);
    expect(JSON.stringify(f)).toBe(snapshot);
  });
});

describe('loadPatch', () => {
  it('loads price and OMV, clearing OMV when the car has none', () => {
    expect(loadPatch(car())).toEqual({ price: '47800', omv: '33419', downMode: 'pct' });
    expect(loadPatch(car({ omv: undefined }))).toEqual({ price: '47800', omv: '', downMode: 'pct' });
  });

  it('refuses a car with no price', () => {
    expect(loadPatch(car({ price: undefined }))).toBeNull();
  });
});
