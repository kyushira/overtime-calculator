/**
 * Adapts the framework-free sgcarmart proxy handler to a web-standard `Request` -> `Response`
 * function, so the Next.js App Router route handler (app/api/sgcarmart/route.ts) can serve it.
 *
 * No Next.js imports here: this file is unit-tested directly with a fake fetch.
 */
import {
  createSgcarmartHandler,
  type ProxyRequest,
  type ProxyResponse,
  type SgcarmartProxyOptions,
} from './sgcarmartProxy';

export type SgcarmartRouteHandler = (request: Request) => Promise<Response>;

/**
 * The client address used for rate-limiting.
 *
 * Only trusted on Vercel, whose edge overwrites x-real-ip / x-forwarded-for, so a visitor cannot
 * forge them there. Elsewhere the peer address is unknown to a web Request, so this returns
 * undefined and every request shares one rate-limit bucket (the proxy then fetches upstream at
 * most once per minIntervalMs per instance). That is the safe default, not a bug to paper over.
 */
function remoteAddressFor(headers: Headers): string | undefined {
  if (!process.env.VERCEL) return undefined;
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const firstHop = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return firstHop || undefined;
}

function headersRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name.toLowerCase()] = value;
  });
  return out;
}

export function createNextSgcarmartRoute(options: SgcarmartProxyOptions = {}): SgcarmartRouteHandler {
  // Built once per route instance: the cache and rate-limit state live in this closure.
  const handle = createSgcarmartHandler(options);

  return async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const proxyRequest: ProxyRequest = {
      method: request.method,
      url: `${url.pathname}${url.search}`,
      headers: headersRecord(request.headers),
      socket: { remoteAddress: remoteAddressFor(request.headers) },
    };

    const outHeaders = new Headers();
    let body = '';
    let passedThrough = false;
    const proxyResponse: ProxyResponse = {
      statusCode: 200,
      setHeader(name, value) {
        outHeaders.set(name, value);
      },
      end(chunk) {
        body = typeof chunk === 'string' ? chunk : '';
      },
    };

    await handle(proxyRequest, proxyResponse, () => {
      passedThrough = true;
    });

    if (passedThrough) {
      // Only reachable if the route is mounted under a different pathname than /api/sgcarmart.
      return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    return new Response(body, { status: proxyResponse.statusCode, headers: outHeaders });
  };
}

/** Process-wide instance: the cache and rate limiter persist across requests on a warm instance. */
export const handleSgcarmartRequest: SgcarmartRouteHandler = createNextSgcarmartRoute();
