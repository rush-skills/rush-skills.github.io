// Mounts the entire teenybase Hono app under /api/* of the Astro Worker.
// Every HTTP method is forwarded; teenybase owns routing from /api/v1 down,
// including the PocketUI admin at /api/v1/pocket/ and file uploads.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getTeenyApp } from '../../server/teeny';

const handler: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  if (!runtime?.env) {
    return new Response('Cloudflare runtime unavailable', { status: 500 });
  }
  return getTeenyApp().fetch(request, runtime.env, runtime.ctx) as Response | Promise<Response>;
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
