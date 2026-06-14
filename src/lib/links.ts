// Links feed data access — the /links stream of shared articles, videos, and
// bookmarks. Same in-process API pattern as the blog (see src/lib/blog.ts).
import { callApi, type ExecCtx } from '../server/teeny';

export interface LinkItem {
  id: string;
  title: string;
  url: string;
  note?: string | null;
  kind?: string | null;
  tags: string[];
  published?: boolean | number;
  published_at?: string | null;
  created?: string;
}

export type Runtime = ExecCtx | undefined;

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

function extractRows(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.records ?? data?.items ?? data?.data ?? data?.results ?? data?.rows ?? [];
}

function normalize(row: any): LinkItem {
  return { ...row, tags: safeJsonArray(row?.tags) } as LinkItem;
}

/** Published links, newest first. Returns [] on failure so the page can degrade. */
export async function listLinks(ctx: Runtime, limit = 100): Promise<LinkItem[]> {
  const where = encodeURIComponent('published = true');
  const order = encodeURIComponent('published_at desc');
  try {
    const res = await callApi(`/api/v1/table/links/list?where=${where}&order=${order}&limit=${limit}`, ctx);
    if (!res.ok) throw new Error(`links API -> ${res.status}`);
    return extractRows(await res.json()).map(normalize);
  } catch (e) {
    console.error('listLinks failed:', e);
    return [];
  }
}

// A friendly hostname for display, e.g. "youtube.com".
export function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export const KIND_LABELS: Record<string, string> = {
  article: 'Article',
  video: 'Video',
  bookmark: 'Bookmark',
  repo: 'Repo',
  tool: 'Tool / Service',
  paper: 'Paper',
  podcast: 'Podcast',
  book: 'Book',
  resource: 'Resource',
};
