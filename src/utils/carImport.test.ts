import { describe, expect, it } from 'vitest';
import {
  draftFromListing,
  formatCoeExpiry,
  importErrorMessage,
  importPatch,
  listingFromParse,
  listingFromResponse,
  missingMessage,
} from './carImport';
import { parseListingText } from './sgcarmart';

describe('importPatch (listing fields -> form patch)', () => {
  // A listing without a COE expiry clears the COE inputs, so they match the OMV rule.
  const COE_CLEARED = { coeMode: 'left', coeYears: '', coeMonths: '', coeExpiry: '' };

  it('writes price and omv as strings and switches to percent mode', () => {
    expect(importPatch({ price: 47800, omv: 33419 })).toEqual({
      price: '47800',
      omv: '33419',
      downMode: 'pct',
      ...COE_CLEARED,
    });
  });

  it('keeps the form price when the listing gave none', () => {
    expect(importPatch({ omv: 20000 })).toEqual({ omv: '20000', ...COE_CLEARED });
    expect(importPatch({})).toEqual({ omv: '', ...COE_CLEARED });
    expect(importPatch({ price: 0 })).toEqual({ price: '0', downMode: 'pct', omv: '', ...COE_CLEARED });
  });

  it('clears a stale OMV when the listing has none (previous car must not carry over)', () => {
    // Previous car had OMV 33,419 (above the S$20k cap); the new listing has price only.
    const previous = { omv: '33419' };
    const patch = importPatch({ price: 65000 });
    expect({ ...previous, ...patch }).toEqual({ omv: '', price: '65000', downMode: 'pct', ...COE_CLEARED });
  });

  it('clears a stale COE expiry when the listing has none (previous car must not carry over)', () => {
    // Previous car was on expiry mode with a date; the new listing has no COE expiry.
    const previous = { coeMode: 'expiry', coeYears: '', coeMonths: '', coeExpiry: '2030-07-31' };
    const patch = importPatch({ price: 65000, omv: 17984 });
    expect({ ...previous, ...patch }).toMatchObject({ coeMode: 'left', coeExpiry: '', coeYears: '', coeMonths: '' });
  });

  it('switches to expiry mode with the ISO date when the listing gives one', () => {
    const patch = importPatch({ price: 65000, omv: 17984, coeExpiry: '2030-07-31' });
    expect(patch).toEqual({
      price: '65000',
      downMode: 'pct',
      omv: '17984',
      coeMode: 'expiry',
      coeExpiry: '2030-07-31',
    });
  });

  it('never touches non-form fields (ARF, COE price, year, mileage, name)', () => {
    const patch = importPatch({ name: 'Honda Vezel', arf: 1, coe: 2, year: 2018, mileage: 3 });
    // Only OMV and the COE-expiry inputs are written here; the COE price and the rest stay out.
    expect(Object.keys(patch).sort()).toEqual(['coeExpiry', 'coeMode', 'coeMonths', 'coeYears', 'omv']);
    expect(patch.omv).toBe('');
  });

  it('formatCoeExpiry shows the date as "12 Mar 2029"', () => {
    expect(formatCoeExpiry('2029-03-12')).toBe('12 Mar 2029');
    expect(formatCoeExpiry('2030-07-31')).toBe('31 Jul 2030');
    expect(formatCoeExpiry('nonsense')).toBe('nonsense');
  });

  it('draftFromListing carries the COE expiry only when present', () => {
    expect(draftFromListing({ fields: { coeExpiry: '2030-07-31' }, missing: [] }).coeExpiry).toBe('2030-07-31');
    expect(draftFromListing({ fields: { price: 1 }, missing: [] })).not.toHaveProperty('coeExpiry');
  });
});

describe('listingFromResponse / listingFromParse', () => {
  it('accepts a proxy success body and keeps the link and missing list', () => {
    const got = listingFromResponse(
      { ok: true, url: 'x', fields: { price: 1000 }, missing: ['omv', 'bogus'] },
      'https://www.sgcarmart.com/used-cars/info/x-1/',
    );
    expect(got).toEqual({
      link: 'https://www.sgcarmart.com/used-cars/info/x-1/',
      fields: { price: 1000 },
      missing: ['omv'],
    });
  });

  it('rejects error bodies and wrong shapes', () => {
    expect(listingFromResponse({ ok: false, error: 'invalid_url' }, 'l')).toBeNull();
    expect(listingFromResponse({ ok: true, fields: null, missing: [] }, 'l')).toBeNull();
    expect(listingFromResponse('nope', 'l')).toBeNull();
  });

  it('wraps pasted-text parses without a link', () => {
    const parsed = parseListingText('Price: S$12,300\nOMV: S$9,000');
    const listing = listingFromParse(parsed);
    expect(listing.link).toBeUndefined();
    expect(listing.fields).toEqual({ price: 12300, omv: 9000 });
    expect(listing.missing).toEqual(['name', 'year', 'arf', 'coe', 'coeExpiry', 'mileage']);
  });
});

describe('draftFromListing', () => {
  it('carries the link and every readable field into the saved-car draft', () => {
    const draft = draftFromListing({
      link: 'https://www.sgcarmart.com/used-cars/info/a-1/',
      fields: { name: 'Honda Vezel', year: 2018, price: 90000, omv: 30000, arf: 1, coe: 2, mileage: 3 },
      missing: [],
    });
    expect(draft).toEqual({
      name: 'Honda Vezel',
      link: 'https://www.sgcarmart.com/used-cars/info/a-1/',
      year: 2018,
      price: 90000,
      omv: 30000,
      arf: 1,
      coe: 2,
      mileage: 3,
    });
  });

  it('omits unreadable fields and the link when there is none', () => {
    expect(draftFromListing({ fields: {}, missing: ['name'] })).toEqual({});
  });
});

describe('user-facing messages', () => {
  it('names missing fields the way the user sees them', () => {
    expect(missingMessage('omv')).toBe("Couldn't read OMV, fill manually");
    expect(missingMessage('mileage')).toBe("Couldn't read mileage, fill manually");
  });

  it('maps rate-limit with Retry-After into a countdown', () => {
    expect(importErrorMessage(429, 'rate_limited', '3')).toBe('sgcarmart is rate-limiting imports. Try again in 3 seconds.');
    expect(importErrorMessage(429, 'rate_limited', '1')).toBe('sgcarmart is rate-limiting imports. Try again in 1 second.');
    expect(importErrorMessage(429, 'rate_limited', null)).toBe('sgcarmart is rate-limiting imports. Try again in a few seconds.');
  });

  it('maps proxy failures to friendly copy', () => {
    expect(importErrorMessage(400, 'invalid_url')).toBe("That isn't a sgcarmart.com listing link.");
    expect(importErrorMessage(504, 'timeout')).toMatch(/too long/);
    expect(importErrorMessage(502, 'upstream_status', null)).toMatch(/paste the listing text/);
    expect(importErrorMessage(404)).toMatch(/not available/);
    expect(importErrorMessage(0)).toMatch(/Couldn't reach/);
  });
});
