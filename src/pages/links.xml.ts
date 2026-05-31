import type { APIRoute } from 'astro';
import { listLinks, linkHost } from '../lib/links';
import { renderRss, rssResponse } from '../lib/rss';

export const prerender = false;

export const GET: APIRoute = async ({ locals, site }) => {
  const base = (site?.toString() || 'https://anks.in/').replace(/\/$/, '');
  const links = await listLinks((locals as any).cfContext);
  const xml = renderRss({
    title: 'Ankur Singh — Links',
    link: `${base}/links`,
    feedUrl: `${base}/links.xml`,
    description: 'Articles, videos, and things worth sharing.',
    // For a link share the item points at the shared URL; note + source host
    // go in the description.
    items: links.map((l) => ({
      title: l.title,
      link: l.url,
      guid: l.id,
      description: [l.note, linkHost(l.url) ? `(${linkHost(l.url)})` : ''].filter(Boolean).join(' '),
      pubDate: l.published_at,
      categories: l.tags,
    })),
  });
  return rssResponse(xml);
};
