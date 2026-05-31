// Minimal RSS 2.0 generation — no dependency, full control. Used by /rss.xml
// (blog) and /links.xml (links feed).

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface RssItem {
  title: string;
  link: string;
  guid?: string;
  description?: string;
  pubDate?: string | null;
  categories?: string[];
}

export interface RssChannel {
  title: string;
  link: string;       // site URL for this feed's HTML page
  feedUrl: string;    // absolute URL of this XML
  description: string;
  items: RssItem[];
}

function toRfc822(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toUTCString();
}

export function renderRss(ch: RssChannel): string {
  const items = ch.items
    .map((it) => {
      const date = toRfc822(it.pubDate);
      return [
        '    <item>',
        `      <title>${esc(it.title)}</title>`,
        `      <link>${esc(it.link)}</link>`,
        `      <guid isPermaLink="false">${esc(it.guid || it.link)}</guid>`,
        date ? `      <pubDate>${date}</pubDate>` : '',
        it.description ? `      <description>${esc(it.description)}</description>` : '',
        ...(it.categories || []).map((c) => `      <category>${esc(c)}</category>`),
        '    </item>',
      ].filter(Boolean).join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(ch.title)}</title>
    <link>${esc(ch.link)}</link>
    <atom:link href="${esc(ch.feedUrl)}" rel="self" type="application/rss+xml" />
    <description>${esc(ch.description)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

export function rssResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
}
