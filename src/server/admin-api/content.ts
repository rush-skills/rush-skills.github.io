// Direct D1 access to the CMS `content` table — same snapshots the public
// site reads in src/lib/content.ts. Used by the bot-friendly admin API.
import { SECTIONS, type Section } from '../../lib/content';
import type { D1Like } from './tokens';

const SECTION_SET = new Set<string>(SECTIONS);

export function isSection(name: string): name is Section {
  return SECTION_SET.has(name);
}

function parseJson(s: unknown): any {
  if (s == null || s === '') return null;
  if (typeof s === 'object') return s;
  try { return JSON.parse(String(s)); } catch { return null; }
}

export interface SectionSnapshots {
  section: string;
  draft: any;
  published: any;
}

export async function listSections(db: D1Like): Promise<SectionSnapshots[]> {
  const res = await db.prepare('SELECT section, draft, published FROM content').all<{
    section: string; draft: unknown; published: unknown;
  }>();
  const rows = res?.results || [];
  const bySection = new Map<string, SectionSnapshots>();
  for (const row of rows) {
    if (!isSection(row.section)) continue;
    bySection.set(row.section, {
      section: row.section,
      draft: parseJson(row.draft),
      published: parseJson(row.published),
    });
  }
  return SECTIONS.map((s) => bySection.get(s) || { section: s, draft: null, published: null });
}

export async function getSection(db: D1Like, section: string): Promise<SectionSnapshots | null> {
  if (!isSection(section)) return null;
  const row = await db.prepare('SELECT section, draft, published FROM content WHERE section = ?')
    .bind(section)
    .first<{ section: string; draft: unknown; published: unknown }>();
  if (!row) return { section, draft: null, published: null };
  return { section: row.section, draft: parseJson(row.draft), published: parseJson(row.published) };
}

async function upsert(db: D1Like, section: string, draft: string, published: string | null): Promise<void> {
  const existing = await db.prepare('SELECT id FROM content WHERE section = ?').bind(section).first<{ id: string }>();
  if (existing?.id) {
    if (published == null) {
      await db.prepare('UPDATE content SET draft = ? WHERE id = ?').bind(draft, existing.id).run();
    } else {
      await db.prepare('UPDATE content SET draft = ?, published = ? WHERE id = ?').bind(draft, published, existing.id).run();
    }
    return;
  }
  const id = crypto.randomUUID();
  const pub = published ?? draft;
  await db.prepare('INSERT INTO content (id, section, draft, published) VALUES (?, ?, ?, ?)')
    .bind(id, section, draft, pub)
    .run();
}

export async function saveDraft(db: D1Like, section: string, data: any): Promise<SectionSnapshots> {
  if (!isSection(section)) throw new Error('unknown section');
  const draft = JSON.stringify(data ?? {});
  await upsert(db, section, draft, null);
  return (await getSection(db, section))!;
}

export async function publishSection(db: D1Like, section: string, data?: any): Promise<SectionSnapshots> {
  if (!isSection(section)) throw new Error('unknown section');
  let payload = data;
  if (payload === undefined) {
    const current = await getSection(db, section);
    payload = current?.draft ?? current?.published ?? {};
  }
  const json = JSON.stringify(payload ?? {});
  await upsert(db, section, json, json);
  return (await getSection(db, section))!;
}

/** Deep-merge objects; arrays are replaced unless `append` names them. */
export function mergeDraft(base: any, patch: any, append?: Record<string, any[]>): any {
  const out = (base && typeof base === 'object' && !Array.isArray(base))
    ? { ...base }
    : {};
  if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = mergeDraft(out[k], v);
      } else {
        out[k] = v;
      }
    }
  }
  if (append) {
    for (const [k, items] of Object.entries(append)) {
      const cur = Array.isArray(out[k]) ? out[k] : [];
      out[k] = cur.concat(Array.isArray(items) ? items : []);
    }
  }
  return out;
}
