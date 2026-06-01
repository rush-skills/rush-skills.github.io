#!/usr/bin/env node
/**
 * Seed the site's content sections into the `content` CMS table of a deployed
 * teenybase backend, from the committed YAML in src/data.
 *
 * Each section (site, theme, hero, about, …) becomes one row whose `draft` and
 * `published` snapshots are both set to the YAML. After this runs, the live site
 * renders from D1 and every section is editable in /admin.
 *
 * Idempotent: by default it SKIPS sections that already exist (so re-running the
 * setup never clobbers edits you've made in the admin). Pass --force to overwrite
 * existing sections from YAML.
 *
 * Usage:
 *   API_BASE=https://your-site \
 *   USER_EMAIL=you@example.com USER_PASSWORD=... \
 *   node scripts/seed-content.mjs [--force]
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import yaml from 'js-yaml'

const API_BASE = (process.env.API_BASE || 'https://anks.in').replace(/\/$/, '')
const USER_EMAIL = process.env.USER_EMAIL
const USER_PASSWORD = process.env.USER_PASSWORD
const FORCE = process.argv.includes('--force')
const API = `${API_BASE}/api/v1`

// Keep in sync with SECTIONS in src/lib/content.ts.
const SECTIONS = ['site', 'theme', 'hero', 'about', 'experience', 'projects', 'skills', 'education', 'contact', 'custom']

if (!USER_EMAIL || !USER_PASSWORD) {
  console.error('Set USER_EMAIL and USER_PASSWORD env vars (the seeded owner account).')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'src', 'data')

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: API_BASE, // teenybase CSRF guard wants a matching Origin on writes
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

function rowsOf(resp) {
  return resp.records || resp.data || resp.results || resp.items || resp.rows || []
}

async function main() {
  console.log(`Backend: ${API_BASE}${FORCE ? ' (force overwrite)' : ''}`)

  const login = await api('/table/users/auth/login-password', {
    method: 'POST',
    body: { email: USER_EMAIL, password: USER_PASSWORD },
  })
  const token = login.token || login.accessToken || login.access_token
  if (!token) throw new Error(`Unexpected login response: ${JSON.stringify(login)}`)

  for (const section of SECTIONS) {
    let data
    try {
      data = yaml.load(readFileSync(join(dataDir, `${section}.yaml`), 'utf8')) || {}
    } catch {
      console.log(`· ${section}: no YAML, skipping`)
      continue
    }
    const json = JSON.stringify(data)

    const existing = await api(`/table/content/list?where=${encodeURIComponent(`section = "${section}"`)}`, { token })
    const rows = rowsOf(existing)

    if (rows.length) {
      if (!FORCE) { console.log(`= ${section}: exists, skipping`); continue }
      await api(`/table/content/edit/${rows[0].id}`, {
        method: 'POST', token, body: { values: { draft: json, published: json } },
      })
      console.log(`~ ${section}: overwritten from YAML`)
    } else {
      await api('/table/content/insert', {
        method: 'POST', token, body: { values: { section, draft: json, published: json } },
      })
      console.log(`+ ${section}: seeded`)
    }
  }
  console.log('Content seed complete.')
}

main().catch((e) => { console.error(e.message); process.exit(1) })
