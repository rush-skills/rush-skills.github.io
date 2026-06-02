#!/usr/bin/env node
// One-time post-deploy sync of the LIVE D1 content for changes that live in data,
// not code:
//   1. nav: point "Blog" -> #blog and "Links" -> #links (so they scroll to the
//      home-page sections and join the scroll-spy; the teasers' "View all"
//      buttons still link to /blog and /links).
//   2. projects: add each project's cover `image` path (matched by title) to the
//      committed screenshots under public/projects/.
//
// Requires Cloudflare auth for `wrangler --remote`: set CLOUDFLARE_API_TOKEN
// (with D1 edit permission) or run `wrangler login` first.
//
// Safe by default: DRY RUN prints what would change. Pass --apply to write.
// Read-modify-write only touches the specific fields; everything else is kept.
//
//   node scripts/sync-live-content.mjs            # preview
//   node scripts/sync-live-content.mjs --apply    # write to prod D1
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const DB = 'anksin-db';
const APPLY = process.argv.includes('--apply');

// title -> screenshot slug (see public/projects/<slug>.jpg)
const SLUG = {
  'ComicAdda': 'comicadda',
  'Dubai Deals': 'dubai-deals',
  'iJewel Studio': 'ijewel-studio',
  'SquareCubed': 'squarecubed',
  'WSC': 'wsc',
  'Cloudflare Cost Calculator': 'cloudflare-cost-calculator',
  'VisTracer': 'vistracer',
  'EnergyGrade': 'energygrade',
  'HireLoom': 'hireloom',
  'Mouve': 'mouve',
};

const wrangler = (args) =>
  execFileSync('npx', ['wrangler', 'd1', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function readRows() {
  const out = wrangler(['execute', DB, '--remote', '--json', '--command',
    "SELECT id, section, published, draft FROM content WHERE section IN ('site','projects')"]);
  const parsed = JSON.parse(out);
  const results = Array.isArray(parsed) ? (parsed[0]?.results ?? []) : (parsed.results ?? []);
  const map = {};
  for (const r of results) map[r.section] = r;
  return map;
}

const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// Apply transforms to a parsed section doc; returns a short change log.
function transformSite(doc) {
  const log = [];
  for (const n of doc?.nav ?? []) {
    if (n.label === 'Blog' && n.href !== '#blog') { n.href = '#blog'; log.push('nav Blog -> #blog'); }
    if (n.label === 'Links' && n.href !== '#links') { n.href = '#links'; log.push('nav Links -> #links'); }
  }
  return log;
}
function transformProjects(doc) {
  const log = [];
  for (const it of doc?.items ?? []) {
    const slug = SLUG[it.title];
    const want = slug ? `/projects/${slug}.jpg` : null;
    if (want && it.image !== want) { it.image = want; log.push(`${it.title} -> ${want}`); }
    else if (!slug) log.push(`(skip, no screenshot) ${it.title}`);
  }
  return log;
}

const sqlEsc = (obj) => JSON.stringify(obj).replace(/'/g, "''");

function main() {
  const rows = readRows();
  if (!rows.site && !rows.projects) {
    console.error('No site/projects rows returned — check auth (CLOUDFLARE_API_TOKEN) and DB binding.');
    process.exit(1);
  }
  const statements = [];
  for (const section of ['site', 'projects']) {
    const row = rows[section];
    if (!row) { console.log(`(${section}: no row found, skipping)`); continue; }
    const published = parse(row.published);
    const draft = parse(row.draft);
    const xf = section === 'site' ? transformSite : transformProjects;
    const log = published ? xf(published) : [];
    if (draft) xf(draft); // keep draft in step with published
    console.log(`\n[${section}] ${log.length ? log.join('; ') : 'no changes needed'}`);
    if (published && log.length) {
      const pub = sqlEsc(published);
      const drf = draft ? sqlEsc(draft) : pub;
      statements.push(`UPDATE content SET published='${pub}', draft='${drf}' WHERE id='${row.id}';`);
    }
  }
  if (!statements.length) { console.log('\nNothing to update. Live content already in sync.'); return; }
  if (!APPLY) { console.log(`\nDRY RUN — ${statements.length} update(s) ready. Re-run with --apply to write.`); return; }
  const file = '/tmp/sync-live-content.sql';
  writeFileSync(file, statements.join('\n') + '\n');
  wrangler(['execute', DB, '--remote', '--file', file]);
  console.log(`\nApplied ${statements.length} update(s) to production D1.`);
}
main();
