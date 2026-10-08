// Long-lived admin API tokens, stored hashed on the minting user's `meta`
// JSON (existing users.meta column — no D1 migration). Plaintext is returned
// once at mint time and never written or logged.
import { sha256Hex, timingSafeEqual, randomToken, tokenPrefix } from './crypto';

export const TOKEN_SCOPES = ['content:read', 'content:write', 'content:publish', 'files:upload'] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export interface StoredToken {
  id: string;
  name: string;
  hash: string;
  prefix: string;
  scopes: TokenScope[];
  created_at: string;
  last_used_at: string | null;
}

export interface TokenListItem {
  id: string;
  name: string;
  prefix: string;
  scopes: TokenScope[];
  created_at: string;
  last_used_at: string | null;
}

export interface UserMeta {
  api_tokens?: StoredToken[];
  [key: string]: unknown;
}

export interface D1Stmt {
  bind(...args: unknown[]): D1Stmt;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(sql: string): D1Stmt;
}

function parseMeta(raw: unknown): UserMeta {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw as UserMeta;
  try { return JSON.parse(String(raw)) || {}; } catch { return {}; }
}

function publicItem(t: StoredToken): TokenListItem {
  return {
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    scopes: t.scopes,
    created_at: t.created_at,
    last_used_at: t.last_used_at,
  };
}

async function loadUser(db: D1Like, userId: string): Promise<{ id: string; meta: UserMeta } | null> {
  const row = await db.prepare('SELECT id, meta FROM users WHERE id = ?').bind(userId).first<{ id: string; meta: unknown }>();
  if (!row) return null;
  return { id: row.id, meta: parseMeta(row.meta) };
}

async function saveMeta(db: D1Like, userId: string, meta: UserMeta): Promise<void> {
  await db.prepare('UPDATE users SET meta = ? WHERE id = ?').bind(JSON.stringify(meta), userId).run();
}

export async function listTokens(db: D1Like, userId: string): Promise<TokenListItem[]> {
  const user = await loadUser(db, userId);
  return (user?.meta.api_tokens || []).map(publicItem);
}

export async function mintToken(
  db: D1Like,
  userId: string,
  name: string,
): Promise<{ token: string; item: TokenListItem }> {
  const label = String(name || '').trim();
  if (!label) throw new Error('name is required');
  if (label.length > 80) throw new Error('name is too long');

  const user = await loadUser(db, userId);
  if (!user) throw new Error('user not found');

  const plaintext = randomToken();
  const rec: StoredToken = {
    id: crypto.randomUUID(),
    name: label,
    hash: await sha256Hex(plaintext),
    prefix: tokenPrefix(plaintext),
    scopes: [...TOKEN_SCOPES],
    created_at: new Date().toISOString(),
    last_used_at: null,
  };
  const tokens = user.meta.api_tokens || [];
  tokens.push(rec);
  user.meta.api_tokens = tokens;
  await saveMeta(db, userId, user.meta);
  return { token: plaintext, item: publicItem(rec) };
}

export async function revokeToken(db: D1Like, userId: string, tokenId: string): Promise<boolean> {
  const user = await loadUser(db, userId);
  if (!user) return false;
  const before = user.meta.api_tokens || [];
  const after = before.filter((t) => t.id !== tokenId);
  if (after.length === before.length) return false;
  user.meta.api_tokens = after;
  await saveMeta(db, userId, user.meta);
  return true;
}

export interface ResolvedToken {
  userId: string;
  tokenId: string;
  scopes: TokenScope[];
}

/** Look up a bearer token across users. Updates last_used_at on match. */
export async function resolveApiToken(db: D1Like, bearer: string): Promise<ResolvedToken | null> {
  if (!bearer.startsWith('anks_')) return null;
  const hash = await sha256Hex(bearer);
  const res = await db.prepare('SELECT id, meta FROM users').all<{ id: string; meta: unknown }>();
  const rows = res?.results || [];
  for (const row of rows) {
    const meta = parseMeta(row.meta);
    const tokens = meta.api_tokens || [];
    for (const t of tokens) {
      if (!t.hash) continue;
      if (await timingSafeEqual(t.hash, hash)) {
        t.last_used_at = new Date().toISOString();
        try { await saveMeta(db, row.id, meta); } catch { /* last-used is best-effort */ }
        return { userId: row.id, tokenId: t.id, scopes: t.scopes?.length ? t.scopes : [...TOKEN_SCOPES] };
      }
    }
  }
  return null;
}
