// Server-side link metadata fetch for the quick-add page. Fetches the target URL
// on the Worker (no CORS limits) and extracts title/description/image via
// Cloudflare's streaming HTMLRewriter. Gated by reusing teenybase auth (forwards
// the caller's Authorization to an admin-only table) so it isn't an open fetcher.
import type { APIRoute } from 'astro';
import { callApi } from '../../server/teeny';

export const prerender = false;

// HTMLRewriter is a Cloudflare Workers runtime global (also in Miniflare/dev).
declare const HTMLRewriter: any;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' } });

// Defense-in-depth against using the Worker as a fetcher for internal hosts.
function blockedHost(host: string): boolean {
  host = host.toLowerCase();
  return (
    host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.startsWith('[') ||
    host.endsWith('.local') || host.endsWith('.internal') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

export const GET: APIRoute = async ({ request, url, locals }) => {
  // Auth gate: forward the caller's token to an admin-only table; only proceed if accepted.
  const auth = request.headers.get('Authorization') || '';
  const check = await callApi('/api/v1/table/content/list?limit=1', (locals as any).cfContext, { headers: { Authorization: auth } });
  if (!check.ok) return json({ error: 'unauthorized' }, 401);

  let u: URL;
  try { u = new URL(url.searchParams.get('url') || ''); } catch { return json({ error: 'bad url' }, 400); }
  if (!/^https?:$/.test(u.protocol) || blockedHost(u.hostname)) return json({ error: 'blocked' }, 400);

  try {
    const res = await fetch(u.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; anks.in-linkbot/1.0)', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok || !/text\/html|xml/i.test(res.headers.get('content-type') || 'text/html')) return json({ title: '', description: '', image: '' });

    let title = '', ogTitle = '', desc = '', ogDesc = '', ogImage = '';
    const rw = new HTMLRewriter()
      .on('title', { text(t: any) { if (!ogTitle) title += t.text; } })
      .on('meta', { element(el: any) {
        const p = (el.getAttribute('property') || '').toLowerCase();
        const n = (el.getAttribute('name') || '').toLowerCase();
        const c = el.getAttribute('content') || '';
        if (p === 'og:title') ogTitle = c;
        else if (p === 'og:description') ogDesc = c;
        else if (p === 'og:image') ogImage = c;
        else if (n === 'description' && !desc) desc = c;
        else if (n === 'twitter:description' && !desc) desc = c;
      } });
    await rw.transform(res).text(); // run handlers (streaming)

    return json({
      title: (ogTitle || title).replace(/\s+/g, ' ').trim().slice(0, 300),
      description: (ogDesc || desc).replace(/\s+/g, ' ').trim().slice(0, 600),
      image: ogImage.trim(),
    });
  } catch {
    return json({ title: '', description: '', image: '' });
  }
};
