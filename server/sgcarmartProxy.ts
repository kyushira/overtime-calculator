/**
 * Dev/preview-only proxy so the browser can import a sgcarmart listing without CORS.
 *
 *   GET /api/sgcarmart?url=<https://…sgcarmart.com/…>
 *
 * The server validates the target with isAllowedSgcarmartUrl, follows at most three redirects
 * (re-validating each hop), enforces a 10 s timeout and a 2 MB body cap, caches results for
 * 10 minutes, and rate-limits upstream fetches. It parses the page itself and returns JSON only.
 *
 * Written against web-standard APIs and structural request/response types, so it needs no Node
 * type package and type-checks alongside the browser code.
 */
import {
  LISTING_FIELDS,
  isAllowedSgcarmartUrl,
  parseListingHtml,
  type ListingField,
  type ListingFields,
} from '../src/utils/sgcarmart.ts';

export const SGCARMART_PROXY_ROUTE = '/api/sgcarmart';

const DEFAULTS = {
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
  minIntervalMs: 2_000,
  rateLimitMaxClients: 500,
  cacheTtlMs: 10 * 60_000,
  cacheMaxEntries: 50,
} as const;

const LOOPBACK = /^(?:127\.|::1$|::ffff:127\.)/;

// A realistic browser UA: sgcarmart serves a reduced page to unknown clients.
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface SgcarmartProxyOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  minIntervalMs?: number;
  rateLimitMaxClients?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
}

// Structural subset of Node's IncomingMessage / ServerResponse that Vite's connect app passes in.
export interface ProxyRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}
export interface ProxyResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(chunk?: string): unknown;
}
export type ProxyNext = () => void;
export type ProxyHandler = (req: ProxyRequest, res: ProxyResponse, next: ProxyNext) => Promise<void>;

interface SuccessBody {
  ok: true;
  url: string;
  fields: ListingFields;
  missing: ListingField[];
}

interface ErrorBody {
  ok: false;
  error: string;
  upstreamStatus?: number;
  fields: Record<string, never>;
  missing: ListingField[];
}

class ProxyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly upstreamStatus?: number,
  ) {
    super(code);
  }
}

async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // Body already closed or locked; nothing to release.
  }
}

