// Page-view beacon: a tiny, public POST that atomically bumps a per-path counter
// in D1. Called via navigator.sendBeacon from real browsers (so JS-less crawlers
// don't count). Writes go straight to D1 (not the teenybase API), so there's no
// public write rule on the `views` table and the count can't be tampered with via
// the API. Always returns 204 so it never surfaces an error to the page.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

const NO_CONTENT = () => new Response(null, { status: 204 });

function clean(p: string | null): string | null {
  if (!p) return null;
  let path = p.split('?')[0].split('#')[0];
  if (!path.startsWith('/') || path.length > 256) return null;
  // Skip non-content paths and anything with a file extension (assets, feeds).
  if (/^\/(admin|api|beacon|og|_)/.test(path)) return null;
  if (/\.[a-z0-9]+$/i.test(path) && path !== '/') return null;
  // Collapse trailing slash (except root) so "/blog" and "/blog/" share a row.
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

export const POST: APIRoute = async ({ url }) => {
  try {
    const path = clean(url.searchParams.get('p'));
    const db = (env as any)?.PRIMARY_DB;
    if (!path || !db) return NO_CONTENT();
    await db
      .prepare('INSERT INTO views (id, path, count) VALUES (?, ?, 1) ON CONFLICT(path) DO UPDATE SET count = count + 1')
      .bind(crypto.randomUUID(), path)
      .run();
  } catch { /* analytics must never break the page */ }
  return NO_CONTENT();
};
