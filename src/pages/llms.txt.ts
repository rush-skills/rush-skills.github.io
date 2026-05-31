// llms.txt — a concise, link-rich summary for language models (the "AI SEO"
// counterpart to robots.txt/sitemap). Reads from the live CMS so it reflects
// whatever is currently published.
import type { APIRoute } from 'astro';
import { getContent } from '../lib/content';
import { listPosts } from '../lib/blog';

export const prerender = false;

const stripHtml = (s: string) =>
  String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export const GET: APIRoute = async (ctx) => {
  const content = await getContent(ctx);
  const site = content.site || {};
  const hero = content.hero || {};

  const name = site.fullName || site.name;
  const posts = await listPosts((ctx.locals as any)?.cfContext, 10).catch(() => []);

  const lines = [
    `# ${name}`,
    '',
    hero.description ? `> ${stripHtml(hero.description)}` : '',
    '',
    `- Site: https://anks.in`,
    site.email ? `- Email: ${site.email}` : '',
    ...(site.social || []).map((s: any) => `- ${s.label}: ${s.url}`),
    '',
    `## Pages`,
    '',
    `- [Home](https://anks.in/): about, experience, projects, skills, education`,
    `- [Blog](https://anks.in/blog): writing on engineering and infrastructure ([RSS](https://anks.in/rss.xml))`,
    `- [Links](https://anks.in/links): shared articles and videos ([RSS](https://anks.in/links.xml))`,
    '',
    `## About`,
    '',
    `${name} is a fullstack and infrastructure engineer based in Bangalore, India with 8+ years of experience across distributed systems, cloud infrastructure, and product development. Previously at CERN, Tower Research Capital, and Myntra. Currently consulting through TheServerlessDev.`,
    '',
  ];

  if (posts.length) {
    lines.push(`## Recent posts`, '');
    posts.slice(0, 10).forEach((p) => lines.push(`- [${p.title}](https://anks.in/blog/${p.slug})`));
    lines.push('');
  }

  lines.push(`## Full content`, '', `For the complete site content as plain text, see https://anks.in/llms-full.txt`);

  return new Response(lines.filter((l) => l !== undefined).join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
};
