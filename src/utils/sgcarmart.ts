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

function valueAccepted(key: TextKey, value: string): boolean {
  if (key === 'name') return value.length > 0;
  if (key === 'year' || key === 'regDate') return parseYear(value) !== undefined;
  return MONEY_KEYS.has(key) && parseAmount(value) !== undefined;
}

/**
 * Parses listing details pasted as text. Accepts "Label: value", "Label value", labels anywhere in a
 * line ("Price $65,000 OMV $17,984 ARF $7,984 COE $49,822"), and a label whose value is on the next
 * line. Never throws.
 */
export function parseListingText(text: unknown): ListingParseResult {
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
      (l, i) => l !== '' && !usedLines.has(i) && !hitsByLine[i].some((h) => h.index === 0) && /[A-Za-z]/.test(l),
    );
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
