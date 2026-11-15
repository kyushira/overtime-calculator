/**
 * Pure helpers for importing a used-car listing from sgcarmart.com.
 *
 * - isAllowedSgcarmartUrl: SSRF allow-list. Only https://sgcarmart.com or
 *   https://<sub>.sgcarmart.com, default port, no userinfo, no IP literals.
 * - parseListingHtml: reads the Next.js RSC payload embedded in a listing page
 *   (the page's own data, not scraped DOM text).
 * - parseListingText: fallback for a user pasting the listing text.
 *
 * Nothing here does I/O. Parsers never throw; absent fields are listed in `missing`.
 */

export const LISTING_FIELDS = ['name', 'year', 'price', 'omv', 'arf', 'coe', 'mileage'] as const;
export type ListingField = (typeof LISTING_FIELDS)[number];

export type ListingFields = Partial<{
  name: string;
  year: number;
  price: number;
  omv: number;
  arf: number;
  coe: number;
  mileage: number;
}>;

export type ListingParseResult = ListingFields & { missing: ListingField[] };

const ALLOWED_HOST = 'sgcarmart.com';
const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 200;
// The WHATWG URL parser silently strips tabs/newlines inside a URL, so reject them
// (and any other control or space character) before parsing.
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f]/;

/** True only for https URLs whose host is sgcarmart.com or a subdomain of it. */
export function isAllowedSgcarmartUrl(input: unknown): boolean {
  try {
    if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URL_LENGTH) return false;
    if (CONTROL_OR_SPACE.test(input)) return false;
    const url = new URL(input);
    if (url.protocol !== 'https:') return false;
    if (url.username !== '' || url.password !== '') return false;
    if (url.port !== '') return false; // only the default 443 (normalised to '')
    const host = url.hostname;
    if (host.endsWith('.')) return false;
    return host === ALLOWED_HOST || host.endsWith(`.${ALLOWED_HOST}`);
  } catch {
    return false;
  }
}

// ---------- shared value helpers ----------

// "$$47,800" (RSC escapes "$" as "$$"), "S$47,800", "$33,419", "69,030 km (8.3k /yr)".
// Must START with a number after the optional currency, so "COE till 07/2030" is rejected.
const AMOUNT = /^\s*(?:S?\$+\s*)?(\d[\d,]*(?:\.\d+)?)/;

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = AMOUNT.exec(raw);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseYear(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = typeof raw === 'number' ? raw : Number(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(raw)?.[1]);
  return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'");
}

function cleanName(raw: string): string | undefined {
  const text = decodeEntities(raw.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, MAX_NAME_LENGTH) : undefined;
}

