import { describe, expect, it } from 'vitest';
import { computeCar, DEFAULT_CAR_FORM, type CarForm } from './car';
import { currentDownPct, loadPatch, savedCarFigures, showFullLoanRow } from './carSaved';
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
// Local-time date: the app reads calendar days from local time.
const TODAY = new Date(2026, 10, 15, 12);

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
    const got = savedCarFigures(car(), f, TODAY);
    const expected = computeCar({ ...f, price: '47800', omv: '33419', downMode: 'pct', downPct: '40', downAmt: '' });
    expect(got.monthly).toBeCloseTo(expected.instalment, 10);
    expect(got.interest).toBeCloseTo(expected.interest, 10);
    expect(got.downPct).toBe(40);
  });

  it('uses the same tenure and rate as the calculator form', () => {
    const short = savedCarFigures(car(), form({ years: '5', months: '0' }), TODAY);
    const long = savedCarFigures(car(), form({ years: '7', months: '0' }), TODAY);
    expect(short.monthly!).toBeGreaterThan(long.monthly!);
  });

  it('gives a higher instalment for a full loan than at the current downpayment', () => {
    const got = savedCarFigures(car(), form({ downPct: '40' }), TODAY);
    expect(got.monthlyFullLoan!).toBeGreaterThan(got.monthly!);
    const full = computeCar({ ...form(), price: '47800', omv: '33419', downMode: 'pct', downPct: '0', downAmt: '' });
    expect(got.monthlyFullLoan).toBeCloseTo(full.instalment, 10);
  });

  it('uses the 40% MAS minimum when the car has no OMV, and flags a downpayment below it', () => {
    const noOmv = savedCarFigures(car({ omv: undefined }), form({ downPct: '30' }), TODAY);
    expect(noOmv.masMinPct).toBe(40);
    expect(noOmv.belowMas).toBe(true);
    const withOmv = savedCarFigures(car({ omv: 20000 }), form({ downPct: '30' }), TODAY);
    expect(withOmv.masMinPct).toBe(30);
    expect(withOmv.belowMas).toBe(false);
  });

  it('returns null figures for a car with no usable price, without throwing', () => {
    const got = savedCarFigures(car({ price: undefined }), form(), TODAY);
    expect(got.monthly).toBeNull();
    expect(got.interest).toBeNull();
    expect(got.monthlyFullLoan).toBeNull();
    expect(savedCarFigures(car({ price: 0 }), form(), TODAY).monthly).toBeNull();
  });

  it('does not mutate the calculator form', () => {
    const f = form({ price: '150000', omv: '', downPct: '40' });
    const snapshot = JSON.stringify(f);
    savedCarFigures(car({ coeExpiry: '2027-11-15' }), f, TODAY);
    expect(JSON.stringify(f)).toBe(snapshot);
  });

  it('a car with no COE expiry uses the form tenure unchanged', () => {
    const got = savedCarFigures(car(), form({ years: '7', months: '0' }), TODAY);
    expect(got.coeLeft).toBeNull();
    expect(got.tenureMonths).toBe(84);
    expect(got.tenureCapped).toBe(false);
  });

  it('caps the loan at the car COE left when the form tenure is longer', () => {
    // COE expires 15 Nov 2027: 12 months left, form asks for 7 years.
    const got = savedCarFigures(car({ coeExpiry: '2027-11-15' }), form({ years: '7', months: '0' }), TODAY);
    expect(got.coeLeft).toBe(12);
    expect(got.tenureMonths).toBe(12);
    expect(got.tenureCapped).toBe(true);
    const oneYear = computeCar({ ...form(), price: '47800', omv: '33419', downMode: 'pct', downPct: '40', downAmt: '', years: '1', months: '0' });
    expect(got.monthly).toBeCloseTo(oneYear.instalment, 10);
    expect(got.interest).toBeCloseTo(oneYear.interest, 10);
  });

  it('keeps the form tenure when the COE lasts longer than it', () => {
    const got = savedCarFigures(car({ coeExpiry: '2032-11-15' }), form({ years: '5', months: '0' }), TODAY);
    expect(got.coeLeft).toBe(72);
    expect(got.tenureMonths).toBe(60);
    expect(got.tenureCapped).toBe(false);
  });

  it('an expired COE gives the 1-month minimum tenure', () => {
    const got = savedCarFigures(car({ coeExpiry: '2025-01-01' }), form({ years: '7', months: '0' }), TODAY);
    expect(got.coeLeft).toBe(0);
    expect(got.tenureMonths).toBe(1);
    expect(got.tenureCapped).toBe(true);
  });

  it('the car COE cap uses the injected date, not the clock', () => {
    const later = savedCarFigures(car({ coeExpiry: '2027-11-15' }), form(), new Date(2027, 4, 15, 12));
    expect(later.coeLeft).toBe(6);
    expect(later.tenureMonths).toBe(6);
  });
});

describe('loadPatch', () => {
  it('loads price and OMV, clearing OMV when the car has none', () => {
    expect(loadPatch(car())).toEqual({ price: '47800', omv: '33419', downMode: 'pct' });
    expect(loadPatch(car({ omv: undefined }))).toEqual({ price: '47800', omv: '', downMode: 'pct' });
  });

  it('sets COE expiry mode and date when the car has a recorded COE expiry', () => {
    expect(loadPatch(car({ coeExpiry: '2029-03-15' }))).toEqual({
      price: '47800',
      omv: '33419',
      downMode: 'pct',
      coeMode: 'expiry',
      coeExpiry: '2029-03-15',
    });
  });

  it('refuses a car with no price', () => {
    expect(loadPatch(car({ price: undefined }))).toBeNull();
  });
});

describe('showFullLoanRow', () => {
  it('hides the 0%-down row when the current downpayment is already 0%', () => {
    expect(showFullLoanRow(0)).toBe(false);
  });

  it('shows the 0%-down row when a downpayment is set', () => {
    expect(showFullLoanRow(40)).toBe(true);
    expect(showFullLoanRow(0.01)).toBe(true);
  });

  it('matches the duplicate it hides: at 0% the current and full-loan monthly figures are equal', () => {
    const got = savedCarFigures(car(), form({ downPct: '0', price: '150000' }), TODAY);
    expect(got.downPct).toBe(0);
    expect(got.monthly).toBeCloseTo(got.monthlyFullLoan!, 10);
  });
});
