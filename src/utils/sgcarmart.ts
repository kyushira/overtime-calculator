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

// `coe` is the COE price (S$). `coeExpiry` is the date the COE runs out (ISO YYYY-MM-DD).
export const LISTING_FIELDS = ['name', 'year', 'price', 'omv', 'arf', 'coe', 'coeExpiry', 'mileage'] as const;
export type ListingField = (typeof LISTING_FIELDS)[number];

export type ListingFields = Partial<{
  name: string;
  year: number;
  price: number;
  omv: number;
  arf: number;
  coe: number;
  coeExpiry: string;
  mileage: number;
}>;

export type ListingParseResult = ListingFields & { missing: ListingField[] };

// Exactly these two hosts. Subdomains (m., img., …) are not on the list: each one is an extra
// origin the proxy would fetch from, and none is needed to read a listing page.
const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['sgcarmart.com', 'www.sgcarmart.com']);
const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 200;
// The WHATWG URL parser silently strips tabs/newlines inside a URL, so reject them
// (and any other control or space character) before parsing.
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f]/;

/** True only for https URLs whose host is exactly sgcarmart.com or www.sgcarmart.com. */
export function isAllowedSgcarmartUrl(input: unknown): boolean {
  try {
    if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URL_LENGTH) return false;
    if (CONTROL_OR_SPACE.test(input)) return false;
    // WHATWG reads a backslash as '/' for https, so 'evil.com\.sgcarmart.com' would reach evil.com.
    if (input.includes('\\')) return false;
    const url = new URL(input);
    if (url.protocol !== 'https:') return false;
    if (url.username !== '' || url.password !== '') return false;
    if (url.port !== '') return false; // only the default 443 (normalised to '')
    // WHATWG percent-decodes the host, so 'www%2Esgcarmart.com' would parse as a listed host.
    // Refuse any percent sign in the authority; a real sgcarmart URL never has one.
    const authority = input.slice(input.indexOf('//') + 2).split(/[/?#]/, 1)[0];
    if (authority.includes('%')) return false;
    const host = url.hostname;
    if (host.endsWith('.')) return false;
    return ALLOWED_HOSTS.has(host);
  } catch {
    return false;
  }
}

// ---------- shared value helpers ----------

// "$$47,800" (RSC escapes "$" as "$$"), "S$47,800", "$33,419", "69,030 km (8.3k /yr)".
// Must START with a number after the optional currency, so "COE till 07/2030" is rejected.
// Comma groups must be exactly three digits, and the number must not run on into an exponent
// ("1e5") or a stray comma or dot: such text is refused, not read as a shorter number.
const AMOUNT = /^\s*(?:S?\$+\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?![eE][+-]?\d|[\d,.])/;
/** Largest car price or running figure we accept (S$10m). Anything above is treated as a misread. */
const MAX_AMOUNT = 10_000_000;

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = AMOUNT.exec(raw);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT ? n : undefined;
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

// ---------- COE expiry ----------
// The date the COE runs out. Sources, best first:
//   1. an explicit date: "COE till 07/2030", "COE expiry 12-Mar-2029" (a month alone means its last day);
//   2. a time left: "1yr 7mths 24days COE left" (sgcarmart's coe_left key);
//   3. the registration date + 10 years. Used only while that date is still ahead: a reg-date COE that
//      already ran out means the car renewed its COE, so the computed date would be wrong.
// Every candidate must fall on a real date in 1990..2100 and no more than ~10 years from `now`.

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const COE_MAX_YEARS = 10;
const COE_MAX_MONTHS_TOKEN = 11; // "3yrs 14mths" is a misread
const COE_MAX_DAYS_TOKEN = 31;
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;
const PHRASE_WINDOW = 48;

// One date as sgcarmart or a user writes it: 2029-03-12, 12-Mar-2029, 12 March 2029, 12/03/2029.
const DATE_TOKEN = String.raw`\d{4}-\d{2}-\d{2}|\d{1,2}[ \-/]+[A-Za-z]{3,9}[ \-/]+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}`;
// "COE till 07/2030" is month-only, so it has its own alternative (groups: 1 date, 2 month, 3 year).
const EXPLICIT_COE = new RegExp(
  String.raw`\bCOE\s+(?:expiry|expires?|expiring|till|until|valid\s+(?:till|until))\b[\s:\-]*(?:(${DATE_TOKEN})|(\d{1,2})\/(\d{4}))`,
  'i',
);
const REG_DATE_TEXT = new RegExp(String.raw`\breg(?:istration)?\s*date\b[\s:\-]*(${DATE_TOKEN})`, 'i');
const COE_LEFT_PHRASE = /\bCOE\s+left\b/gi;
const UNIT = String.raw`(?:y(?:ears?|rs?)|m(?:onths?|ths?)|d(?:ays?)?)(?![A-Za-z])`;
const DURATION_ITEM = String.raw`(?<!\d)\d{1,2}\s*${UNIT}`;
// "1yr 7mths 24days COE left": the run of durations right before the phrase (optionally after a '(').
const DURATION_BEFORE = new RegExp(String.raw`(?:${DURATION_ITEM}\s*)+\(?\s*$`, 'i');
// "COE left: 9yrs 2mths": the run right after the phrase.
const DURATION_AFTER = new RegExp(String.raw`^\s*:?\s*\(?\s*(?:${DURATION_ITEM}\s*)+`, 'i');
const DURATION_PART = /(\d{1,2})\s*([ymd])/gi;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ISO YYYY-MM-DD for a real calendar date in 1990..2100, otherwise undefined. */
function isoDate(year: number, month: number, day: number): string | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1) return undefined;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return undefined;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** A DATE_TOKEN (ISO, "12-Mar-2029", "12/03/2029") as ISO YYYY-MM-DD. */
function dateFromToken(raw: string): string | undefined {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = /^(\d{1,2})[ \-/]+([A-Za-z]{3,9})[ \-/]+(\d{4})$/.exec(s);
  if (named) {
    const month = MONTH_NAMES.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    return month > 0 ? isoDate(Number(named[3]), month, Number(named[1])) : undefined;
  }
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return dmy ? isoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) : undefined;
}

