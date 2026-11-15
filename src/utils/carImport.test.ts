import { describe, expect, it } from 'vitest';
import {
  draftFromListing,
  importErrorMessage,
  importPatch,
  listingFromParse,
  listingFromResponse,
  missingMessage,
} from './carImport';
import { parseListingText } from './sgcarmart';

describe('importPatch (listing fields -> form patch)', () => {
  it('writes price and omv as strings and switches to percent mode', () => {
    expect(importPatch({ price: 47800, omv: 33419 })).toEqual({ price: '47800', omv: '33419', downMode: 'pct' });
  });

  it('keeps the form price when the listing gave none', () => {
    expect(importPatch({ omv: 20000 })).toEqual({ omv: '20000' });
    expect(importPatch({})).toEqual({ omv: '' });
    expect(importPatch({ price: 0 })).toEqual({ price: '0', downMode: 'pct', omv: '' });
  });

  it('clears a stale OMV when the listing has none (previous car must not carry over)', () => {
    // Previous car had OMV 33,419 (above the S$20k cap); the new listing has price only.
    const previous = { omv: '33419' };
    const patch = importPatch({ price: 65000 });
    expect({ ...previous, ...patch }).toEqual({ omv: '', price: '65000', downMode: 'pct' });
  });

  it('never touches non-form fields (ARF, COE, year, mileage, name)', () => {
    const patch = importPatch({ name: 'Honda Vezel', arf: 1, coe: 2, year: 2018, mileage: 3 });
    // Only OMV is ever written here (cleared, because the listing gave none); nothing else leaks in.
    expect(Object.keys(patch)).toEqual(['omv']);
    expect(patch.omv).toBe('');
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
    expect(listing.missing).toEqual(['name', 'year', 'arf', 'coe', 'mileage']);
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
