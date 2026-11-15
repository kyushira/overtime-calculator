import { describe, expect, it } from 'vitest';
import { isAllowedSgcarmartUrl, parseListingHtml, parseListingText } from './sgcarmart';
import audiHtml from './__fixtures__/sgcarmart-audi-a4-1551328.html?raw';
import hondaHtml from './__fixtures__/sgcarmart-honda-vezel-1551624.html?raw';

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
    expect(parseListingHtml(audiHtml)).toEqual({
      name: 'Audi A4 2.0A TFSI S-tronic',
      year: 2018,
      price: 47800,
      omv: 33419,
      arf: 38787,
      coe: 33900,
      mileage: 69030,
      missing: [],
    });
  });

  it('parses the Honda Vezel listing and reports mileage as missing (N.A.)', () => {
    const result = parseListingHtml(hondaHtml);
    expect(result).toEqual({
      name: 'Honda Vezel 1.5A X (COE till 07/2030)',
      year: 2015,
      price: 65000,
      omv: 17984,
      arf: 7984,
      coe: 49822,
      missing: ['mileage'],
    });
    expect(result.mileage).toBeUndefined();
  });
});

describe('parseListingHtml (defensive)', () => {
  it('returns every field as missing for empty input', () => {
    expect(parseListingHtml('')).toEqual({
      missing: ['name', 'year', 'price', 'omv', 'arf', 'coe', 'mileage'],
    });
  });

  it.each([null, undefined, 123, {}, ['<html>']])('never throws on non-string %j', (value) => {
    expect(() => parseListingHtml(value as unknown as string)).not.toThrow();
    expect(parseListingHtml(value as unknown as string).missing).toHaveLength(7);
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
    expect(parseListingText(text)).toEqual({
      name: 'Audi A4 2.0A TFSI S-tronic',
      year: 2018,
      price: 47800,
      omv: 33419,
      arf: 38787,
      coe: 33900,
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
    expect(parseListingText(value as unknown as string).missing).toHaveLength(7);
  });

  it('returns all fields missing for empty text', () => {
    expect(parseListingText('   \n\n  ').missing).toHaveLength(7);
  });
});

describe('parseListingText (labels inline in one line)', () => {
  it('reads all four figures from the one-line paste (exact string)', () => {
    const r = parseListingText('Price $65,000 OMV $17,984 ARF $7,984 COE $49,822');
    expect(r.price).toBe(65000);
    expect(r.omv).toBe(17984);
    expect(r.arf).toBe(7984);
    expect(r.coe).toBe(49822);
    expect(r.missing).toEqual(['name', 'year', 'mileage']);
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
});