/**
 * The local calendar date of `now`, moved by whole months then days. Arithmetic runs in UTC so the
 * result is the same in every timezone. The day is clamped to the target month (31 Jan + 1 month = 28 Feb).
 */
function shiftDate(now: Date, months: number, days: number): string | undefined {
  const y = now.getFullYear();
  const mo = now.getMonth() + months;
  const firstOfTarget = new Date(Date.UTC(y, mo, 1));
  const ty = firstOfTarget.getUTCFullYear();
  const tm = firstOfTarget.getUTCMonth();
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(ty, tm, Math.min(now.getDate(), lastDay) + days));
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Keeps an ISO date only if it is no more than a COE's maximum life (plus a month of slack) from now. */
function plausibleExpiry(iso: string | undefined, now: Date): string | undefined {
  const limit = shiftDate(now, COE_MAX_YEARS * 12, 31);
  return iso !== undefined && limit !== undefined && iso <= limit ? iso : undefined;
}

function durationYmd(run: string): { years: number; months: number; days: number } | undefined {
  const out = { years: 0, months: 0, days: 0 };
  let seen = false;
  for (const m of run.matchAll(DURATION_PART)) {
    seen = true;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 'y') out.years = n;
    else if (unit === 'm') out.months = n;
    else out.days = n;
  }
  return seen ? out : undefined;
}

