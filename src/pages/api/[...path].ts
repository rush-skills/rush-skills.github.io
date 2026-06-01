// Mounts the entire teenybase Hono app under /api/* of the Astro Worker.
// Every HTTP method is forwarded; teenybase owns routing from /api/v1 down,
// including the PocketUI admin at /api/v1/pocket/ and file uploads.
export const prerender = false;

import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { getTeenyApp } from '../../server/teeny';

const handler: APIRoute = async ({ request, locals }) => {
  const ctx = (locals as any).cfContext;
  return getTeenyApp().fetch(request, env as any, ctx) as Response | Promise<Response>;
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
