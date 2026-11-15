import { describe, expect, it } from 'vitest';
import { isAllowedSgcarmartUrl, parseListingHtml, parseListingText } from './sgcarmart';
import audiHtml from './__fixtures__/sgcarmart-audi-a4-1551328.html?raw';
import hondaHtml from './__fixtures__/sgcarmart-honda-vezel-1551624.html?raw';

// Fixed "today" for every COE-left and reg-date calculation: 15 Nov 2026, local time.
const NOW = new Date(2026, 10, 15);

describe('isAllowedSgcarmartUrl', () => {
  it.each([
    'https://www.sgcarmart.com/used-cars/info/audi-a4-20a-tfsi-1551328/',
    'https://sgcarmart.com/used-cars/listing',
    'https://WWW.SGCARMART.COM/used-cars/listing',
    'https://sgcarmart.com/used-cars/info/audi-a4-20a-tfsi-1551328/',
    'https://www.sgcarmart.com:443/used-cars/listing',
  ])('accepts %s', (url) => {
    expect(isAllowedSgcarmartUrl(url)).toBe(true);
  });

  it.each([
    // scheme
    'http://www.sgcarmart.com/used-cars/listing',
    'ftp://www.sgcarmart.com/used-cars/listing',
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'file:///etc/passwd',
    '//www.sgcarmart.com/used-cars/listing',
    // userinfo tricks
    'https://user:pass@www.sgcarmart.com/used-cars/listing',
    'https://www.sgcarmart.com@evil.com/',
    'https://sgcarmart.com@evil.com',
    'https://evil.com\\@sgcarmart.com/',
    // ports
    'https://www.sgcarmart.com:8443/used-cars/listing',
    'https://www.sgcarmart.com:80/used-cars/listing',
    'https://www.sgcarmart.com:22/',
    // IP literals and internal targets
    'https://127.0.0.1/',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.1/',
    'https://192.168.1.1/',
    'https://2130706433/',
    'https://0x7f000001/',
    'https://[::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://[fd00::1]/',
    'https://localhost/',
    'https://sgcarmart.com.localhost/',
    // lookalike / suffix tricks
    'https://sgcarmart.com.evil.com/',
    'https://www.sgcarmart.com.evil.com/used-cars/listing',
    'https://evilsgcarmart.com/',
    'https://notsgcarmart.com/',
    'https://sgcarmart.co/',
    'https://sgcarmart.com-evil.com/',
    'https://evil.com/?x=.sgcarmart.com',
    'https://evil.com/.sgcarmart.com/',
    'https://sgcarmart.com./used-cars/listing',
    // whitespace and control characters
    ' https://www.sgcarmart.com/used-cars/listing',
    'https://www.sgcarmart.com/used-cars/listing ',
    'https://www\t.sgcarmart.com/',
    'https://www.sgcarmart.com/\nused-cars',
    'https://www.sgcarmart.com/\u0000',
    // malformed / empty / non-string
    '',
    'not a url',
    'https://',
    'https://www.sgcarmart.com:abc/',
    `https://www.sgcarmart.com/${'a'.repeat(2100)}`,
  ])('rejects %j', (url) => {
    expect(isAllowedSgcarmartUrl(url)).toBe(false);
  });

  it.each([null, undefined, 42, {}, [], true])('rejects non-string %j without throwing', (value) => {
    expect(isAllowedSgcarmartUrl(value)).toBe(false);
  });

  it.each([
    // only the two exact hosts: no other subdomains, not even m.
    'https://m.sgcarmart.com/used-cars/info/honda-vezel-15a-x-1551624/',
    'https://evil.sgcarmart.com/',
    'https://img.sgcarmart.com/x.jpg',
    // backslash: WHATWG reads it as '/', so 'evil.com\\.sgcarmart.com' would reach evil.com
    'https://evil.com\\.sgcarmart.com/',
    'https://www.sgcarmart.com\\@evil.com/',
    'https://www.sgcarmart.com\\evil.com/',
    // percent-encoded host: WHATWG decodes it, so the literal text must be refused
    'https://www%2Esgcarmart.com/used-cars/listing',
    'https://sgcarmart%2Ecom/',
    'https://%77ww.sgcarmart.com/',
    'https://evil.com%2F.sgcarmart.com/',
  ])('rejects host or encoding trick %j', (url) => {
    expect(isAllowedSgcarmartUrl(url)).toBe(false);
  });
});

