import { handleSgcarmartRequest } from '../../../server/nextSgcarmartRoute';

// Proxy fetches upstream per request (cached in-process), so it must never be prerendered or
// statically cached, and needs the Node runtime for fetch timeouts/streams.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET serves the proxy. The other verbs delegate too, so the proxy's own JSON 405 (with Allow: GET)
// is returned instead of Next's default response.
export async function GET(request: Request): Promise<Response> {
  return handleSgcarmartRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleSgcarmartRequest(request);
}

export async function PUT(request: Request): Promise<Response> {
  return handleSgcarmartRequest(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return handleSgcarmartRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleSgcarmartRequest(request);
}
