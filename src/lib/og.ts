// Edge-rendered Open Graph cards (1200x630 PNG): satori lays out a small
// element tree with the site's display font, resvg rasterizes the SVG. Both run
// as wasm imported via `?module` (Workers only allows wasm as module imports).
// The card uses the same dark palette + accent the theme defines, so shared
// links look like the site.
import satori, { init as initSatori } from 'satori/wasm';
import initYoga from 'yoga-wasm-web';
import { Resvg, initWasm as initResvg } from '@resvg/resvg-wasm';
// @ts-ignore - resolved by the bundler as a WebAssembly.Module
import yogaWasm from 'yoga-wasm-web/dist/yoga.wasm?module';
// @ts-ignore - resolved by the bundler as a WebAssembly.Module
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm?module';

let ready: Promise<void> | null = null;
function initOnce(): Promise<void> {
  ready ??= (async () => {
    initSatori(await initYoga(yogaWasm as WebAssembly.Module));
    await initResvg(resvgWasm as WebAssembly.Module);
  })();
  return ready;
}

// --- Fonts ------------------------------------------------------------------
// The theme's display font comes from Google Fonts at runtime (same source the
// site itself uses). An old UA makes css2 serve plain TTF, which satori needs
// (it can't read woff2). Cached per isolate.
const fontCache = new Map<string, Promise<{ weight: number; data: ArrayBuffer }[]>>();

async function loadFont(family: string): Promise<{ weight: number; data: ArrayBuffer }[]> {
  const key = family.trim();
  if (!fontCache.has(key)) {
    fontCache.set(key, (async () => {
      const fam = key.replace(/\s+/g, '+');
      const cssRes = await fetch(`https://fonts.googleapis.com/css2?family=${fam}:wght@500;700&display=swap`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/534.30' },
      });
      if (!cssRes.ok) throw new Error(`font css ${cssRes.status}`);
      const css = await cssRes.text();
      const faces = [...css.matchAll(/@font-face\s*{([^}]+)}/g)].map((m) => m[1]);
      const wanted = new Map<number, string>();
      for (const face of faces) {
        const weight = Number(face.match(/font-weight:\s*(\d+)/)?.[1] || 0);
        const url = face.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
        if (url && (weight === 500 || weight === 700) && !wanted.has(weight)) wanted.set(weight, url);
      }
      if (!wanted.size) throw new Error('no ttf faces found');
      return Promise.all([...wanted].map(async ([weight, url]) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`font ttf ${r.status}`);
        return { weight, data: await r.arrayBuffer() };
      }));
    })());
    // Don't cache failures.
    fontCache.get(key)!.catch(() => fontCache.delete(key));
  }
  return fontCache.get(key)!;
}

// --- Card -------------------------------------------------------------------
export interface OgCard {
  kind: string;           // chip label: BLOG / PROJECT / ...
  title: string;
  subtitle?: string;
  footerLeft: string;     // e.g. author name
  footerLeftSub?: string; // e.g. role or domain
  meta?: string[];        // right-side chips: date, tags, tech
  accent?: string;        // theme accent (dark variant)
  accentLight?: string;
  font?: string;          // display font family
}

const h = (type: string, style: Record<string, unknown>, children?: unknown) =>
  ({ type, props: { style, children } });

function tree(c: Required<Pick<OgCard, 'accent' | 'accentLight'>> & OgCard) {
  const title = c.title.length > 120 ? c.title.slice(0, 117) + '…' : c.title;
  const titleSize = title.length < 40 ? 72 : title.length < 75 ? 58 : 46;
  const chip = (text: string) =>
    h('div', {
      display: 'flex', padding: '7px 16px', borderRadius: 999, fontSize: 20, fontWeight: 500,
      color: '#AEB7C8', border: '1px solid #2A3040', background: 'rgba(255,255,255,0.03)',
    }, text);

  return h('div', {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between', padding: '64px 72px 76px',
    fontFamily: c.font, color: '#D8DBE5', position: 'relative',
    backgroundColor: '#0e1118',
    backgroundImage: `radial-gradient(900px 500px at 100% 0%, ${c.accent}26 0%, rgba(0,0,0,0) 60%), linear-gradient(135deg, #0d1016 0%, #12151e 100%)`,
  }, [
    // top row: domain + kind chip
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
      h('div', { display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 2, color: c.accent }, 'ANKS.IN'),
      chip(c.kind.toUpperCase()),
    ]),
    // middle: title + subtitle
    h('div', { display: 'flex', flexDirection: 'column', gap: 18, marginTop: -10 }, [
      h('div', {
        display: 'flex', fontSize: titleSize, fontWeight: 700, lineHeight: 1.08,
        letterSpacing: -1.5, color: '#F2F4FA', maxHeight: titleSize * 3.4, overflow: 'hidden',
      }, title),
      c.subtitle
        ? h('div', { display: 'flex', fontSize: 27, fontWeight: 500, lineHeight: 1.4, color: '#98A1B3', maxHeight: 76, overflow: 'hidden' },
            c.subtitle.length > 110 ? c.subtitle.slice(0, 107) + '…' : c.subtitle)
        : undefined,
    ].filter(Boolean)),
    // bottom row: identity + meta chips
    h('div', { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }, [
      h('div', { display: 'flex', flexDirection: 'column', gap: 4 }, [
        h('div', { display: 'flex', fontSize: 26, fontWeight: 700, color: '#D8DBE5' }, c.footerLeft),
        c.footerLeftSub
          ? h('div', { display: 'flex', fontSize: 18, fontWeight: 500, color: '#6E7686' }, c.footerLeftSub)
          : undefined,
      ].filter(Boolean)),
      h('div', { display: 'flex', gap: 10 }, (c.meta || []).slice(0, 4).map(chip)),
    ]),
    // accent baseline
    h('div', {
      position: 'absolute', left: 0, right: 0, bottom: 0, height: 12, display: 'flex',
      backgroundImage: `linear-gradient(90deg, ${c.accent}, ${c.accentLight})`,
    }),
  ]);
}

export async function renderOgPng(card: OgCard): Promise<Uint8Array> {
  await initOnce();
  const font = card.font || 'Space Grotesk';
  const fonts = await loadFont(font);
  const svg = await satori(tree({ accent: card.accent || '#7BA4E0', accentLight: card.accentLight || '#9BBAEA', ...card, font }) as any, {
    width: 1200,
    height: 630,
    fonts: fonts.map((f) => ({ name: font, data: f.data, weight: f.weight as 500 | 700, style: 'normal' as const })),
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return png;
}
