#!/usr/bin/env bash
# One-shot deploy for the anks.in single Worker (Astro SSR + teenybase).
#
# Prereqs (once):
#   - npx wrangler login            # or export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
#   - anks.in is a zone on this Cloudflare account (it is)
#   - D1 anksin-db + R2 anksin-files already exist (they do; ids wired in wrangler.jsonc)
#
# Run from the repo root:  bash blog-backend/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

WORKER_URL="${WORKER_URL:-}"   # set after first deploy to seed/setup; else uses workers.dev from output

echo "==> 1/6  Install + build the site (Astro → Cloudflare Worker)"
npm ci
npm run build

echo "==> 2/6  Apply migrations to the REMOTE D1 (anksin-db)"
# Migrations live in blog-backend/migrations (generate once with: cd blog-backend && npx teeny generate --local)
npx wrangler d1 migrations apply anksin-db --remote

echo "==> 3/6  Set Worker secrets (skips ones already set)"
# Generate strong values once and store them in your password manager.
set_secret () {
  local name="$1"
  if npx wrangler secret list 2>/dev/null | grep -q "\"$name\""; then
    echo "    - $name already set, skipping"
  else
    echo "    - setting $name"
    # shellcheck disable=SC2005
    echo "$(openssl rand -hex 32)" | npx wrangler secret put "$name"
  fi
}
set_secret JWT_SECRET
set_secret JWT_SECRET_USERS
set_secret ADMIN_JWT_SECRET
# ADMIN_SERVICE_TOKEN + the PocketUI editor password you'll want to choose yourself:
if ! npx wrangler secret list 2>/dev/null | grep -q '"ADMIN_SERVICE_TOKEN"'; then
  echo "${ADMIN_SERVICE_TOKEN:-$(openssl rand -hex 24)}" | npx wrangler secret put ADMIN_SERVICE_TOKEN
fi
if ! npx wrangler secret list 2>/dev/null | grep -q '"POCKET_UI_EDITOR_PASSWORD"'; then
  echo "${POCKET_UI_EDITOR_PASSWORD:-$(openssl rand -hex 12)}" | npx wrangler secret put POCKET_UI_EDITOR_PASSWORD
fi

echo "==> 4/6  Deploy the Worker"
npx wrangler deploy

echo
echo "==> 5/6  Bootstrap teenybase internal tables (REQUIRED — wrangler deploy"
echo "         doesn't do this; teeny deploy normally would)."
echo "    Find your Worker URL from the deploy output above (…workers.dev), then run:"
cat <<'EOF'

    URL=https://anks-in.<your-subdomain>.workers.dev      # or https://anks.in once DNS is attached
    TOKEN=<the ADMIN_SERVICE_TOKEN you set>

    curl -sS -X POST "$URL/api/v1/setup-db" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' \
      -H "Origin: $URL" -d '{}'

    # then create the owner account (admin token bypasses the closed signup rule):
    curl -sS -X POST "$URL/api/v1/table/users/auth/sign-up" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $URL" \
      -d '{"username":"ankur","email":"you@anks.in","password":"<pick-a-strong-password>","passwordConfirm":"<same>","name":"Ankur Singh"}'

EOF

echo "==> 6/6  Seed the first (meta) post"
cat <<'EOF'

    API_BASE=$URL USER_EMAIL=you@anks.in USER_PASSWORD=<the password> \
      node blog-backend/seed/seed.mjs

EOF

echo "Done. Verify: \$URL/  \$URL/blog  \$URL/admin  \$URL/api/v1/health"
echo "Custom domain: add the route below to wrangler.jsonc and re-run 'wrangler deploy':"
echo '    "routes": [{ "pattern": "anks.in", "custom_domain": true }]'
