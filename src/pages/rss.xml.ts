import type { APIRoute } from 'astro';
import { listPosts } from '../lib/blog';
import { renderRss, rssResponse } from '../lib/rss';

export const prerender = false;

export const GET: APIRoute = async ({ locals, site }) => {
  const base = (site?.toString() || 'https://anks.in/').replace(/\/$/, '');
  const posts = await listPosts((locals as any).cfContext);
  const xml = renderRss({
    title: 'Ankur Singh — Blog',
    link: `${base}/blog`,
    feedUrl: `${base}/rss.xml`,
    description: 'Writing on engineering, infrastructure, and building things.',
    items: posts.map((p) => ({
      title: p.title,
      link: `${base}/blog/${p.slug}`,
      guid: p.id,
      description: p.excerpt || '',
      pubDate: p.published_at,
      categories: p.tags,
    })),
  });
  return rssResponse(xml);
};
