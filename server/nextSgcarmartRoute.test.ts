import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNextSgcarmartRoute } from './nextSgcarmartRoute';
import audiHtml from '../src/utils/__fixtures__/sgcarmart-audi-a4-1551328.html?raw';

const AUDI = 'https://www.sgcarmart.com/used-cars/info/audi-a4-20a-tfsi-1551328/';
const OTHER = 'https://www.sgcarmart.com/used-cars/info/honda-vezel-15a-x-1551624/';

function htmlFetch() {
  return vi.fn(async () => new Response(audiHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
}

function getRequest(target: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/api/sgcarmart?url=${encodeURIComponent(target)}`, { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createNextSgcarmartRoute', () => {
  it('returns 200 JSON with the parsed listing, then serves the repeat from cache', async () => {
    const fetchImpl = htmlFetch();
    const route = createNextSgcarmartRoute({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const first = await route(getRequest(AUDI));
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(first.headers.get('x-cache')).toBe('MISS');
    const body = (await first.json()) as { ok: boolean; url: string; fields: Record<string, unknown>; missing: string[] };
    expect(body.ok).toBe(true);
    expect(body.url).toBe(AUDI);
    expect(Array.isArray(body.missing)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const second = await route(getRequest(AUDI));
    expect(second.status).toBe(200);
    expect(second.headers.get('x-cache')).toBe('HIT');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns 400 invalid_url for a non-sgcarmart target without fetching', async () => {
    const fetchImpl = htmlFetch();
    const route = createNextSgcarmartRoute({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await route(getRequest('http://169.254.169.254/'));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: 'invalid_url' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 405 with Allow: GET for POST and does not fetch', async () => {
    const fetchImpl = htmlFetch();
    const route = createNextSgcarmartRoute({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await route(new Request(`http://localhost/api/sgcarmart?url=${encodeURIComponent(AUDI)}`, { method: 'POST' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
    expect(await res.json()).toMatchObject({ ok: false, error: 'method_not_allowed' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps the proxy headers on success and on error', async () => {
    const route = createNextSgcarmartRoute({ fetchImpl: htmlFetch() as unknown as typeof fetch });
    const ok = await route(getRequest(AUDI));
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(ok.headers.get('x-cache')).toBe('MISS');

    const bad = await route(getRequest(OTHER.replace('www.sgcarmart.com', 'evil.example')));
    expect(bad.status).toBe(400);
    expect(bad.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(bad.headers.get('cache-control')).toBe('no-store');
  });

  it('rate-limits per x-real-ip on Vercel, and ignores forwarded headers elsewhere', async () => {
    const fetchImpl = htmlFetch();
    const route = createNextSgcarmartRoute({ fetchImpl: fetchImpl as unknown as typeof fetch, now: () => 1_000_000 });

    vi.stubEnv('VERCEL', '1');
    const a = await route(getRequest(AUDI, { 'x-real-ip': '203.0.113.1' }));
    const b = await route(getRequest(OTHER, { 'x-real-ip': '203.0.113.2' }));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    // Same client IP again, a different listing, inside the interval: rate-limited.
    const c = await route(getRequest('https://www.sgcarmart.com/used-cars/info/another-1/', { 'x-real-ip': '203.0.113.1' }));
    expect(c.status).toBe(429);
    expect(c.headers.get('retry-after')).toBeTruthy();
  });
});