/** "COE till 07/2030" or "COE expiry 12-Mar-2029" anywhere in `text`. */
function explicitCoeExpiry(text: string, now: Date): string | undefined {
  const m = EXPLICIT_COE.exec(text);
  if (!m) return undefined;
  let iso: string | undefined;
  if (m[1] !== undefined) {
    iso = dateFromToken(m[1]);
  } else {
    const year = Number(m[3]);
    const month = Number(m[2]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    iso = isoDate(year, month, lastDay);
  }
  return plausibleExpiry(iso, now);
}

/** "1yr 7mths 24days COE left" (either side of the phrase) becomes today + that span. */
function coeLeftExpiry(text: string, now: Date): string | undefined {
  for (const m of text.matchAll(COE_LEFT_PHRASE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const run =
      DURATION_BEFORE.exec(text.slice(Math.max(0, start - PHRASE_WINDOW), start))?.[0] ??
      DURATION_AFTER.exec(text.slice(end, end + PHRASE_WINDOW))?.[0];
    const span = run === undefined ? undefined : durationYmd(run);
    if (!span) continue;
    if (
      span.years > COE_MAX_YEARS ||
      span.months > COE_MAX_MONTHS_TOKEN ||
      span.days > COE_MAX_DAYS_TOKEN
    ) {
      return undefined;
    }
    return plausibleExpiry(shiftDate(now, span.years * 12 + span.months, span.days), now);
  }
  return undefined;
}

/** Registration date + 10 years, kept only while it is still in the future. */
function regDateCoeExpiry(regDate: string | undefined, now: Date): string | undefined {
  const reg = regDate === undefined ? undefined : dateFromToken(regDate);
  if (reg === undefined) return undefined;
  const expiry = isoDate(Number(reg.slice(0, 4)) + COE_MAX_YEARS, Number(reg.slice(5, 7)), Number(reg.slice(8, 10)));
  const today = shiftDate(now, 0, 0);
  if (expiry === undefined || today === undefined || expiry < today) return undefined;
  return plausibleExpiry(expiry, now);
}

/** Best COE expiry from a text: explicit date, then time left, then reg date + 10 years. */
function coeExpiryFromText(text: string, now: Date): string | undefined {
  return (
    explicitCoeExpiry(text, now) ??
    coeLeftExpiry(text, now) ??
    regDateCoeExpiry(REG_DATE_TEXT.exec(text)?.[1], now)
  );
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

// Each <h1> is matched inside a bounded window, so hostile input (thousands of unclosed <h1>)
// costs a fixed amount per candidate instead of a scan to the end of the page on every start.
const H1_WINDOW = 4096;
const H1_MAX_CANDIDATES = 32;
const H1_TITLE = /^<h1\b[^>]{0,500}?class="[^"]{0,500}?title[^"]{0,500}"[^>]{0,500}>([\s\S]*?)<\/h1>/i;
const H1_ANY = /^<h1\b[^>]{0,500}>([\s\S]*?)<\/h1>/i;

function h1Candidates(html: string): string[] {
  const open = /<h1\b/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while (out.length < H1_MAX_CANDIDATES && (m = open.exec(html)) !== null) {
    out.push(html.slice(m.index, m.index + H1_WINDOW));
  }
  return out;
}

/** The class="…title…" heading if there is one, otherwise the first heading. */
function h1Name(html: string): string | undefined {
  const candidates = h1Candidates(html);
  let inner: string | undefined;
  for (const c of candidates) {
    const m = H1_TITLE.exec(c);
    if (m) {
      inner = m[1];
      break;
    }
  }
  if (inner === undefined) {
    for (const c of candidates) {
      const m = H1_ANY.exec(c);
      if (m) {
        inner = m[1];
        break;
      }
    }
  }
  return inner === undefined ? undefined : cleanName(inner);
}

/**
 * Parses a saved sgcarmart listing page. Never throws. `now` anchors "COE left" and reg-date maths
 * (defaults to the current time; injectable for tests).
 */
export function parseListingHtml(html: unknown, now: Date = new Date()): ListingParseResult {
  try {
    if (typeof html !== 'string') return assemble({});
    const payload = decodeRscPayload(html);
    const make = payloadString(payload, 'make');
    const model = payloadString(payload, 'model');
    const name =
      h1Name(html) ?? (make && model ? cleanName(`${make} ${model}`) : undefined);
    const year = payloadYear(payload, 'manufactured') ?? parseYear(payloadString(payload, 'reg_date'));
    // Title first ("… (COE till 07/2030)"), then the page's coe_left ("3yrs 8mths 16days COE left"),
    // then the registration date.
    const coeExpiry =
      explicitCoeExpiry(name ?? '', now) ??
      coeLeftExpiry(payloadString(payload, 'coe_left') ?? '', now) ??
      regDateCoeExpiry(payloadString(payload, 'reg_date'), now);
    return assemble({
      name,
      year,
      price: parseAmount(payloadString(payload, 'price')),
      omv: parseAmount(payloadString(payload, 'omv')),
      arf: parseAmount(payloadString(payload, 'arf')),
      coe: parseAmount(payloadString(payload, 'coe')),
      coeExpiry,
      mileage: parseAmount(payloadString(payload, 'mileage')),
    });
  } catch {
    return assemble({});
  }
}

// ---------- pasted text ----------

type TextKey = 'name' | 'price' | 'omv' | 'arf' | 'coe' | 'mileage' | 'year' | 'regDate';

// A line that starts with a name label: "Name: …", "Title: …" or "Model: …".
const NAME_LABEL = /^(?:name|title|model)\s*:/i;

// Labels read anywhere in a line, followed by an optional ':' and the value. Word-bounded, so
// "Coeur" or "pricelist" is not a label. Each pattern is literal text plus at most one whitespace
// run, so scanning stays linear on hostile input.
const INLINE_LABELS: ReadonlyArray<{ key: Exclude<TextKey, 'name'>; re: RegExp }> = [
  { key: 'price', re: /\bprice\b/gi },
  { key: 'omv', re: /\bomv\b/gi },
  { key: 'arf', re: /\barf\b/gi },
  { key: 'coe', re: /\bcoe\b/gi },
  { key: 'mileage', re: /\bmileage\b/gi },
  { key: 'year', re: /\b(?:manufactured|year)\b/gi },
  { key: 'regDate', re: /\breg(?:istration)?\s*date\b/gi },
];

/** Characters read after a money or year label at most. Longer than any accepted amount. */
const VALUE_WINDOW = 40;

const MONEY_KEYS: ReadonlySet<TextKey> = new Set(['price', 'omv', 'arf', 'coe', 'mileage']);

interface LabelHit {
  key: TextKey;
  index: number;
  end: number;
}

/** Every label in a line, left to right. A name label counts only at the start of the line. */
function labelHits(line: string): LabelHit[] {
  const hits: LabelHit[] = [];
  const name = NAME_LABEL.exec(line);
  if (name) hits.push({ key: 'name', index: 0, end: name[0].length });
  for (const { key, re } of INLINE_LABELS) {
    for (const m of line.matchAll(re)) {
      const index = m.index ?? 0;
      hits.push({ key, index, end: index + m[0].length });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/**
 * The text after a label, up to the next label or the end of the line. Trailing separators before
 * the next label are dropped, so "Price $65,000, OMV $17,984" reads $65,000.
 */
function valueAfter(line: string, hit: LabelHit, next: LabelHit | undefined): string {
  const stop = next ? next.index : line.length;
  let seg = line.slice(hit.end, stop).replace(/^[\s:\-–]+/, '');
  seg = seg.slice(0, hit.key === 'name' ? MAX_NAME_LENGTH * 2 : VALUE_WINDOW);
  if (next) {
    let end = seg.length;
    while (end > 0 && /[\s,;|·•]/.test(seg[end - 1])) end--;
    seg = seg.slice(0, end);
  }
  return seg.trim();
}

// "COE: 9yrs 2mths" would read as a COE price of S$9 without this: a time span is never a price.
const COE_TIME_SPAN = /^\d+\s*(?:yrs?|years?|mths?|months?|days?)(?![A-Za-z])/i;

function valueAccepted(key: TextKey, value: string): boolean {
  if (key === 'name') return value.length > 0;
  if (key === 'year' || key === 'regDate') return parseYear(value) !== undefined;
  if (key === 'coe' && COE_TIME_SPAN.test(value)) return false;
  return MONEY_KEYS.has(key) && parseAmount(value) !== undefined;
}

/** A line about the COE's time left or expiry date, not the listing name ("1yr 7mths COE left"). */
const COE_PHRASE_LINE = /\bCOE\s+(?:left|expir\w*)\b/i;

/**
 * Parses listing details pasted as text. Accepts "Label: value", "Label value", labels anywhere in a
 * line ("Price $65,000 OMV $17,984 ARF $7,984 COE $49,822"), and a label whose value is on the next
 * line. COE expiry is read from "COE till 07/2030", "COE expiry 12-Mar-2029", "1yr 7mths COE left"
 * or the registration date. `now` anchors the time-left maths. Never throws.
 */
export function parseListingText(text: unknown, now: Date = new Date()): ListingParseResult {
  try {
    if (typeof text !== 'string') return assemble({});
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const hitsByLine = lines.map((l) => labelHits(l));

    // Index of the first non-blank line after each line: a label can take its value from there.
    const nextNonBlank: number[] = new Array<number>(lines.length);
    let following = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      nextNonBlank[i] = following;
      if (lines[i] !== '') following = i;
    }

    const raw: Partial<Record<TextKey, string>> = {};
    // Lines that gave an accepted value. They are labelled, so they are never taken as the name.
    const usedLines = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      const hits = hitsByLine[i];
      for (let h = 0; h < hits.length; h++) {
        const hit = hits[h];
        let value = valueAfter(lines[i], hit, hits[h + 1]);
        if (value === '' && h === hits.length - 1 && nextNonBlank[i] !== -1) {
          value = lines[nextNonBlank[i]];
        }
        if (raw[hit.key] === undefined && valueAccepted(hit.key, value)) {
          raw[hit.key] = value;
          usedLines.add(i);
        }
      }
    }

    // Name without a label: first line with a letter that carries no label.
    const nameFallback = lines.find(
      (l, i) =>
        l !== '' &&
        !usedLines.has(i) &&
        !hitsByLine[i].some((h) => h.index === 0) &&
        !COE_PHRASE_LINE.test(l) &&
        /[A-Za-z]/.test(l),
    );
    const name = raw.name ?? nameFallback;

    return assemble({
      name: name ? name.slice(0, MAX_NAME_LENGTH) : undefined,
      year: parseYear(raw.year) ?? parseYear(raw.regDate),
      price: parseAmount(raw.price),
      omv: parseAmount(raw.omv),
      arf: parseAmount(raw.arf),
      coe: parseAmount(raw.coe),
      coeExpiry: coeExpiryFromText(text, now),
      mileage: parseAmount(raw.mileage),
    });
  } catch {
    return assemble({});
  }
}