describe('listing amounts', () => {
  const priceOf = (value: string) => parseListingText(`Price: ${value}`).price;

  it.each(['1e5', '1.5E3', '2e+4'])('rejects exponent form %s', (value) => {
    expect(priceOf(value)).toBeUndefined();
  });

  it.each(['12,34', '1,2,3', '1234,567', '1,000,0000'])('rejects misplaced comma groups in %s', (value) => {
    expect(priceOf(value)).toBeUndefined();
  });

  it.each(['10,000,001', '99,999,999', '1000000000000'])('rejects values above ten million: %s', (value) => {
    expect(priceOf(value)).toBeUndefined();
  });

  it.each([
    ['$10,000,000', 10_000_000],
    ['S$1,000,000', 1_000_000],
    ['$47,800', 47_800],
    ['$47,800.50', 47_800.5],
  ])('accepts %s', (value, expected) => {
    expect(priceOf(value)).toBe(expected);
  });
});

describe('h1 parsing cost', () => {
  it('parses 2 MB of repeated <h1> in under 500 ms', () => {
    const html = '<h1>'.repeat((2 * 1024 * 1024) / 4);
    const started = performance.now();
    parseListingHtml(html);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('parses 2 MB of unclosed title <h1> in under 500 ms', () => {
    const html = '<h1 class="title">x'.repeat((2 * 1024 * 1024) / 19);
    const started = performance.now();
    parseListingHtml(html);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('parseListingHtml (real listing fixtures)', () => {
  it('parses the Audi A4 listing fields', () => {
    expect(parseListingHtml(audiHtml, NOW)).toEqual({
      name: 'Audi A4 2.0A TFSI S-tronic',
      year: 2018,
      price: 47800,
      omv: 33419,
      arf: 38787,
      coe: 33900,
      coeExpiry: '2028-07-09',
      mileage: 69030,
      missing: [],
    });
  });

  it('parses the Honda Vezel listing and reports mileage as missing (N.A.)', () => {
    const result = parseListingHtml(hondaHtml, NOW);
    expect(result).toEqual({
      name: 'Honda Vezel 1.5A X (COE till 07/2030)',
      year: 2015,
      price: 65000,
      omv: 17984,
      arf: 7984,
      coe: 49822,
      coeExpiry: '2030-07-31',
      missing: ['mileage'],
    });
    expect(result.mileage).toBeUndefined();
  });
});

describe('parseListingHtml (defensive)', () => {
  it('returns every field as missing for empty input', () => {
    expect(parseListingHtml('')).toEqual({
      missing: ['name', 'year', 'price', 'omv', 'arf', 'coe', 'coeExpiry', 'mileage'],
    });
  });

  it.each([null, undefined, 123, {}, ['<html>']])('never throws on non-string %j', (value) => {
    expect(() => parseListingHtml(value as unknown as string)).not.toThrow();
    expect(parseListingHtml(value as unknown as string).missing).toHaveLength(8);
  });

  it('tolerates an unrelated HTML page', () => {
    const result = parseListingHtml('<html><body><h1>Maintenance</h1></body></html>');
    expect(result.price).toBeUndefined();
    expect(result.missing).toContain('price');
  });

  it('tolerates malformed RSC payload chunks without throwing', () => {
    const html = '<script>self.__next_f.push([1,"\\u"])</script>' +
      '<script>self.__next_f.push([1,"{\\"price\\":\\"$$12,345\\"}"])</script>';
    const result = parseListingHtml(html);
    expect(result.price).toBe(12345);
    expect(result.missing).toContain('omv');
  });

  it('does not treat a highest_price key as the listing price', () => {
    const html = '<script>self.__next_f.push([1,"{\\"highest_price\\":\\"$$99,999\\"}"])</script>';
    expect(parseListingHtml(html).price).toBeUndefined();
  });
});

describe('parseListingText (paste fallback)', () => {
  it('parses labelled lines with colons, plain spaces and split lines', () => {
    const text = [
      'Audi A4 2.0A TFSI S-tronic',
      'Price: S$47,800',
      'OMV',
      '$33,419',
      'ARF: $38,787',
      'COE $33,900',
      'Mileage: 69,030 km',
      'Reg Date: 10-Jul-2018',
    ].join('\n');
    expect(parseListingText(text, NOW)).toEqual({
      name: 'Audi A4 2.0A TFSI S-tronic',
      year: 2018,
      price: 47800,
      omv: 33419,
      arf: 38787,
      coe: 33900,
      coeExpiry: '2028-07-10',
      mileage: 69030,
      missing: [],
    });
  });

  it('does not read the COE in a model name as the COE price', () => {
    const text = 'Honda Vezel 1.5A X (COE till 07/2030)\nPrice $65,000\nMileage N.A.';
    const result = parseListingText(text);
    expect(result.coe).toBeUndefined();
    expect(result.mileage).toBeUndefined();
    expect(result.price).toBe(65000);
    expect(result.missing).toEqual(expect.arrayContaining(['coe', 'mileage', 'omv', 'arf']));
  });

  it('rejects non-numeric values such as POA', () => {
    expect(parseListingText('Price: POA').price).toBeUndefined();
  });

  it('prefers the first occurrence of a label', () => {
    expect(parseListingText('Price: $10,000\nPrice: $20,000').price).toBe(10000);
  });

  it.each([null, undefined, 5, {}])('never throws on non-string %j', (value) => {
    expect(() => parseListingText(value as unknown as string)).not.toThrow();
    expect(parseListingText(value as unknown as string).missing).toHaveLength(8);
  });

  it('returns all fields missing for empty text', () => {
    expect(parseListingText('   \n\n  ').missing).toHaveLength(8);
  });
});

describe('parseListingText (labels inline in one line)', () => {
  it('reads all four figures from the one-line paste (exact string)', () => {
    const r = parseListingText('Price $65,000 OMV $17,984 ARF $7,984 COE $49,822');
    expect(r.price).toBe(65000);
    expect(r.omv).toBe(17984);
    expect(r.arf).toBe(7984);
    expect(r.coe).toBe(49822);
    expect(r.missing).toEqual(['name', 'year', 'coeExpiry', 'mileage']);
  });

  it('reads the Audi one-liner', () => {
    const r = parseListingText('Price $47,800 OMV $33,419 ARF $38,787 COE $33,900');
    expect([r.price, r.omv, r.arf, r.coe]).toEqual([47800, 33419, 38787, 33900]);
  });

  it('accepts colons, S$ prefixes and separators between inline pairs', () => {
    const r = parseListingText('Price: S$65,000, OMV: S$17,984; ARF S$7,984 | COE $49,822');
    expect([r.price, r.omv, r.arf, r.coe]).toEqual([65000, 17984, 7984, 49822]);
  });

  it('keeps multi-line copy working alongside inline labels', () => {
    const r = parseListingText('Honda Vezel 1.5A X\nPrice $65,000 OMV $17,984\nARF\n$7,984\nMileage: 30,000 km');
    expect(r.name).toBe('Honda Vezel 1.5A X');
    expect([r.price, r.omv, r.arf, r.mileage]).toEqual([65000, 17984, 7984, 30000]);
  });

  it('takes a value from the next line when the label ends its line mid-text', () => {
    const r = parseListingText('Price\n$47,800 OMV $33,419');
    expect(r.price).toBe(47800);
    expect(r.omv).toBe(33419);
  });

  it('does not match a label inside a longer word', () => {
    expect(parseListingText('Pricelist $65,000').price).toBeUndefined();
    expect(parseListingText('Coeur $49,822').coe).toBeUndefined();
  });

  it('rejects an inline non-numeric value but still reads the next pair', () => {
    const r = parseListingText('Price POA OMV $17,984');
    expect(r.price).toBeUndefined();
    expect(r.omv).toBe(17984);
  });

  it('keeps the strict amount rules inline (exponent and bad comma groups)', () => {
    expect(parseListingText('Price 1e5 OMV $17,984').price).toBeUndefined();
    expect(parseListingText('Price 12,34 OMV $17,984').price).toBeUndefined();
  });

  it('stays fast on hostile repeated labels and whitespace', () => {
    const hostile = [
      'Price '.repeat(40000),
      `price${' '.repeat(200000)}x`,
      `reg${' '.repeat(200000)}`,
      `Name:${' '.repeat(200000)}`,
    ];
    for (const text of hostile) {
      const started = performance.now();
      parseListingText(text);
      expect(performance.now() - started).toBeLessThan(500);
    }
  });

  it('stays fast on hostile COE phrases and durations', () => {
    const hostile = [
      'COE left '.repeat(30000),
      '1 yr '.repeat(40000) + 'COE left',
      'COE till ' + ' '.repeat(200000) + 'x',
      'COE expiry ' + '1-'.repeat(100000),
      'Reg Date ' + '1'.repeat(200000),
    ];
    for (const text of hostile) {
      const started = performance.now();
      parseListingText(text, NOW);
      expect(performance.now() - started).toBeLessThan(500);
    }
  });
});

// ---------- COE expiry ----------

describe('COE expiry from the real fixtures', () => {
  it('Audi A4: reads the RSC coe_left "1yr 7mths 24days COE left" (not the reg date)', () => {
    // Reg 10-Jul-2018 + 10 years would be 2028-07-10; the page's own time-left gives 2028-07-09.
    expect(parseListingHtml(audiHtml, NOW).coeExpiry).toBe('2028-07-09');
  });

  it('Honda Vezel: reads the explicit "COE till 07/2030" title as the month end', () => {
    expect(parseListingHtml(hondaHtml, NOW).coeExpiry).toBe('2030-07-31');
  });

  it('Honda Vezel without its title: falls back to the RSC coe_left "3yrs 8mths 16days COE left"', () => {
    const html = hondaHtml.replaceAll('(COE till 07/2030)', '');
    const result = parseListingHtml(html, NOW);
    expect(result.name).toBe('Honda Vezel 1.5A X');
    expect(result.coeExpiry).toBe('2030-07-31');
  });

  it('Audi A4 with coe_left removed: falls back to reg date 10-Jul-2018 + 10 years', () => {
    const html = audiHtml.replaceAll('1yr 7mths 24days COE left', 'N.A.');
    expect(parseListingHtml(html, NOW).coeExpiry).toBe('2028-07-10');
  });

  it('uses the injected now for the time-left maths', () => {
    // Same listing, a year later: 1yr 7mths 24days from 1 Jan 2027.
    expect(parseListingHtml(audiHtml, new Date(2027, 0, 1)).coeExpiry).toBe('2028-08-25');
  });

  it('works with the default now (no argument) and still returns an ISO date', () => {
    expect(parseListingHtml(audiHtml).coeExpiry).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('COE expiry from pasted text', () => {
  it.each([
    ['COE left after a label', 'COE left: 9yrs 2mths', '2036-01-15'],
    ['duration in brackets before the phrase', 'Price $65,000 (9yrs 2mths COE left)', '2036-01-15'],
    ['singular units', '1yr 1mth 1day COE left', '2027-12-16'],
    ['long unit words', '2 years 3 months COE left', '2029-02-15'],
    ['days only', '0yrs 0mths 30days COE left', '2026-12-15'],
    ['duration after the phrase, spread over lines', 'COE left\n9 yrs 2 mths 3 days', '2036-01-18'],
  ])('reads a time left: %s', (_label, text, expected) => {
    expect(parseListingText(text, NOW).coeExpiry).toBe(expected);
  });

  it.each([
    ['dash, month name', 'COE expiry 12-Mar-2029', '2029-03-12'],
    ['colon, ISO date', 'COE expiry: 2029-03-12', '2029-03-12'],
    ['spaced month name', 'COE expires 12 March 2029', '2029-03-12'],
    ['dd/mm/yyyy', 'COE expiry 12/03/2029', '2029-03-12'],
    ['month and year only (last day of month)', 'Honda Vezel COE till 07/2030', '2030-07-31'],
  ])('reads an explicit expiry: %s', (_label, text, expected) => {
    expect(parseListingText(text, NOW).coeExpiry).toBe(expected);
  });

  it('prefers an explicit expiry over a time left and the reg date', () => {
    expect(parseListingText('Reg Date 10-Jul-2018\n1yr 7mths COE left\nCOE expiry 12-Mar-2029', NOW).coeExpiry).toBe(
      '2029-03-12',
    );
  });

  it('prefers a time left over the reg date', () => {
    expect(parseListingText('Reg Date 10-Jul-2018\n1yr 7mths COE left', NOW).coeExpiry).toBe('2028-06-15');
  });

  it('uses reg date + 10 years when nothing else is given', () => {
    expect(parseListingText('Reg Date: 10-Jul-2018', NOW).coeExpiry).toBe('2028-07-10');
    expect(parseListingText('Reg Date 2018-07-10', NOW).coeExpiry).toBe('2028-07-10');
  });

  it('does not use a reg date whose +10 years is already past (COE was renewed)', () => {
    // 06-Aug-2015 + 10y = 2025, before 15 Nov 2026. The real COE is unknown: report missing.
    const r = parseListingText('Reg Date: 06-Aug-2015', NOW);
    expect(r.coeExpiry).toBeUndefined();
    expect(r.missing).toContain('coeExpiry');
  });

  it('does not read a time span as the COE price', () => {
    const r = parseListingText('COE: 9yrs 2mths', NOW);
    expect(r.coe).toBeUndefined();
    expect(r.missing).toContain('coe');
  });

  it('does not take a COE-left line as the listing name', () => {
    const r = parseListingText('1yr 7mths 24days COE left\nHonda Vezel 1.5A X', NOW);
    expect(r.name).toBe('Honda Vezel 1.5A X');
  });

  it('keeps a listing name that mentions the COE expiry', () => {
    expect(parseListingText('Honda Vezel COE till 07/2030', NOW).name).toBe('Honda Vezel COE till 07/2030');
  });

  it('reports coeExpiry as missing when the text has no COE data', () => {
    const r = parseListingText('Price $65,000', NOW);
    expect(r.coeExpiry).toBeUndefined();
    expect(r.missing).toContain('coeExpiry');
  });
});

describe('COE expiry sanity checks (nonsense becomes missing)', () => {
  it.each([
    ['11 years left (over the COE maximum)', 'COE left: 11yrs 0mths'],
    ['14 months (not a real token)', 'COE left: 3yrs 14mths'],
    ['25 years left', 'COE left: 25yrs'],
    ['expiry beyond the COE maximum', 'COE expiry 12-Mar-2045'],
    ['expiry before 1990', 'COE expiry 12-Mar-1985'],
    ['expiry past 2100', 'COE expiry 12-Mar-2101'],
    ['impossible calendar day', 'COE expiry 31-Feb-2029'],
    ['impossible ISO month', 'COE expiry: 2029-13-01'],
    ['reg date whose +10 lands past 2100', 'Reg Date 10-Jul-2095'],
    ['reg date before 1990', 'Reg Date 10-Jul-1985'],
    ['giant number of years', 'COE left: 99999999999yrs'],
  ])('rejects %s', (_label, text) => {
    const r = parseListingText(text, NOW);
    expect(r.coeExpiry).toBeUndefined();
    expect(r.missing).toContain('coeExpiry');
  });

  it('never throws on an invalid now', () => {
    expect(() => parseListingText('1yr 7mths COE left', new Date('not a date'))).not.toThrow();
    expect(parseListingText('1yr 7mths COE left', new Date('not a date')).coeExpiry).toBeUndefined();
    expect(parseListingHtml(audiHtml, new Date('not a date')).coeExpiry).toBeUndefined();
  });
});

describe('COE expiry date maths', () => {
  it('clamps the day to the target month (31 Jan + 1 month = 28 Feb)', () => {
    expect(parseListingText('1mth COE left', new Date(2027, 0, 31)).coeExpiry).toBe('2027-02-28');
  });

  it('is the same wherever the process runs (local date components, UTC arithmetic)', () => {
    expect(parseListingText('2yrs COE left', new Date(2026, 10, 15, 23, 59)).coeExpiry).toBe('2028-11-15');
  });
});
