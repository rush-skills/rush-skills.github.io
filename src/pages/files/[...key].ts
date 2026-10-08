// Public read of images stored by POST /api/admin/upload (R2). Keys are
// unguessable (uuid + filename); listing is not exposed.
export const prerender = false;

import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { getFile } from '../../server/admin-api/upload';

export const GET: APIRoute = async ({ params }) => {
  const key = params.key || '';
  const files = (env as any)?.FILES;
  if (!files || !key) return new Response('Not found', { status: 404 });
  const obj = await getFile(files, key);
  if (!obj) return new Response('Not found', { status: 404 });
  const type = obj.httpMetadata?.contentType || 'application/octet-stream';
  return new Response(obj.body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