function charsetDecoder(contentType: string): TextDecoder {
  const label = /charset=([^;\s]+)/i.exec(contentType)?.[1]?.replace(/["']/g, '') ?? 'utf-8';
  try {
    return new TextDecoder(label);
  } catch {
    return new TextDecoder('utf-8');
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ProxyError(502, 'upstream_too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Who is asking, for rate-limiting. The socket address, and for a loopback peer (a local tunnel
 * such as cloudflared, which makes every visitor look like 127.0.0.1) the first X-Forwarded-For hop.
 * A non-loopback peer's forwarded header is ignored, so it cannot choose its own bucket.
 * Note: that first hop is set by the client, so through a tunnel it is a fairness key, not an identity.
 */
function clientKey(req: ProxyRequest): string {
  const remote = req.socket?.remoteAddress ?? '';
  if (!LOOPBACK.test(remote)) return remote;
  const xff = req.headers?.['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim().slice(0, 64);
  return first ? `${remote}|${first}` : remote;
}

/** Cache key for a target: the URL without its fragment, which never reaches the server anyway. */
function cacheKeyFor(target: string): string {
  const url = new URL(target);
  url.hash = '';
  return url.href;
}

export function createSgcarmartHandler(options: SgcarmartProxyOptions = {}): ProxyHandler {
  // Wrapped, not passed bare: calling a detached `fetch` throws "Illegal invocation" in browsers.
  const fetchImpl: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
  const minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
  const rateLimitMaxClients = options.rateLimitMaxClients ?? DEFAULTS.rateLimitMaxClients;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULTS.cacheTtlMs;
  const cacheMaxEntries = options.cacheMaxEntries ?? DEFAULTS.cacheMaxEntries;

  // Insertion-ordered: the first key is the oldest entry, evicted first.
  const cache = new Map<string, { expiresAt: number; body: SuccessBody }>();
  // Last upstream fetch per client, most recent last. Bounded: the oldest client is forgotten first.
  const lastUpstreamByClient = new Map<string, number>();
  // Upstream fetches in progress, by cache key. A duplicate request awaits the same fetch.
  const inFlight = new Map<string, Promise<SuccessBody>>();

  function rememberClient(client: string, t: number): void {
    lastUpstreamByClient.delete(client);
    lastUpstreamByClient.set(client, t);
    while (lastUpstreamByClient.size > rateLimitMaxClients) {
      const oldest = lastUpstreamByClient.keys().next().value;
      if (oldest === undefined) break;
      lastUpstreamByClient.delete(oldest);
    }
  }

  function cacheGet(key: string): SuccessBody | undefined {
    const hit = cache.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now()) {
      cache.delete(key);
      return undefined;
    }
    return hit.body;
  }

  function cacheSet(key: string, body: SuccessBody): void {
    const t = now();
    for (const [k, v] of cache) {
      if (v.expiresAt <= t) cache.delete(k);
    }
    while (cache.size >= cacheMaxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    cache.set(key, { expiresAt: t + cacheTtlMs, body });
  }

  async function fetchListing(start: string): Promise<SuccessBody> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let current = start;
      for (let hop = 0; ; hop++) {
        const res = await fetchImpl(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-SG,en;q=0.8',
          },
        });

        if (REDIRECT_STATUSES.has(res.status)) {
          await discard(res);
          if (hop >= maxRedirects) throw new ProxyError(502, 'too_many_redirects');
          const location = res.headers.get('location');
          if (!location) throw new ProxyError(502, 'upstream_status', res.status);
          let next: string;
          try {
            next = new URL(location, current).href;
          } catch {
            throw new ProxyError(502, 'redirect_blocked');
          }
          // Every hop is checked: a redirect must never reach a host the allow-list rejects.
          if (!isAllowedSgcarmartUrl(next)) throw new ProxyError(502, 'redirect_blocked');
          current = next;
          continue;
        }

        if (!res.ok) {
          await discard(res);
          throw new ProxyError(502, 'upstream_status', res.status);
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
          await discard(res);
          throw new ProxyError(502, 'upstream_not_html');
        }

        const declared = Number(res.headers.get('content-length'));
        if (res.headers.get('content-length') !== null && Number.isFinite(declared) && declared > maxBytes) {
          await discard(res);
          throw new ProxyError(502, 'upstream_too_large');
        }

        const bytes = await readCapped(res, maxBytes);
        const html = charsetDecoder(contentType).decode(bytes);
        const parsed = parseListingHtml(html);
        const { missing, ...fields } = parsed;
        return { ok: true, url: start, fields, missing };
      }
    } catch (err) {
      if (err instanceof ProxyError) throw err;
      if (controller.signal.aborted) throw new ProxyError(504, 'timeout');
      throw new ProxyError(502, 'upstream_error');
    } finally {
      clearTimeout(timer);
    }
  }

  function send(res: ProxyResponse, status: number, body: SuccessBody | ErrorBody, extraHeaders: Record<string, string> = {}): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
    res.end(JSON.stringify(body));
  }

  function fail(res: ProxyResponse, status: number, error: string, extra: Record<string, string> = {}, upstreamStatus?: number): void {
    const body: ErrorBody = {
      ok: false,
      error,
      ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
      fields: {},
      missing: [...LISTING_FIELDS],
    };
    send(res, status, body, extra);
  }

  return async function handle(req, res, next) {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== SGCARMART_PROXY_ROUTE) {
        next();
        return;
      }
      if (req.method !== 'GET') {
        fail(res, 405, 'method_not_allowed', { Allow: 'GET' });
        return;
      }

      const targets = url.searchParams.getAll('url');
      const target = targets.length === 1 ? targets[0] : undefined;
      if (typeof target !== 'string' || !isAllowedSgcarmartUrl(target)) {
        fail(res, 400, 'invalid_url');
        return;
      }
      const key = cacheKeyFor(target);

      const cached = cacheGet(key);
      if (cached) {
        send(res, 200, cached, { 'X-Cache': 'HIT' });
        return;
      }

      // Same listing already being fetched: wait for that fetch rather than starting another or refusing.
      const pending = inFlight.get(key);
      if (pending) {
        send(res, 200, await pending, { 'X-Cache': 'SHARED' });
        return;
      }

      const client = clientKey(req);
      const t = now();
      const last = lastUpstreamByClient.get(client);
      if (last !== undefined && t - last < minIntervalMs) {
        const retryAfter = Math.max(1, Math.ceil((minIntervalMs - (t - last)) / 1000));
        fail(res, 429, 'rate_limited', { 'Retry-After': String(retryAfter) });
        return;
      }
      rememberClient(client, t);

      const started = fetchListing(key)
        .then((body) => {
          cacheSet(key, body);
          return body;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, started);
      send(res, 200, await started, { 'X-Cache': 'MISS' });
    } catch (err) {
      if (err instanceof ProxyError) {
        fail(res, err.status, err.code, {}, err.upstreamStatus);
        return;
      }
      // Log server-side only; the client gets a generic code.
      console.error('[sgcarmart-proxy] unexpected error', err);
      fail(res, 500, 'internal');
    }
  };
}
