import { describe, expect, it, vi } from 'vitest';
import { createSgcarmartHandler, sgcarmartProxy, type SgcarmartProxyOptions } from './sgcarmartProxy';
import audiHtml from '../src/utils/__fixtures__/sgcarmart-audi-a4-1551328.html?raw';
import hondaHtml from '../src/utils/__fixtures__/sgcarmart-honda-vezel-1551624.html?raw';

const AUDI = 'https://www.sgcarmart.com/used-cars/info/audi-a4-20a-tfsi-1551328/';
const HONDA = 'https://www.sgcarmart.com/used-cars/info/honda-vezel-15a-x-1551624/';
// Never fetched earlier in the same test: a cache hit would skip the rate limiter.
const FRESH = 'https://www.sgcarmart.com/used-cars/info/fresh-listing-1/';

type Responder = (url: string, init?: RequestInit) => Promise<Response> | Response;
interface Client {
  remote?: string;
  xff?: string;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function harness(responder: Responder, options: SgcarmartProxyOptions = {}) {
  let clock = 1_000_000;
  const fetchMock = vi.fn(responder);
  const handler = createSgcarmartHandler({
    fetchImpl: fetchMock as unknown as typeof fetch,
    now: () => clock,
    ...options,
  });
  return {
    fetchMock,
    advance: (ms: number) => {
      clock += ms;
    },
    async get(url: string | undefined, method = 'GET', rawPath?: string, client: Client = {}) {
      const query = url === undefined ? '' : `?url=${encodeURIComponent(url)}`;
      const res = { statusCode: 200, headers: {} as Record<string, string>, body: '' };
      const next = vi.fn();
      await handler(
        {
          method,
          url: rawPath ?? `/api/sgcarmart${query}`,
          headers: client.xff === undefined ? {} : { 'x-forwarded-for': client.xff },
          socket: { remoteAddress: client.remote },
        },
        {
          get statusCode() {
            return res.statusCode;
          },
          set statusCode(v: number) {
            res.statusCode = v;
          },
          setHeader(name: string, value: string) {
            res.headers[name.toLowerCase()] = String(value);
          },
          end(chunk?: string) {
            res.body = chunk ?? '';
          },
        },
        next,
      );
      return { status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : undefined, next };
    },
  };
}

describe('routing', () => {
  it('passes requests for other paths to the next middleware', async () => {
    const h = harness(() => htmlResponse(''));
    const out = await h.get(undefined, 'GET', '/index.html');
    expect(out.json).toBeUndefined();
    expect(out.next).toHaveBeenCalledTimes(1);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('accepts only GET', async () => {
    const h = harness(() => htmlResponse(audiHtml));
    const out = await h.get(AUDI, 'POST');
    expect(out.status).toBe(405);
    expect(out.headers.allow).toBe('GET');
    expect(out.json.ok).toBe(false);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
});

describe('input validation', () => {
  it('returns 400 when the url parameter is missing', async () => {
    const h = harness(() => htmlResponse(audiHtml));
    const out = await h.get(undefined);
    expect(out.status).toBe(400);
    expect(out.json).toMatchObject({ ok: false, error: 'invalid_url' });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'http://www.sgcarmart.com/used-cars/listing',
    'http://127.0.0.1:5281/api/sgcarmart',
    'https://169.254.169.254/latest/meta-data/',
    'https://sgcarmart.com.evil.com/used-cars/info/x/',
    'https://www.sgcarmart.com@evil.com/',
    'https://www.sgcarmart.com:8443/used-cars/listing',
  ])('returns 400 without fetching for %s', async (target) => {
    const h = harness(() => htmlResponse(audiHtml));
    const out = await h.get(target);
    expect(out.status).toBe(400);
    expect(out.json).toMatchObject({ ok: false, error: 'invalid_url' });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the url parameter is repeated', async () => {
    const h = harness(() => htmlResponse(audiHtml));
    const out = await h.get(undefined, 'GET', `/api/sgcarmart?url=${encodeURIComponent(AUDI)}&url=${encodeURIComponent(AUDI)}`);
    expect(out.status).toBe(400);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
});

describe('successful import', () => {
  it('fetches with redirect:manual and a browser User-Agent, then returns parsed JSON', async () => {
    const h = harness(() => htmlResponse(audiHtml));
    const out = await h.get(AUDI);
    expect(out.status).toBe(200);
    expect(out.json).toMatchObject({
      ok: true,
      url: AUDI,
      fields: {
        name: 'Audi A4 2.0A TFSI S-tronic',
        year: 2018,
        price: 47800,
        omv: 33419,
        arf: 38787,
        coe: 33900,
        mileage: 69030,
      },
      missing: [],
    });
    const [calledUrl, init] = h.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(AUDI);
    expect(init.redirect).toBe('manual');
    expect(String((init.headers as Record<string, string>)['User-Agent'])).toMatch(/Mozilla\/5\.0/);
  });

  it('reports the Honda mileage as missing', async () => {
    const h = harness(() => htmlResponse(hondaHtml));
    const out = await h.get(HONDA);
    expect(out.json.missing).toEqual(['mileage']);
    expect(out.json.fields.price).toBe(65000);
  });

  it('serves a repeat request from the cache without a second upstream fetch', async () => {
    const h = harness(() => htmlResponse(audiHtml));
    await h.get(AUDI);
    h.advance(5_000);
    const second = await h.get(AUDI);
    expect(second.status).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache TTL has passed', async () => {
    const h = harness(() => htmlResponse(audiHtml), { cacheTtlMs: 60_000 });
    await h.get(AUDI);
    h.advance(60_001);
    await h.get(AUDI);
    expect(h.fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('redirects', () => {
  it('follows a redirect that stays on the allow-list', async () => {
    const h = harness((url) =>
      url === AUDI ? redirect('/used-cars/info/honda-vezel-15a-x-1551624/') : htmlResponse(hondaHtml),
    );
    const out = await h.get(AUDI);
    expect(out.status).toBe(200);
    expect(out.json.fields.name).toBe('Honda Vezel 1.5A X (COE till 07/2030)');
    expect(h.fetchMock.mock.calls[1][0]).toBe(HONDA);
  });

  it('blocks a redirect to a private address without following it', async () => {
    const h = harness(() => redirect('http://169.254.169.254/latest/meta-data/'));
    const out = await h.get(AUDI);
    expect(out.status).toBe(502);
    expect(out.json).toMatchObject({ ok: false, error: 'redirect_blocked' });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks a redirect that downgrades to plain http', async () => {
    const h = harness(() => redirect('http://www.sgcarmart.com/used-cars/info/x/'));
    const out = await h.get(AUDI);
    expect(out.json.error).toBe('redirect_blocked');
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks a redirect to a lookalike host', async () => {
    const h = harness(() => redirect('https://sgcarmart.com.evil.com/x'));
    const out = await h.get(AUDI);
    expect(out.json.error).toBe('redirect_blocked');
  });

  it('allows up to three redirects', async () => {
    let hop = 0;
    const h = harness((url) => {
      if (hop < 3) {
        hop += 1;
        return redirect(`https://www.sgcarmart.com/hop/${hop}`);
      }
      expect(url).toBe('https://www.sgcarmart.com/hop/3');
      return htmlResponse(audiHtml);
    });
    const out = await h.get(AUDI);
    expect(out.status).toBe(200);
    expect(h.fetchMock).toHaveBeenCalledTimes(4);
  });

  it('gives up after more than three redirects', async () => {
    let hop = 0;
    const h = harness(() => {
      hop += 1;
      return redirect(`https://www.sgcarmart.com/loop/${hop}`);
    });
    const out = await h.get(AUDI);
    expect(out.status).toBe(502);
    expect(out.json.error).toBe('too_many_redirects');
    expect(h.fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('upstream failures', () => {
  it('reports a non-2xx upstream status', async () => {
    const h = harness(() => htmlResponse('<html>gone</html>', 404));
    const out = await h.get(AUDI);
    expect(out.status).toBe(502);
    expect(out.json).toMatchObject({ ok: false, error: 'upstream_status', upstreamStatus: 404 });
  });

  it('rejects a non-HTML response', async () => {
    const h = harness(() => new Response('{"a":1}', { headers: { 'content-type': 'application/json' } }));
    const out = await h.get(AUDI);
    expect(out.json.error).toBe('upstream_not_html');
  });

  it('rejects a declared Content-Length over the cap without reading the body', async () => {
    const h = harness(
      () => new Response('x', { headers: { 'content-type': 'text/html', 'content-length': '999999999' } }),
      { maxBytes: 1024 },
    );
    const out = await h.get(AUDI);
    expect(out.json.error).toBe('upstream_too_large');
  });

  it('aborts a streamed body that exceeds the cap', async () => {
    const chunk = new Uint8Array(600).fill(0x61);
    const h = harness(() => {
      let sent = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= 10) return controller.close();
          sent += 1;
          controller.enqueue(chunk);
        },
      });
      return new Response(body, { headers: { 'content-type': 'text/html' } });
    }, { maxBytes: 2048 });
    const out = await h.get(AUDI);
    expect(out.status).toBe(502);
    expect(out.json.error).toBe('upstream_too_large');
  });

  it('returns 504 when the upstream does not answer within the timeout', async () => {
    const h = harness(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
      { timeoutMs: 20 },
    );
    const out = await h.get(AUDI);
    expect(out.status).toBe(504);
    expect(out.json.error).toBe('timeout');
  });

  it('returns 504 when the body stalls after headers arrive and the timeout fires', async () => {
    const h = harness(
      (_url, init) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
          },
        });
        return new Response(body, { headers: { 'content-type': 'text/html' } });
      },
      { timeoutMs: 20 },
    );
    const out = await h.get(AUDI);
    expect(out.status).toBe(504);
    expect(out.json).toMatchObject({ ok: false, error: 'timeout' });
  });

  it('returns a generic 502 on a network failure', async () => {
    const h = harness(() => {
      throw new TypeError('fetch failed: ECONNRESET at internal/detail');
    });
    const out = await h.get(AUDI);
    expect(out.status).toBe(502);
    expect(out.json).toEqual({
      ok: false,
      error: 'upstream_error',
      fields: {},
      missing: ['name', 'year', 'price', 'omv', 'arf', 'coe', 'mileage'],
    });
  });
});

describe('rate limit', () => {
  it('rejects a second upstream fetch within the interval, then allows it after the interval', async () => {
    const h = harness(() => htmlResponse(audiHtml), { minIntervalMs: 2000 });
    await h.get(AUDI);
    h.advance(500);
    const limited = await h.get(HONDA);
    expect(limited.status).toBe(429);
    expect(limited.json.error).toBe('rate_limited');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    h.advance(2000);
    const allowed = await h.get(HONDA);
    expect(allowed.status).toBe(200);
    expect(h.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not count cache hits against the rate limit', async () => {
    const h = harness(() => htmlResponse(audiHtml), { minIntervalMs: 2000 });
    await h.get(AUDI);
    const hit = await h.get(AUDI);
    expect(hit.status).toBe(200);
  });

  it('one client being throttled does not 429 a different client', async () => {
    const h = harness(() => htmlResponse(audiHtml), { minIntervalMs: 2000 });
    await h.get(AUDI, 'GET', undefined, { remote: '198.51.100.1' });
    const other = await h.get(HONDA, 'GET', undefined, { remote: '198.51.100.2' });
    expect(other.status).toBe(200);
    const same = await h.get(FRESH, 'GET', undefined, { remote: '198.51.100.1' });
    expect(same.status).toBe(429);
  });

  it('ignores X-Forwarded-For from a non-loopback client (cannot be spoofed to dodge the limit)', async () => {
    const h = harness(() => htmlResponse(audiHtml), { minIntervalMs: 2000 });
    await h.get(AUDI, 'GET', undefined, { remote: '198.51.100.9', xff: '10.1.1.1' });
    const spoofed = await h.get(FRESH, 'GET', undefined, { remote: '198.51.100.9', xff: '10.1.1.2' });
    expect(spoofed.status).toBe(429);
  });

  it('uses the first X-Forwarded-For hop for a loopback tunnel, so tunnel clients are told apart', async () => {
    const h = harness(() => htmlResponse(audiHtml), { minIntervalMs: 2000 });
    await h.get(AUDI, 'GET', undefined, { remote: '127.0.0.1', xff: '203.0.113.1, 10.0.0.1' });
    const second = await h.get(HONDA, 'GET', undefined, { remote: '127.0.0.1', xff: '203.0.113.2' });
    expect(second.status).toBe(200);
    const again = await h.get(FRESH, 'GET', undefined, { remote: '127.0.0.1', xff: '203.0.113.1' });
    expect(again.status).toBe(429);
  });

  it('forgets the oldest client once the bounded client table is full', async () => {
    const other = 'https://www.sgcarmart.com/used-cars/info/other/';
    const h = harness((url) => htmlResponse(url === AUDI ? audiHtml : hondaHtml), {
      minIntervalMs: 2000,
      rateLimitMaxClients: 2,
    });
    await h.get(AUDI, 'GET', undefined, { remote: '10.0.0.1' });
    await h.get(HONDA, 'GET', undefined, { remote: '10.0.0.2' });
    await h.get(other, 'GET', undefined, { remote: '10.0.0.3' });
    const evicted = await h.get(FRESH, 'GET', undefined, { remote: '10.0.0.1' });
    expect(evicted.status).toBe(200);
  });
});

describe('shared in-flight fetches and cache key', () => {
  it('lets concurrent requests for the same listing share one upstream fetch instead of 429ing', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = harness(async () => {
      await gate;
      return htmlResponse(audiHtml);
    }, { minIntervalMs: 2000 });
    const first = h.get(AUDI);
    const second = h.get(AUDI, 'GET', undefined, { remote: '198.51.100.5' });
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('strips the URL fragment, so a #hash variant hits the same cache entry', async () => {
    const h = harness(() => htmlResponse(audiHtml));
    await h.get(AUDI);
    const hashed = await h.get(`${AUDI}#gallery`);
    expect(hashed.headers['x-cache']).toBe('HIT');
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(h.fetchMock.mock.calls[0][0]).toBe(AUDI);
  });
});

describe('response hygiene', () => {
  it('marks every response no-store and nosniff', async () => {
    const h = harness(() => htmlResponse(audiHtml));
    const ok = await h.get(AUDI);
    const bad = await h.get('http://127.0.0.1/');
    for (const out of [ok, bad]) {
      expect(out.headers['cache-control']).toBe('no-store');
      expect(out.headers['x-content-type-options']).toBe('nosniff');
      expect(out.headers['content-type']).toMatch(/application\/json/);
    }
  });

  it('only exposes the documented keys in error bodies', async () => {
    const h = harness(() => {
      throw new Error('internal secret detail');
    });
    const out = await h.get(AUDI);
    expect(Object.keys(out.json).sort()).toEqual(['error', 'fields', 'missing', 'ok']);
    expect(JSON.stringify(out.json)).not.toContain('internal secret detail');
  });
});

describe('sgcarmartProxy Vite plugin', () => {
  it('mounts the same middleware on the dev and preview servers', () => {
    const plugin = sgcarmartProxy();
    const devUse = vi.fn();
    const previewUse = vi.fn();
    (plugin.configureServer as unknown as (s: unknown) => void)({ middlewares: { use: devUse } });
    (plugin.configurePreviewServer as unknown as (s: unknown) => void)({ middlewares: { use: previewUse } });
    expect(devUse).toHaveBeenCalledTimes(1);
    expect(previewUse).toHaveBeenCalledTimes(1);
    expect(typeof devUse.mock.calls[0][0]).toBe('function');
  });
});
