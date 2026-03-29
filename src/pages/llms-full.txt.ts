import type { APIRoute } from 'astro';
import { load } from '../lib/data';

export const GET: APIRoute = () => {
  const site = load('site.yaml');
  const hero = load('hero.yaml');
  const about = load('about.yaml');
  const experience = load('experience.yaml');
  const projects = load('projects.yaml');
  const skills = load('skills.yaml');
  const education = load('education.yaml');
  const contact = load('contact.yaml');

  const lines: string[] = [];

  const name = site.fullName || site.name;

  // Header
  lines.push(`# ${name}`);
  lines.push('');
  lines.push(`> ${hero.description}`);
  lines.push('');
  lines.push(`- Site: https://anks.in`);
  lines.push(`- Email: ${site.email}`);
  (site.social || []).forEach((s: any) => lines.push(`- ${s.label}: ${s.url}`));
  lines.push('');

  // About
  if (about.paragraphs?.length) {
    lines.push('## About');
    lines.push('');
    about.paragraphs.forEach((p: string) => {
      lines.push(p.replace(/<[^>]+>/g, '').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&amp;/g, '&'));
      lines.push('');
    });
  }

  // Experience
  if (experience.jobs?.length) {
    lines.push('## Experience');
    lines.push('');
    experience.jobs.forEach((job: any) => {
      lines.push(`### ${job.company}`);
      lines.push(`**${job.role}** | ${job.location} | ${job.dateRange?.replace(/&ndash;/g, '–')}`);
      if (job.description) lines.push(job.description);
      if (job.tech?.length) lines.push(`Tech: ${job.tech.join(', ')}`);
      lines.push('');
    });
  }

  // Projects
  if (projects.items?.length) {
    lines.push('## Projects');
    lines.push('');
    projects.items.forEach((p: any) => {
      lines.push(`### ${p.title}`);
      if (p.subtitle) lines.push(`*${p.subtitle}*`);
      if (p.status) lines.push(`Status: ${p.status}`);
      if (p.description) lines.push(p.description);
      if (p.links?.length) {
        p.links.forEach((l: any) => lines.push(`- ${l.label}: ${l.url}`));
      }
      if (p.tech?.length) lines.push(`Tech: ${p.tech.join(', ')}`);
      lines.push('');
    });
  }

  // Skills
  if (skills.categories?.length) {
    lines.push('## Skills');
    lines.push('');
    skills.categories.forEach((cat: any) => {
      lines.push(`**${cat.name}:** ${cat.items?.join(', ')}`);
    });
    lines.push('');
  }

  // Education
  if (education.degree) {
    lines.push('## Education');
    lines.push('');
    lines.push(`**${education.degree}**`);
    if (education.institution) lines.push(education.institution);
    if (education.dateRange) lines.push(education.dateRange.replace(/&ndash;/g, '–'));
    if (education.highlights?.length) {
      lines.push('');
      education.highlights.forEach((h: any) => lines.push(`- ${h.text}`));
    }
    lines.push('');
  }

  // Contact
  if (contact.description) {
    lines.push('## Contact');
    lines.push('');
    lines.push(contact.description);
    lines.push(`Email: ${site.email}`);
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
