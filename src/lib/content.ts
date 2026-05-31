// Server-side content loader — the bridge between the CMS tables in D1 and the
// Astro pages that render them.
//
// Design (see blog-backend/teenybase.ts `content` table):
//   - Every editable region of the site is one row in `content`, keyed by
//     `section`, with `published` (live) and `draft` (preview) JSON snapshots.
//   - The public site reads those rows DIRECTLY from D1 here during SSR — no HTTP
//     round-trip, no RLS — which is why the content API can stay admin-only and
//     drafts never leak.
//   - If the table is empty / missing (a fresh clone, or before migration), every
//     section falls back to the committed YAML in src/data, so the site always
//     renders. That YAML is also the seed: `npm run setup` copies it into D1.
//
// One query per request, cached on Astro.locals, shared by every component.
import { env } from 'cloudflare:workers';
import { load } from './data';

export const SECTIONS = [
  'site', 'theme', 'hero', 'about', 'experience',
  'projects', 'skills', 'education', 'contact', 'custom',
] as const;
export type Section = (typeof SECTIONS)[number];
export type ContentMap = Record<Section, any> & { __preview?: boolean };

// The all-YAML baseline: fallback for any section absent from the DB, and the
// content a brand-new clone renders before it has been seeded.
export function yamlBaseline(): ContentMap {
  const out: any = {};
  for (const s of SECTIONS) out[s] = load(`${s}.yaml`);
  return out;
}

function parseJson(s: unknown): any {
  if (s == null || s === '') return null;
  try { return JSON.parse(String(s)); } catch { return null; }
}

// One query for every section, both snapshots. Returns null when the table can't
// be read (not migrated yet, build-time prerender, no binding) so callers fall
// back to YAML rather than erroring.
async function loadRows(): Promise<Record<string, { draft: any; published: any }> | null> {
  try {
    const db = (env as any)?.PRIMARY_DB;
    if (!db) return null;
    const res = await db.prepare('SELECT section, draft, published FROM content').all();
    const rows: any[] = res?.results || [];
    if (!rows.length) return null;
    const out: Record<string, { draft: any; published: any }> = {};
    for (const row of rows) {
      out[row.section] = { draft: parseJson(row.draft), published: parseJson(row.published) };
    }
    return out;
  } catch {
    return null;
  }
}

// Preview is enabled by the `tb_preview` cookie, which is only ever set by the
// /preview route after it validates the preview token (see src/pages/preview.ts).
export function isPreview(Astro: any): boolean {
  try {
    const cookie = Astro?.request?.headers?.get('cookie') || '';
    return /(?:^|;\s*)tb_preview=/.test(cookie);
  } catch {
    return false;
  }
}

// Load (once per request) the content map the page should render. In preview the
// draft snapshot wins, falling back to published, then YAML; live skips drafts.
export async function getContent(Astro: any): Promise<ContentMap> {
  const locals = (Astro?.locals as any) || {};
  if (locals.__content) return locals.__content;

  const preview = isPreview(Astro);
  const merged: any = yamlBaseline();
  const rows = await loadRows();
  if (rows) {
    for (const s of SECTIONS) {
      const r = rows[s];
      if (!r) continue;
      const val = preview ? (r.draft ?? r.published) : r.published;
      if (val != null) merged[s] = val;
    }
  }
  merged.__preview = preview;
  try { locals.__content = merged; } catch { /* locals frozen — recompute is cheap */ }
  return merged as ContentMap;
}
