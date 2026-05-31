#!/usr/bin/env node
/**
 * One-command setup for this portfolio + CMS on Cloudflare.
 *
 * Clone the repo, then:
 *
 *     npx wrangler login                 # once, in your browser
 *     ADMIN_EMAIL=you@example.com npm run setup
 *
 * It will (idempotently):
 *   1. create the D1 database + R2 bucket (or reuse them if they exist),
 *   2. wire the D1 id into wrangler.jsonc,
 *   3. apply the schema migrations to the remote D1,
 *   4. generate + upload strong Worker secrets,
 *   5. deploy the Worker (to *.workers.dev, or your DOMAIN if you set one),
 *   6. bootstrap teenybase + create your admin user,
 *   7. seed the site content (from src/data) and the first blog post.
 *
 * Then open the printed admin URL and customise everything live.
 *
 * Env (all optional):
 *   PROJECT         Worker/name prefix (default: the "name" in wrangler.jsonc)
 *   D1_NAME         D1 database name   (default: "<project>-db" from wrangler.jsonc)
 *   R2_NAME         R2 bucket name     (default: "<project>-files" from wrangler.jsonc)
 *   DOMAIN          custom domain to serve from (else uses *.workers.dev)
 *   ADMIN_EMAIL     your admin login   (default: admin@<domain-or-example.com>)
 *   ADMIN_PASSWORD  your admin password (default: generated and printed)
 *   ADMIN_USERNAME  your admin username (default: "admin")
 *   ADMIN_NAME      display name        (default: "Site Owner")
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WJSON = join(root, 'wrangler.jsonc');
const rand = (n = 32) => randomBytes(n).toString('hex');

function step(n, msg) { console.log(`\n\x1b[36m==> ${n}\x1b[0m ${msg}`); }
function info(msg) { console.log(`    ${msg}`); }
function die(msg) { console.error(`\n\x1b[31mSetup failed:\x1b[0m ${msg}`); process.exit(1); }

// Run wrangler, returning stdout. `quiet` swallows non-zero exits (for probes).
function wrangler(args, { input, quiet, capture = true } = {}) {
  try {
    const out = execFileSync('npx', ['wrangler', ...args], {
      cwd: root, input, encoding: 'utf8',
      stdio: capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    });
    return out || '';
  } catch (e) {
    if (quiet) return (e.stdout || '') + (e.stderr || '');
    throw new Error(`wrangler ${args.join(' ')}\n${e.stdout || ''}${e.stderr || ''}`);
  }
}

// Read a string value from the (JSONC) wrangler config without a full parse.
function wjsonValue(key) {
  const src = readFileSync(WJSON, 'utf8');
  const m = src.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

async function api(base, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json, text };
}

async function main() {
  // --- 0. Preflight --------------------------------------------------------
  step('0/7', 'Checking Cloudflare login');
  const who = wrangler(['whoami'], { quiet: true });
  if (/not authenticated|run .*wrangler login/i.test(who) && !process.env.CLOUDFLARE_API_TOKEN) {
    die('Not logged in. Run `npx wrangler login` (or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID) and re-run.');
  }
  info('Authenticated ✓');

  const PROJECT = process.env.PROJECT || wjsonValue('name') || 'my-site';
  const D1_NAME = process.env.D1_NAME || wjsonValue('database_name') || `${PROJECT}-db`;
  const R2_NAME = process.env.R2_NAME || wjsonValue('bucket_name') || `${PROJECT}-files`;
  info(`Project: ${PROJECT}  |  D1: ${D1_NAME}  |  R2: ${R2_NAME}`);

  // --- 1. Provision D1 + R2 (idempotent) -----------------------------------
  step('1/7', 'Provisioning D1 + R2');
  let dbId = null;
  const dbList = wrangler(['d1', 'list', '--json'], { quiet: true });
  try {
    const found = JSON.parse(dbList.slice(dbList.indexOf('['))).find((d) => d.name === D1_NAME);
    if (found) dbId = found.uuid || found.database_id;
  } catch { /* fall through to create */ }
  if (dbId) info(`D1 "${D1_NAME}" exists (${dbId})`);
  else {
    const created = wrangler(['d1', 'create', D1_NAME]);
    const m = created.match(/database_id"?\s*[:=]\s*"?([0-9a-f-]{36})/i);
    dbId = m ? m[1] : null;
    if (!dbId) die(`Created D1 but could not parse its id from:\n${created}`);
    info(`D1 "${D1_NAME}" created (${dbId})`);
  }
  const r2List = wrangler(['r2', 'bucket', 'list'], { quiet: true });
  if (r2List.includes(R2_NAME)) info(`R2 "${R2_NAME}" exists`);
  else { wrangler(['r2', 'bucket', 'create', R2_NAME]); info(`R2 "${R2_NAME}" created`); }

  // --- 2. Wire config ------------------------------------------------------
  step('2/7', 'Wiring wrangler.jsonc');
  let src = readFileSync(WJSON, 'utf8');
  src = src.replace(/("database_id"\s*:\s*")[^"]*(")/, `$1${dbId}$2`);
  if (process.env.PROJECT) src = src.replace(/("name"\s*:\s*")[^"]*(")/, `$1${PROJECT}$2`);
  if (process.env.DOMAIN) {
    // point the custom-domain route at DOMAIN (or add one if missing)
    if (/"routes"\s*:/.test(src)) src = src.replace(/("pattern"\s*:\s*")[^"]*(")/, `$1${process.env.DOMAIN}$2`);
  } else {
    // forker default: drop the owner's custom-domain route so deploy targets workers.dev
    src = src.replace(/\n\s*\/\/[^\n]*\n\s*"routes"\s*:\s*\[[\s\S]*?\],/, '');
    src = src.replace(/\n\s*"routes"\s*:\s*\[[\s\S]*?\],/, '');
  }
  writeFileSync(WJSON, src);
  info(`database_id set${process.env.DOMAIN ? `, route -> ${process.env.DOMAIN}` : ', deploying to *.workers.dev'}`);

  // --- 3. Build + migrate --------------------------------------------------
  step('3/7', 'Building site + applying migrations');
  wrangler(['--version'], { quiet: true });
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  wrangler(['d1', 'migrations', 'apply', D1_NAME, '--remote'], { input: 'y\n', capture: false });

  // --- 4. Secrets ----------------------------------------------------------
  step('4/7', 'Generating + uploading Worker secrets');
  const adminServiceToken = rand(24);
  const secrets = {
    JWT_SECRET: rand(32),
    JWT_SECRET_USERS: rand(32),
    ADMIN_JWT_SECRET: rand(32),
    ADMIN_SERVICE_TOKEN: adminServiceToken,
    POCKET_UI_EDITOR_PASSWORD: rand(12),
  };
  const existing = wrangler(['secret', 'list'], { quiet: true });
  for (const [name, value] of Object.entries(secrets)) {
    if (existing.includes(`"${name}"`)) { info(`${name} already set, skipping`); continue; }
    wrangler(['secret', 'put', name], { input: value });
    info(`${name} set`);
  }

  // --- 5. Deploy -----------------------------------------------------------
  step('5/7', 'Deploying the Worker');
  const out = wrangler(['deploy']);
  const urlMatch = out.match(/https:\/\/[^\s]+\.workers\.dev/) || (process.env.DOMAIN ? [`https://${process.env.DOMAIN}`] : null);
  const base = (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : (urlMatch ? urlMatch[0] : '')).replace(/\/$/, '');
  if (!base) die(`Deployed but could not determine the site URL from:\n${out}`);
  info(`Live at ${base}`);

  // --- 6. Bootstrap + admin user ------------------------------------------
  step('6/7', 'Bootstrapping teenybase + creating your admin user');
  for (let i = 0; i < 30; i++) {
    const h = await api(base, '/health').catch(() => ({ ok: false }));
    if (h.ok) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await api(base, '/setup-db', { method: 'POST', token: adminServiceToken, body: {} });

  const adminEmail = process.env.ADMIN_EMAIL || `admin@${process.env.DOMAIN || 'example.com'}`;
  const adminPassword = process.env.ADMIN_PASSWORD || rand(10);
  const signup = await api(base, '/table/users/auth/sign-up', {
    method: 'POST', token: adminServiceToken,
    body: {
      username: process.env.ADMIN_USERNAME || 'admin',
      email: adminEmail,
      password: adminPassword,
      passwordConfirm: adminPassword,
      name: process.env.ADMIN_NAME || 'Site Owner',
    },
  });
  if (!signup.ok && !/exists|unique/i.test(signup.text)) {
    info(`Note: could not create admin user automatically (${signup.status}). ${signup.text.slice(0, 120)}`);
  }

  // --- 7. Seed content + first post ---------------------------------------
  step('7/7', 'Seeding site content + first post');
  const env = { ...process.env, API_BASE: base, USER_EMAIL: adminEmail, USER_PASSWORD: adminPassword };
  try { execFileSync('node', [join(root, 'scripts', 'seed-content.mjs')], { cwd: root, env, stdio: 'inherit' }); }
  catch { info('Content seed skipped (already seeded or auth issue).'); }
  try { execFileSync('node', [join(root, 'blog-backend', 'seed', 'seed.mjs')], { cwd: root, env, stdio: 'inherit' }); }
  catch { info('Post seed skipped.'); }
  try { execFileSync('node', [join(root, 'blog-backend', 'seed', 'seed-links.mjs')], { cwd: root, env, stdio: 'inherit' }); }
  catch { info('Links seed skipped.'); }

  // --- Done ----------------------------------------------------------------
  console.log(`\n\x1b[32m✓ Setup complete!\x1b[0m\n`);
  console.log(`  Site:   ${base}`);
  console.log(`  Blog:   ${base}/blog`);
  console.log(`  Admin:  ${base}/admin`);
  console.log(`\n  Admin login:`);
  console.log(`    email:    ${adminEmail}`);
  console.log(`    password: ${adminPassword}`);
  console.log(`\n  Save these in your password manager. Edit everything live from the admin.`);
  if (!process.env.DOMAIN) {
    console.log(`\n  To use your own domain (must be a Cloudflare zone): set DOMAIN=yourdomain.com and re-run,`);
    console.log(`  or add a custom-domain route to wrangler.jsonc and \`npx wrangler deploy\`.`);
  }
}

main().catch((e) => die(e.message));
