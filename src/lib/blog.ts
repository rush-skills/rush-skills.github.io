// Client for the teenybase blog API (deployed at anksinblog.theserverless.dev).
// Response envelope + where-clause syntax are handled defensively and will be
// confirmed against the live backend after first deploy.
const API_BASE = (import.meta.env.BLOG_API_BASE ?? 'https://anksinblog.theserverless.dev').replace(/\/$/, '');
const API = `${API_BASE}/api/v1`;

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  cover_image?: string | null;
  body: string;
  tags: string[];
  published?: boolean;
  published_at?: string | null;
  created?: string;
  updated?: string;
  author_id?: string;
}

function safeJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// teenybase list/select responses vary by extension; accept the common shapes.
function extractRows(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.records ?? data?.data ?? data?.results ?? data?.rows ?? [];
}

function normalize(row: any): Post {
  return { ...row, tags: safeJsonArray(row?.tags) } as Post;
}

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Blog API ${path} -> ${res.status}`);
  return res.json();
}

/** Published posts, newest first. Returns [] on failure so pages can degrade. */
export async function listPosts(limit = 50): Promise<Post[]> {
  const where = encodeURIComponent('published = true');
  const order = encodeURIComponent('published_at desc');
  try {
    const data = await getJson(`/table/posts/list?where=${where}&order=${order}&limit=${limit}`);
    return extractRows(data).map(normalize);
  } catch (e) {
    console.error('listPosts failed:', e);
    return [];
  }
}

/** A single published post by slug, or null if not found / on failure. */
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const safe = slug.replace(/"/g, '');
  const where = encodeURIComponent(`slug = "${safe}" & published = true`);
  try {
    const data = await getJson(`/table/posts/list?where=${where}&limit=1`);
    const rows = extractRows(data).map(normalize);
    return rows[0] ?? null;
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
