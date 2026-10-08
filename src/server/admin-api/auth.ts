// Authenticate /api/admin requests: session JWT (logged-in admin) or a minted
// API token. API tokens never get token-management privileges.
import { callApi, type ExecCtx } from '../teeny';
import { resolveApiToken, type TokenScope, type D1Like } from './tokens';

export type Principal =
  | { kind: 'session'; userId: string }
  | { kind: 'token'; userId: string; tokenId: string; scopes: TokenScope[] };

function bearer(request: Request): string | null {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(\S+)/i);
  return m ? m[1] : null;
}

function rows(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.records ?? data?.items ?? data?.data ?? data?.results ?? data?.rows ?? [];
}

export async function authenticate(
  request: Request,
  db: D1Like | null,
  ctx?: ExecCtx,
): Promise<Principal | null> {
  const token = bearer(request);
  if (!token) return null;

  if (token.startsWith('anks_')) {
    if (!db) return null;
    const resolved = await resolveApiToken(db, token);
    if (!resolved) return null;
    return { kind: 'token', ...resolved };
  }

  // Session JWT — ask teenybase who this is (users.list is scoped to auth.uid).
  try {
    const res = await callApi('/api/v1/table/users/list?limit=1', ctx, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const user = rows(data)[0];
    if (!user?.id) return null;
    return { kind: 'session', userId: String(user.id) };
  } catch {
    return null;
  }
}

export function hasScope(p: Principal, scope: TokenScope): boolean {
  if (p.kind === 'session') return true;
  return p.scopes.includes(scope);
}
