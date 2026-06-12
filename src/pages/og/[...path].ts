// Generated Open Graph images:
//   /og/site.png            – the site-wide card (home, fallback)
//   /og/post/<slug>.png     – per blog post (title, date, tags)
//   /og/project/<slug>.png  – per project (title, subtitle, tech)
//   /og/page/<name>.png     – blog / links / cv index pages
// On any failure we redirect to the static /og.png so shares always have an
// image. Successful renders are immutable enough to edge-cache for a day.
import type { APIRoute } from 'astro';
import { getContent } from '../../lib/content';
import { getPostBySlug, formatDate } from '../../lib/blog';
import { projectSlug } from '../../lib/slug';
import { renderOgPng, type OgCard } from '../../lib/og';

export const prerender = false;

const PAGES: Record<string, { title: string; subtitle: string }> = {
  blog: { title: 'Blog', subtitle: 'Notes on infrastructure, serverless, and the things I build.' },
  links: { title: 'Links', subtitle: 'Articles, videos, and bookmarks worth remembering.' },
  cv: { title: 'Curriculum Vitae', subtitle: 'Experience, skills, and education — generated from the live site.' },
};

export const GET: APIRoute = async (ctx) => {
  const path = (ctx.params.path || '').replace(/\.png$/, '');
  const [ns, slug] = path === 'site' ? ['site', ''] : path.split('/', 2);

  try {
    const content = await getContent(ctx);
    const site = content.site || {};
    const hero = content.hero || {};
    const theme = content.theme || {};
    const fullName = site.fullName || 'Ankur Singh';
    const base: Pick<OgCard, 'accent' | 'accentLight' | 'font' | 'footerLeft' | 'footerLeftSub'> = {
      accent: theme.dark?.accent,
      accentLight: theme.dark?.['accent-light'],
      font: theme.fonts?.display,
      footerLeft: fullName,
      footerLeftSub: hero.subtitle ? String(hero.subtitle).toLowerCase() : undefined,
    };

    let card: OgCard | null = null;
    if (ns === 'site') {
      card = { ...base, kind: 'Portfolio', title: fullName, subtitle: hero.description || site.description, footerLeft: 'anks.in', footerLeftSub: undefined };
    } else if (ns === 'page' && slug && PAGES[slug]) {
      card = { ...base, kind: slug === 'cv' ? 'CV' : 'Index', ...PAGES[slug] };
    } else if (ns === 'post' && slug) {
      const post = await getPostBySlug((ctx.locals as any).cfContext, slug);
      if (post) {
        card = {
          ...base, kind: 'Blog', title: post.title, subtitle: post.excerpt || undefined,
          meta: [formatDate(post.published_at), ...(post.tags || []).slice(0, 2).map((t: string) => `#${t}`)].filter(Boolean) as string[],
        };
      }
    } else if (ns === 'project' && slug) {
      const items: any[] = content.projects?.items || [];
      const item = items.find((p) => projectSlug(p) === slug);
      if (item) {
        card = { ...base, kind: 'Project', title: item.title, subtitle: item.subtitle || undefined, meta: (item.tech || []).slice(0, 3) };
      }
    }
    if (!card) return new Response('Not found', { status: 404 });

    const png = await renderOgPng(card);
    return new Response(png as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    // Renderer or font fetch failed — fall back to the committed static card.
    return ctx.redirect('/og.png', 302);
  }
};
