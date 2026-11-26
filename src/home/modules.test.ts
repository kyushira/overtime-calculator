import { describe, expect, it } from 'vitest';
import { HOME_MODULES, legacyHashTarget } from './modules';

describe('HOME_MODULES', () => {
  it('lists the ten modules in the agreed order with titles', () => {
    expect(HOME_MODULES.map((m) => m.title)).toEqual([
      'Salary & OT',
      'My Car',
      'Tax Claim',
      'Savings',
      'Loans',
      'Sinking Funds',
      'Credit Card',
      'Subscriptions',
      'Health',
      'Receipt Tracker',
    ]);
  });

  it('has exactly three active modules, with routes /pay, /car, /tax', () => {
    const active = HOME_MODULES.filter((m) => m.status === 'active');
    expect(active.map((m) => m.href)).toEqual(['/pay', '/car', '/tax']);
  });

  it('gives every coming-soon module a null href', () => {
    const soon = HOME_MODULES.filter((m) => m.status === 'soon');
    expect(soon).toHaveLength(7);
    for (const m of soon) expect(m.href).toBeNull();
  });

  it('has unique ids', () => {
    const ids = HOME_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('legacyHashTarget', () => {
  it('maps car and tax hashes to their routes', () => {
    expect(legacyHashTarget('#car')).toBe('/car');
    expect(legacyHashTarget('#tax')).toBe('/tax');
    expect(legacyHashTarget('#/car')).toBe('/car');
  });

  it('maps pay sub-tab hashes to /pay#tab', () => {
    expect(legacyHashTarget('#calculator')).toBe('/pay#calculator');
    expect(legacyHashTarget('#breakdown')).toBe('/pay#breakdown');
    expect(legacyHashTarget('#target')).toBe('/pay#target');
    expect(legacyHashTarget('#months')).toBe('/pay#months');
    expect(legacyHashTarget('#settings')).toBe('/pay#settings');
  });

  it('is case-insensitive', () => {
    expect(legacyHashTarget('#Months')).toBe('/pay#months');
  });

  it('returns null for empty or unknown hashes', () => {
    expect(legacyHashTarget('')).toBeNull();
    expect(legacyHashTarget('#')).toBeNull();
    expect(legacyHashTarget('#nope')).toBeNull();
    expect(legacyHashTarget('#savings')).toBeNull();
  });
});
