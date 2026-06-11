// Dynamic sitemap. Every page here is server-rendered (prerender=false), so
// Astro's build-time sitemap integration finds nothing — we generate our own,
// listing the static pages plus a URL for each published blog post.
import type { APIRoute } from 'astro';
import { listPosts } from '../lib/blog';
import { getContent } from '../lib/content';
import { projectSlug } from '../lib/slug';

export const prerender = false;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async (ctx) => {
  const { locals, site } = ctx;
  const base = (site?.toString() || 'https://anks.in/').replace(/\/$/, '');
  const posts = await listPosts((locals as any).cfContext);
  const content = await getContent(ctx);
  const projectItems: any[] = content.projects?.enabled !== false ? content.projects?.items || [] : [];

  const urls: { loc: string; lastmod?: string; priority?: string }[] = [
    { loc: `${base}/`, priority: '1.0' },
    { loc: `${base}/blog`, priority: '0.8' },
    { loc: `${base}/links`, priority: '0.6' },
    { loc: `${base}/cv`, priority: '0.6' },
    ...posts.map((p) => ({
      loc: `${base}/blog/${p.slug}`,
      lastmod: (p.updated || p.published_at || undefined)?.slice(0, 10),
      priority: '0.7',
    })),
    ...projectItems
      .map((p) => projectSlug(p))
      .filter(Boolean)
      .map((s) => ({ loc: `${base}/projects/${s}`, priority: '0.6' })),
  ];

  const body = urls
    .map((u) =>
      [
        '  <url>',
        `    <loc>${esc(u.loc)}</loc>`,
        u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
        u.priority ? `    <priority>${u.priority}</priority>` : '',
        '  </url>',
      ].filter(Boolean).join('\n'),
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
};
