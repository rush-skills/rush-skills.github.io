// Lightweight search index for the ⌘K palette: published posts, links, projects,
// and the site's main pages/sections. Small JSON (content volume is modest), so
// the palette fetches it once and filters client-side — no FTS infra needed.
import type { APIRoute } from 'astro';
import { listPosts, formatDate } from '../lib/blog';
import { listLinks, linkHost } from '../lib/links';
import { getContent } from '../lib/content';
import { projectSlug } from '../lib/slug';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const runtime = (ctx.locals as any).cfContext;
  const [posts, links, content] = await Promise.all([
    listPosts(runtime, 100),
    listLinks(runtime, 200),
    getContent(ctx),
  ]);
  const projects: any[] = content.projects?.enabled !== false ? content.projects?.items || [] : [];
  const site = content.site || {};
  const name = site.fullName || 'Ankur Singh';
  const role = (content.hero?.subtitle || '').toString();

  const items: any[] = [
    { type: 'page', title: 'Home', url: '/', text: `${name} ${role} portfolio home` },
    { type: 'page', title: 'Projects', url: '/projects', text: 'all projects index portfolio work' },
    { type: 'page', title: 'Blog', url: '/blog', text: 'writing posts articles' },
    { type: 'page', title: 'Links', url: '/links', text: 'bookmarks feed' },
    { type: 'page', title: 'CV / Résumé', url: '/cv', text: 'curriculum vitae resume experience skills education download pdf' },
    { type: 'page', title: 'About', url: '/#about', text: `${name} bio about` },
    { type: 'page', title: 'Experience', url: '/#experience', text: 'work jobs career' },
    { type: 'page', title: 'Skills', url: '/#skills', text: 'technologies stack' },
    { type: 'page', title: 'Contact', url: '/#contact', text: `email get in touch ${site.email || ''}` },
  ];

  for (const p of posts) items.push({ type: 'post', title: p.title, sub: p.excerpt || '', url: `/blog/${p.slug}`, text: (p.tags || []).join(' '), meta: formatDate(p.published_at) });
  for (const l of links) items.push({ type: 'link', title: l.title, sub: l.note || linkHost(l.url), url: l.url, external: true, text: (l.tags || []).join(' ') });
  for (const p of projects) items.push({ type: 'project', title: p.title, sub: p.subtitle || '', url: `/projects/${projectSlug(p)}`, text: `${(p.tech || []).join(' ')} ${p.description || ''}`, meta: p.status || '' });

  return new Response(JSON.stringify({ items }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=86400',
    },
  });
};
