// Blog data access. The site and the teenybase API live in ONE Worker, so
// server-side rendering calls the API in-process (no network hop, no CORS);
// the browser/admin uses relative `/api/...` fetches.
import { callApi, type TeenyBindings } from '../server/teeny';

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  cover_image?: string | null;
  body: string;
  tags: string[];
  published?: boolean | number;
  published_at?: string | null;
  created?: string;
  updated?: string;
  author_id?: string;
}

export interface Runtime {
  env: TeenyBindings;
  ctx: ExecutionContext;
}

function safeJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return v.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

// teenybase list/select responses vary by extension; accept the common shapes.
function extractRows(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.records ?? data?.items ?? data?.data ?? data?.results ?? data?.rows ?? [];
}

function normalize(row: any): Post {
  return { ...row, tags: safeJsonArray(row?.tags) } as Post;
}

async function apiJson(path: string, runtime: Runtime): Promise<any> {
  const res = await callApi(path, runtime.env, runtime.ctx);
  if (!res.ok) throw new Error(`Blog API ${path} -> ${res.status}`);
  return res.json();
}

/** Published posts, newest first. Returns [] on failure so pages can degrade. */
export async function listPosts(runtime: Runtime, limit = 50): Promise<Post[]> {
  const where = encodeURIComponent('published = true');
  const order = encodeURIComponent('published_at desc');
  try {
    const data = await apiJson(`/api/v1/table/posts/list?where=${where}&order=${order}&limit=${limit}`, runtime);
    return extractRows(data).map(normalize);
  } catch (e) {
    console.error('listPosts failed:', e);
    return [];
  }
}

/** A single published post by slug, or null if not found / on failure. */
export async function getPostBySlug(runtime: Runtime, slug: string): Promise<Post | null> {
  const safe = slug.replace(/"/g, '');
  const where = encodeURIComponent(`slug = "${safe}" & published = true`);
  try {
    const data = await apiJson(`/api/v1/table/posts/list?where=${where}&limit=1`, runtime);
    return extractRows(data).map(normalize)[0] ?? null;
  } catch (e) {
    console.error('getPostBySlug failed:', e);
    return null;
  }
}

export function formatDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
