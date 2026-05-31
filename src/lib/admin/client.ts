// Browser-side client for the teenybase API (same origin: /api/v1).
// Handles JWT auth + generic table CRUD + file upload. Used by the /admin SPA.

const API = '/api/v1';
const TOKEN_KEY = 'anksin_admin_token';
const USER_KEY = 'anksin_admin_user';

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  username?: string;
  role?: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function isAuthed(): boolean {
  return !!getToken();
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || data?.error || `Request failed (${res.status})`;
    throw new ApiError(typeof msg === 'string' ? msg : JSON.stringify(msg), res.status);
  }
  return data as T;
}

// teenybase response rows come back under one of several keys.
function rows(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.records ?? data?.items ?? data?.data ?? data?.results ?? data?.rows ?? [];
}
function oneRecord(data: any): any {
  return data?.record ?? data?.data ?? (Array.isArray(data) ? data[0] : data);
}

// --- Auth -------------------------------------------------------------------
export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await request('/table/users/auth/login-password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token = data.token || data.accessToken || data.access_token;
  if (!token) throw new ApiError('No token in login response', 500);
  const record = data.record || data.user || {};
  const user: AuthUser = {
    id: record.id || data.id,
    email: record.email || email,
    name: record.name,
    username: record.username,
    role: record.role,
  };
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

// --- Generic table CRUD -----------------------------------------------------
export interface ListOpts {
  where?: string;
  order?: string;
  limit?: number;
  offset?: number;
}

export async function list(table: string, opts: ListOpts = {}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (opts.where) qs.set('where', opts.where);
  if (opts.order) qs.set('order', opts.order);
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  if (opts.offset != null) qs.set('offset', String(opts.offset));
  const q = qs.toString();
  return rows(await request(`/table/${table}/list${q ? `?${q}` : ''}`));
}

export async function view(table: string, id: string): Promise<any> {
  return oneRecord(await request(`/table/${table}/view/${encodeURIComponent(id)}`));
}

export async function insert(table: string, values: Record<string, any>): Promise<any> {
  return oneRecord(await request(`/table/${table}/insert`, {
    method: 'POST',
    body: JSON.stringify({ values }),
  }));
}

export async function edit(table: string, id: string, values: Record<string, any>): Promise<any> {
  // NB: teenybase's edit takes fields at the top level, unlike insert which wraps
  // them in { values }. Sending { values } makes it treat `values` as a column.
  return oneRecord(await request(`/table/${table}/edit/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify(values),
  }));
}

export async function remove(table: string, id: string): Promise<void> {
  await request(`/table/${table}/delete`, {
    method: 'POST',
    body: JSON.stringify({ where: `id = "${id.replace(/"/g, '')}"` }),
  });
}

// --- CMS content sections ---------------------------------------------------
// Each section is one row in the `content` table with `draft` + `published` JSON.
// SSR reads `published` straight from D1; the admin edits `draft` and promotes it.

function parseMaybe(v: any): any {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

export interface SectionRow { id?: string; draft: any; published: any }

export async function getSection(section: string): Promise<SectionRow | null> {
  const found = await list('content', { where: `section = "${section}"`, limit: 1 });
  const r = found[0];
  if (!r) return null;
  return { id: r.id, draft: parseMaybe(r.draft), published: parseMaybe(r.published) };
}

/** Save the working copy (preview only — does not change the live site). */
export async function saveSectionDraft(section: string, data: any): Promise<void> {
  const draft = JSON.stringify(data ?? {});
  const existing = await getSection(section);
  if (existing?.id) await edit('content', existing.id, { draft });
  else await insert('content', { section, draft, published: draft });
}

/** Promote the working copy to live (sets both published and draft). */
export async function publishSection(section: string, data: any): Promise<void> {
  const payload = JSON.stringify(data ?? {});
  const existing = await getSection(section);
  if (existing?.id) await edit('content', existing.id, { draft: payload, published: payload });
  else await insert('content', { section, draft: payload, published: payload });
}

// --- File upload (R2 via teenybase file field) ------------------------------
// Uploads through a table's file field. Returns the stored file path/key which
// can be referenced as cover_image or an inline image URL.
export async function uploadFile(table: string, field: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.append(field, file);
  const data = await request(`/table/${table}/upload`, { method: 'POST', body: fd });
  return data?.url || data?.path || data?.key || oneRecord(data)?.[field] || '';
}
