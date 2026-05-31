// llms-full.txt — the complete site content as plain text for language models.
// Reads from the live CMS (getContent) so it stays in sync with whatever is
// published, and includes the blog and links feed.
import type { APIRoute } from 'astro';
import { getContent } from '../lib/content';
import { listPosts, formatDate } from '../lib/blog';
import { listLinks, linkHost } from '../lib/links';

export const prerender = false;

const stripHtml = (s: string) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const GET: APIRoute = async (ctx) => {
  const content = await getContent(ctx);
  const site = content.site || {};
  const hero = content.hero || {};
  const about = content.about || {};
  const experience = content.experience || {};
  const projects = content.projects || {};
  const skills = content.skills || {};
  const education = content.education || {};
  const custom = content.custom || {};

  const cfctx = (ctx.locals as any)?.cfContext;
  const [posts, links] = await Promise.all([
    listPosts(cfctx, 100).catch(() => []),
    listLinks(cfctx, 100).catch(() => []),
  ]);

  const lines: string[] = [];
  const name = site.fullName || site.name;

  lines.push(`# ${name}`, '');
  if (hero.description) lines.push(`> ${stripHtml(hero.description)}`, '');
  lines.push(`- Site: https://anks.in`, `- Blog: https://anks.in/blog`, `- Links: https://anks.in/links`);
  if (site.email) lines.push(`- Email: ${site.email}`);
  (site.social || []).forEach((s: any) => lines.push(`- ${s.label}: ${s.url}`));
  lines.push('');

  if (about.paragraphs?.length) {
    lines.push(`## About`, '');
    about.paragraphs.forEach((p: string) => lines.push(stripHtml(p)));
    lines.push('');
  }

  if (experience.jobs?.length) {
    lines.push(`## Experience`, '');
    experience.jobs.forEach((job: any) => {
      lines.push(`### ${job.role}${job.company ? ` at ${job.company}` : ''}`);
      if (job.dateRange) lines.push(stripHtml(job.dateRange));
      if (job.location) lines.push(job.location);
      if (job.description) lines.push(stripHtml(job.description));
      if (job.tech?.length) lines.push(`Tech: ${job.tech.join(', ')}`);
      lines.push('');
    });
  }

  if (projects.items?.length) {
    lines.push(`## Projects`, '');
    projects.items.forEach((proj: any) => {
      lines.push(`### ${proj.title}`);
      if (proj.subtitle) lines.push(proj.subtitle);
      if (proj.description) lines.push(stripHtml(proj.description));
      if (proj.tech?.length) lines.push(`Tech: ${proj.tech.join(', ')}`);
      const url = proj.links?.[0]?.url;
      if (url) lines.push(`Link: ${url}`);
      lines.push('');
    });
  }

  if (skills.categories?.length) {
    lines.push(`## Skills`, '');
    skills.categories.forEach((cat: any) => lines.push(`**${cat.name}:** ${(cat.items || []).join(', ')}`));
    lines.push('');
  }

  // Education: new schools[] shape, with fallback to the legacy single-degree shape.
  const schools = education.schools?.length
    ? education.schools
    : (education.degree ? [{ degree: education.degree, institution: education.institution, dateRange: education.dateRange, highlights: education.highlights }] : []);
  if (schools.length) {
    lines.push(`## Education`, '');
    schools.forEach((s: any) => {
      lines.push(`**${s.degree}**`);
      if (s.institution) lines.push(s.institution);
      if (s.dateRange) lines.push(stripHtml(s.dateRange));
      (s.highlights || []).forEach((h: any) => lines.push(`- ${h.text}`));
      lines.push('');
    });
  }

  // Custom sections authored from the admin.
  const customSecs = (custom.sections || []).filter((s: any) => s && s.enabled !== false && s.heading);
  customSecs.forEach((s: any) => {
    lines.push(`## ${s.heading}`, '');
    if (s.body) lines.push(stripHtml(s.body));
    (s.cards || []).forEach((c: any) => {
      if (c.title) lines.push(`### ${c.title}`);
      if (c.text) lines.push(stripHtml(c.text));
    });
    lines.push('');
  });

  if (posts.length) {
    lines.push(`## Blog posts`, '');
    posts.forEach((p) => {
      lines.push(`### ${p.title}`);
      if (p.published_at) lines.push(formatDate(p.published_at));
      if (p.excerpt) lines.push(stripHtml(p.excerpt));
      lines.push(`https://anks.in/blog/${p.slug}`, '');
    });
  }

  if (links.length) {
    lines.push(`## Links shared`, '');
    links.forEach((l) => {
      lines.push(`- ${l.title} — ${l.url}${linkHost(l.url) ? ` (${linkHost(l.url)})` : ''}`);
      if (l.note) lines.push(`  ${stripHtml(l.note)}`);
    });
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
};