function assemble(fields: ListingFields): ListingParseResult {
  const out: Partial<ListingParseResult> = {};
  const missing: ListingField[] = [];
  for (const key of LISTING_FIELDS) {
    const value = fields[key];
    if (value === undefined || value === '') {
      missing.push(key);
    } else {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return { ...out, missing };
}

// ---------- HTML (RSC payload) ----------

const RSC_PUSH = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;

/** Concatenates the decoded string chunks of the Next.js RSC payload. */
function decodeRscPayload(html: string): string {
  const parts: string[] = [];
  for (const m of html.matchAll(RSC_PUSH)) {
    try {
      const decoded: unknown = JSON.parse(`"${m[1]}"`);
      if (typeof decoded === 'string') parts.push(decoded);
    } catch {
      // A malformed chunk only loses its own data; keep parsing the rest.
    }
  }
  return parts.join('');
}

/** First `"key":"value"` string in the payload, JSON-unescaped. Keys are fixed literals. */
function payloadString(payload: string, key: string): string | undefined {
  const m = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`).exec(payload);
  if (!m) return undefined;
  try {
    const decoded: unknown = JSON.parse(`"${m[1]}"`);
    return typeof decoded === 'string' ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function payloadYear(payload: string, key: string): number | undefined {
  const m = new RegExp(`"${key}":(\\d{4})(?!\\d)`).exec(payload);
  return parseYear(m?.[1]);
}

function h1Name(html: string): string | undefined {
  const m =
    /<h1\b[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(html) ??
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return m ? cleanName(m[1]) : undefined;
}

/** Parses a saved sgcarmart listing page. Never throws. */
export function parseListingHtml(html: unknown): ListingParseResult {
  try {
    if (typeof html !== 'string') return assemble({});
    const payload = decodeRscPayload(html);
    const make = payloadString(payload, 'make');
    const model = payloadString(payload, 'model');
    const name =
      h1Name(html) ?? (make && model ? cleanName(`${make} ${model}`) : undefined);
    const year = payloadYear(payload, 'manufactured') ?? parseYear(payloadString(payload, 'reg_date'));
    return assemble({
      name,
      year,
      price: parseAmount(payloadString(payload, 'price')),
      omv: parseAmount(payloadString(payload, 'omv')),
      arf: parseAmount(payloadString(payload, 'arf')),
      coe: parseAmount(payloadString(payload, 'coe')),
      mileage: parseAmount(payloadString(payload, 'mileage')),
    });
  } catch {
    return assemble({});
  }
}

// ---------- pasted text ----------

type TextKey = 'name' | 'price' | 'omv' | 'arf' | 'coe' | 'mileage' | 'year' | 'regDate';

// Label patterns are anchored and word-bounded so "COE till 07/2030" in a model name
// is not taken for the COE label (its value fails the amount check anyway).
const TEXT_LABELS: Array<{ key: TextKey; re: RegExp }> = [
  { key: 'price', re: /^price\b/i },
  { key: 'omv', re: /^omv\b/i },
  { key: 'arf', re: /^arf\b/i },
  { key: 'coe', re: /^coe\b/i },
  { key: 'mileage', re: /^mileage\b/i },
  { key: 'year', re: /^(?:manufactured|year)\b/i },
  { key: 'regDate', re: /^reg(?:istration)?\s*date\b/i },
  { key: 'name', re: /^(?:name|title|model)\s*:/i },
];

const MONEY_KEYS: ReadonlySet<TextKey> = new Set(['price', 'omv', 'arf', 'coe', 'mileage']);

function matchLabel(line: string): { key: TextKey; len: number } | undefined {
  for (const { key, re } of TEXT_LABELS) {
    const m = re.exec(line);
    if (m) return { key, len: m[0].length };
  }
  return undefined;
}

function valueAccepted(key: TextKey, value: string): boolean {
  if (key === 'name') return value.length > 0;
  if (key === 'year' || key === 'regDate') return parseYear(value) !== undefined;
  return MONEY_KEYS.has(key) && parseAmount(value) !== undefined;
}

/**
 * Parses listing details pasted as text. Accepts "Label: value", "Label value",
 * and a label on one line with its value on the next. Never throws.
 */
export function parseListingText(text: unknown): ListingParseResult {
  try {
    if (typeof text !== 'string') return assemble({});
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const labelled = lines.map((l) => matchLabel(l));
    const raw: Partial<Record<TextKey, string>> = {};

    for (let i = 0; i < lines.length; i++) {
      const hit = labelled[i];
      if (!hit) continue;
      let value = lines[i].slice(hit.len).replace(/^[\s:\-–]+/, '').trim();
      if (value === '') {
        const next = lines.slice(i + 1).find((l) => l !== '');
        value = next ?? '';
      }
      if (raw[hit.key] === undefined && valueAccepted(hit.key, value)) raw[hit.key] = value;
    }

    // Name without a label: first non-label line that contains a letter.
    const nameFallback = lines.find((l, i) => l !== '' && !labelled[i] && /[A-Za-z]/.test(l));
    const name = raw.name ?? nameFallback;

    return assemble({
      name: name ? name.slice(0, MAX_NAME_LENGTH) : undefined,
      year: parseYear(raw.year) ?? parseYear(raw.regDate),
      price: parseAmount(raw.price),
      omv: parseAmount(raw.omv),
      arf: parseAmount(raw.arf),
      coe: parseAmount(raw.coe),
      mileage: parseAmount(raw.mileage),
    });
  } catch {
    return assemble({});
  }
}
