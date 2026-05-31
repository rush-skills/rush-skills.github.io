// teenybase + Astro coexist inside ONE Cloudflare Worker.
//
// teenybase's worker is just a Hono app. We build it here and mount it under
// Astro's `/api/*` route (see src/pages/api/[...path].ts). Public pages call it
// in-process via `app.fetch(...)` — no extra subrequest, same D1/R2 bindings.
import {
  teenyHono,
  $Database,
  D1Adapter,
  OpenApiExtension,
  PocketUIExtension,
} from 'teenybase/worker';
import config from '../../blog-backend/teenybase';

// Local structural types — see src/env.d.ts for why we don't import
// @cloudflare/workers-types globally (DOM global clash with the admin SPA).
type D1DatabaseLike = unknown;
type R2BucketLike = unknown;
export interface ExecCtx {
  waitUntil(p: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface TeenyBindings {
  PRIMARY_DB: D1DatabaseLike;
  FILES?: R2BucketLike;
  [key: string]: unknown;
}

// Hono app is stateless across requests (the DB is rebuilt per request from the
// request context), so we can safely cache the app instance per isolate.
let _app: ReturnType<typeof teenyHono> | null = null;

export function getTeenyApp() {
  if (_app) return _app;
  _app = teenyHono(async (c: any) => {
    const db = new $Database(c, config, new D1Adapter(c.env.PRIMARY_DB), c.env.FILES);
    db.extensions.push(new OpenApiExtension(db, true));
    db.extensions.push(new PocketUIExtension(db));
    return db;
  });
  return _app;
}

/**
 * Call the teenybase API in-process. `path` is an absolute API path like
 * `/api/v1/table/posts/list?...`. Returns the raw Response.
 */
export function callApi(
  path: string,
  env: TeenyBindings,
  ctx: ExecCtx,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(path, 'https://anks.in');
  const req = new Request(url, {
    headers: { Accept: 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  return Promise.resolve(getTeenyApp().fetch(req, env as any, ctx as any));
}
