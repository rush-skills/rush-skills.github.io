#!/usr/bin/env node
/**
 * Seed the first blog post (the "meta" post) into a deployed teenybase backend.
 *
 * Prereqs:
 *   1. The backend is deployed and reachable (default: the production URL below).
 *   2. An owner user exists. Create one once via the PocketUI admin at
 *      <API_BASE>/api/v1/pocket/ (login with POCKET_UI_EDITOR_PASSWORD), or via
 *      the auth sign-up route if you temporarily open the users createRule.
 *
 * Usage:
 *   API_BASE=https://anksinblog.theserverless.dev \
 *   USER_EMAIL=you@example.com USER_PASSWORD=... \
 *   node blog-backend/seed/seed.mjs
 *
 * It logs in, then inserts the post from how-this-blog-was-built.md (idempotent:
 * it skips if a post with the same slug already exists).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const API_BASE = (process.env.API_BASE || 'https://anksinblog.theserverless.dev').replace(/\/$/, '')
const USER_EMAIL = process.env.USER_EMAIL
const USER_PASSWORD = process.env.USER_PASSWORD
const API = `${API_BASE}/api/v1`

if (!USER_EMAIL || !USER_PASSWORD) {
  console.error('Set USER_EMAIL and USER_PASSWORD env vars (the seeded owner account).')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))

/** Parse the lightweight front-matter + body from the markdown file. */
function parsePost(path) {
  const raw = readFileSync(path, 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error(`No front-matter in ${path}`)
  const meta = {}
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^(\w+):\s*(.*)$/)
    if (!mm) continue
    let [, k, v] = mm
    v = v.trim()
    if (v.startsWith('[')) meta[k] = JSON.parse(v)
    else if (v === 'true' || v === 'false') meta[k] = v === 'true'
    else meta[k] = v.replace(/^"(.*)"$/, '$1')
  }
  return { meta, body: m[2].trim() }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
  return json
}

async function main() {
  console.log(`Backend: ${API_BASE}`)

  // 1. Log in to get a JWT + the author id.
  const login = await api('/table/users/auth/login-password', {
    method: 'POST',
    body: { email: USER_EMAIL, password: USER_PASSWORD },
  })
  const token = login.token || login.accessToken || login.access_token
  const authorId = login.record?.id || login.user?.id || login.id
  if (!token || !authorId) throw new Error(`Unexpected login response: ${JSON.stringify(login)}`)
  console.log(`Logged in as ${authorId}`)

  // 2. Read + parse the meta post.
  const { meta, body } = parsePost(join(here, 'how-this-blog-was-built.md'))

  // 3. Skip if the slug already exists.
  const existing = await api(`/table/posts/list?where=${encodeURIComponent(`slug = "${meta.slug}"`)}`, { token })
  const rows = existing.records || existing.data || existing.results || []
  if (rows.length) {
    console.log(`Post "${meta.slug}" already exists — nothing to do.`)
    return
  }

  // 4. Insert.
  const created = await api('/table/posts/insert', {
    method: 'POST',
    token,
    body: {
      values: {
        author_id: authorId,
        title: meta.title,
        slug: meta.slug,
        excerpt: meta.excerpt || '',
        body,
        tags: JSON.stringify(meta.tags || []),
        published: meta.published ?? true,
        published_at: new Date().toISOString(),
      },
    },
  })
  console.log('Inserted post:', created.record?.id || created.id || '(ok)')
}

main().catch((e) => { console.error(e.message); process.exit(1) })
