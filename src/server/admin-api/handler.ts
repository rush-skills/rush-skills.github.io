// Bot-friendly admin API: content read/write/publish, image upload, token mint.
// Authorized by session JWT or a minted API token (Bearer). Token values are
// never written to logs or error bodies.
import type { ExecCtx } from '../teeny';
import { authenticate, hasScope, type Principal } from './auth';
import { listTokens, mintToken, revokeToken, type D1Like } from './tokens';
import { getSection, listSections, saveDraft, publishSection, mergeDraft, isSection } from './content';
import { putImage, type R2Like } from './upload';
import { SECTIONS } from '../../lib/content';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function d1(env: any): D1Like | null {
  return env?.PRIMARY_DB ?? null;
}

function r2(env: any): R2Like | null {
  return env?.FILES ?? null;
}

function pathParts(url: URL): string[] {
  return url.pathname.replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean);
}

async function readJson(request: Request): Promise<any> {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

function requireScope(p: Principal, scope: Parameters<typeof hasScope>[1]): Response | null {
  if (hasScope(p, scope)) return null;
  return json({ error: 'forbidden' }, 403);
}

export async function handleAdminApi(
  request: Request,
  env: any,
  ctx?: ExecCtx,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' } });
  }

  const db = d1(env);
  const files = r2(env);
  const url = new URL(request.url);
  const parts = pathParts(url);

  const principal = await authenticate(request, db, ctx);
  if (!principal) return json({ error: 'unauthorized' }, 401);
  if (!db) return json({ error: 'database unavailable' }, 503);

  try {
    // --- tokens (session only) ------------------------------------------------
    if (parts[0] === 'tokens') {
      if (principal.kind !== 'session') return json({ error: 'session required to manage tokens' }, 403);
      if (parts.length === 1 && request.method === 'GET') {
        return json({ tokens: await listTokens(db, principal.userId) });
      }
      if (parts.length === 1 && request.method === 'POST') {
        const body = await readJson(request);
        const minted = await mintToken(db, principal.userId, body.name);
        return json({
          token: minted.token,
          ...minted.item,
          warning: 'This token is shown once. Store it now — it cannot be recovered.',
        }, 201);
      }
      if (parts.length === 2 && request.method === 'DELETE') {
        const ok = await revokeToken(db, principal.userId, parts[1]);
        return ok ? json({ ok: true }) : json({ error: 'not found' }, 404);
      }
      return json({ error: 'not found' }, 404);
    }

    // --- upload ---------------------------------------------------------------
    if (parts[0] === 'upload' && parts.length === 1 && request.method === 'POST') {
      const denied = requireScope(principal, 'files:upload');
      if (denied) return denied;
      if (!files) return json({ error: 'file storage unavailable' }, 503);
      const ct = request.headers.get('content-type') || '';
      if (!ct.includes('multipart/form-data')) return json({ error: 'expected multipart/form-data' }, 400);
      const form = await request.formData();
      const file = (form.get('file') || form.get('image') || form.get('cover_image')) as File | null;
      if (!file || typeof (file as File).arrayBuffer !== 'function') {
        return json({ error: 'missing file field (use file, image, or cover_image)' }, 400);
      }
      const stored = await putImage(files, file);
      return json(stored, 201);
    }

    // --- content --------------------------------------------------------------
    if (parts[0] === 'content') {
      if (parts.length === 1 && request.method === 'GET') {
        const denied = requireScope(principal, 'content:read');
        if (denied) return denied;
        return json({ sections: await listSections(db) });
      }

      const section = parts[1];
      if (!section || !isSection(section)) {
        return json({ error: `unknown section; expected one of: ${SECTIONS.join(', ')}` }, 404);
      }

      if (parts.length === 2 && request.method === 'GET') {
        const denied = requireScope(principal, 'content:read');
        if (denied) return denied;
        return json(await getSection(db, section));
      }

      if (parts.length === 2 && request.method === 'PUT') {
        const denied = requireScope(principal, 'content:write');
        if (denied) return denied;
        const body = await readJson(request);
        const wrapped = body && typeof body === 'object' && 'draft' in body
          && Object.keys(body).every((k) => k === 'draft' || k === 'section');
        const draft = wrapped ? body.draft : body;
        return json(await saveDraft(db, section, draft));
      }

      if (parts.length === 2 && request.method === 'PATCH') {
        const denied = requireScope(principal, 'content:write');
        if (denied) return denied;
        const body = await readJson(request);
        const current = await getSection(db, section);
        const patch = body.merge ?? body.draft ?? ((body.append || body.itemsAppend) ? {} : body);
        const append = body.append || (body.itemsAppend ? { items: body.itemsAppend } : undefined);
        const next = mergeDraft(current?.draft ?? current?.published ?? {}, patch, append);
        return json(await saveDraft(db, section, next));
      }

      if (parts.length === 3 && parts[2] === 'publish' && request.method === 'POST') {
        const denied = requireScope(principal, 'content:publish');
        if (denied) return denied;
        const text = await request.text();
        let data: any = undefined;
        if (text) {
          try {
            const body = JSON.parse(text);
            data = body && typeof body === 'object' && 'draft' in body && Object.keys(body).length === 1
              ? body.draft
              : (Object.keys(body).length ? body : undefined);
          } catch { return json({ error: 'invalid JSON' }, 400); }
        }
        return json(await publishSection(db, section, data));
      }
    }

    return json({ error: 'not found' }, 404);
  } catch (err) {
    const status = (err as any)?.status || 400;
    const message = err instanceof Error ? err.message : 'request failed';
    // Never echo secrets — messages here are our own validation errors.
    return json({ error: message }, status);
  }
}
