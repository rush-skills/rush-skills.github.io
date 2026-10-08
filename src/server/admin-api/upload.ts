// Store an uploaded image in R2 and return a same-origin /files/… URL.
// Independent of teenybase's file-field upload so a bearer token is enough.

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|jpg|png|gif|webp|svg\+xml|avif))$/i;

function safeName(name: string): string {
  const base = String(name || 'image').split(/[/\\]/).pop() || 'image';
  return base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'image';
}

export interface R2Like {
  put(key: string, value: ReadableStream | ArrayBuffer | string, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
    size?: number;
  } | null>;
}

export async function putImage(files: R2Like, file: File): Promise<{ url: string; key: string; contentType: string }> {
  if (!file || typeof file.size !== 'number') throw new Error('file is required');
  if (file.size <= 0) throw new Error('empty file');
  if (file.size > MAX_BYTES) throw new Error('file too large (max 8MB)');
  const type = file.type || 'application/octet-stream';
  if (!ALLOWED.test(type)) throw new Error('only image uploads are allowed');
  const key = `cms/${crypto.randomUUID()}-${safeName(file.name)}`;
  await files.put(key, file.stream(), { httpMetadata: { contentType: type } });
  return { url: `/files/${key}`, key, contentType: type };
}

export async function getFile(files: R2Like, key: string) {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) return null;
  return files.get(key);
}
