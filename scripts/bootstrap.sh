#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/local-env.sh"
cd "${NAVO_ROOT}"

echo "==> Checking local prerequisites"
navo_require_command node
navo_require_command pnpm
navo_require_command docker
docker compose version >/dev/null
docker info >/dev/null 2>&1 || {
  echo "[fail] Docker is installed but its daemon is not running." >&2
  exit 1
}

node -e 'const major=Number(process.versions.node.split(".")[0]); if (major < 20) { console.error(`[fail] Node.js 20+ is required; found ${process.versions.node}.`); process.exit(1); }'

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  echo "[ok] Created .env.local from .env.example (Mock AI is the default)."
else
  echo "[ok] Preserving existing .env.local."
fi
navo_load_local_env

echo "==> Installing workspace dependencies"
pnpm install --frozen-lockfile

echo "==> Starting PostgreSQL and Redis"
docker compose up -d --wait --wait-timeout 60

echo "==> Applying database migrations"
pnpm db:migrate

database_workspace_count() {
  pnpm --filter @navo/db exec node - <<'NODE'
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://navo:navo@localhost:54322/navo" });
(async () => {
  const result = await pool.query("select count(*)::int as count from workspaces");
  console.log(result.rows[0].count);
})().catch((error) => {
  console.error(`[fail] Could not inspect seed state: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());
NODE
}

workspace_count="$(database_workspace_count)"
if [[ "${NAVO_RESEED:-0}" == "1" ]]; then
  echo "==> NAVO_RESEED=1: replacing local demo data"
  pnpm db:seed
elif [[ "${workspace_count}" =~ ^[0-9]+$ && "${workspace_count}" -gt 0 ]]; then
  echo "[ok] Existing workspace data found; seed skipped."
else
  echo "==> Loading deterministic demo workspace"
  pnpm db:seed
fi

echo "==> Running local readiness checks"
bash scripts/doctor.sh

echo
echo "Bootstrap complete. Start the deterministic golden path with: pnpm run dev:mock"
echo "Use 'pnpm dev' when you want the AI_PROVIDER configured in .env.local."
echo "Then open http://localhost:3100 and run: pnpm run health"
