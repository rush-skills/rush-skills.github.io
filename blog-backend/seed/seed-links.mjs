#!/usr/bin/env node
/**
 * Seed starter entries into the `links` feed of a deployed teenybase backend,
 * from blog-backend/seed/links.json. Idempotent: skips links whose URL already
 * exists. Same auth/env pattern as seed.mjs.
 *
 * Usage:
 *   API_BASE=https://your-site USER_EMAIL=you@example.com USER_PASSWORD=... \
 *     node blog-backend/seed/seed-links.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const API_BASE = (process.env.API_BASE || 'https://anks.in').replace(/\/$/, '')
const USER_EMAIL = process.env.USER_EMAIL
const USER_PASSWORD = process.env.USER_PASSWORD
const API = `${API_BASE}/api/v1`

if (!USER_EMAIL || !USER_PASSWORD) {
  console.error('Set USER_EMAIL and USER_PASSWORD env vars (the seeded owner account).')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: API_BASE,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json; try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 160)}`)
  return json
}
const rowsOf = (d) => d.records || d.items || d.data || d.results || []

async function main() {
  const login = await api('/table/users/auth/login-password', {
    method: 'POST', body: { email: USER_EMAIL, password: USER_PASSWORD },
  })
  const token = login.token || login.accessToken || login.access_token
  const authorId = login.record?.id || login.id
  if (!token || !authorId) throw new Error(`Unexpected login response: ${JSON.stringify(login)}`)

  const items = JSON.parse(readFileSync(join(here, 'links.json'), 'utf8'))
  for (const item of items) {
    const existing = await api(`/table/links/list?where=${encodeURIComponent(`url = "${item.url}"`)}`, { token })
    if (rowsOf(existing).length) { console.log(`= ${item.title}: exists, skipping`); continue }
    await api('/table/links/insert', {
      method: 'POST', token,
      body: {
        values: {
          author_id: authorId,
          title: item.title,
          url: item.url,
          kind: item.kind || 'bookmark',
          note: item.note || '',
          tags: JSON.stringify(item.tags || []),
          published: item.published ?? true,
          published_at: item.published_at || new Date().toISOString(),
        },
      },
    })
    console.log(`+ ${item.title}: seeded`)
  }
  console.log('Links seed complete.')
}

main().catch((e) => { console.error(e.message); process.exit(1) })
