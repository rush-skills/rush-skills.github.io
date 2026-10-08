// Bot-friendly admin API (content, publish, upload, tokens). More specific
// than /api/[...path], so teenybase never sees these routes.
export const prerender = false;

import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { handleAdminApi } from '../../../server/admin-api/handler';

const handler: APIRoute = async ({ request, locals }) => {
  const ctx = (locals as any).cfContext;
  return handleAdminApi(request, env as any, ctx);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
