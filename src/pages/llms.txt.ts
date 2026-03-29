import type { APIRoute } from 'astro';
import { load } from '../lib/data';

export const GET: APIRoute = () => {
  const site = load('site.yaml');
  const hero = load('hero.yaml');

  const name = site.fullName || site.name;
  const lines = [
    `# ${name}`,
    '',
    `> ${hero.description}`,
    '',
    `- Site: https://anks.in`,
    `- Email: ${site.email}`,
    ...(site.social || []).map((s: any) => `- ${s.label}: ${s.url}`),
    '',
    `## About`,
    '',
    `${name} is a fullstack and infrastructure engineer based in Bangalore, India with 8+ years of experience across distributed systems, cloud infrastructure, and product development. Previously at CERN, Tower Research Capital, and Myntra. Currently consulting through TheServerlessDev.`,
    '',
    `## Detailed Information`,
    '',
    `For full details including work experience, projects, skills, and education, see: https://anks.in/llms-full.txt`,
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
