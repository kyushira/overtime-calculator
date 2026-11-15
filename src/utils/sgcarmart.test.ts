import { describe, expect, it } from 'vitest';
import { isAllowedSgcarmartUrl, parseListingHtml, parseListingText } from './sgcarmart';
import audiHtml from './__fixtures__/sgcarmart-audi-a4-1551328.html?raw';
import hondaHtml from './__fixtures__/sgcarmart-honda-vezel-1551624.html?raw';

describe('isAllowedSgcarmartUrl', () => {
  it.each([
    'https://www.sgcarmart.com/used-cars/info/audi-a4-20a-tfsi-1551328/',
    'https://sgcarmart.com/used-cars/listing',
    'https://m.sgcarmart.com/used-cars/info/honda-vezel-15a-x-1551624/',
    'https://WWW.SGCARMART.COM/used-cars/listing',
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
