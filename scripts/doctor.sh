#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/local-env.sh"
cd "${NAVO_ROOT}"
navo_load_local_env

runtime=0
if [[ "${1:-}" == "--runtime" ]]; then
  runtime=1
elif [[ -n "${1:-}" ]]; then
  echo "Usage: bash scripts/doctor.sh [--runtime]" >&2
  exit 2
fi

failures=0
check() {
  local label="$1"
  local output
  shift
  if output=$("$@" 2>&1); then
    echo "[ok] ${label}"
  else
    echo "[fail] ${label}" >&2
    if [[ -n "${output}" ]]; then
      while IFS= read -r line; do
        echo "       ${line}" >&2
      done <<< "${output}"
    fi
    failures=$((failures + 1))
  fi
}

check_node() {
  command -v node >/dev/null && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'
}

check_database() {
  pnpm --filter @navo/db exec node - <<'NODE'
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://navo:navo@localhost:55432/navo",
  connectionTimeoutMillis: 3000,
});
(async () => {
  const schema = await pool.query(`
    select
      to_regclass('public.workspaces') is not null as workspaces,
      to_regclass('public.agent_missions') is not null as missions,
      to_regclass('public.agent_events') is not null as events,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'agent_missions' and column_name = 'working_memory'
      ) as working_memory
  `);
  if (!Object.values(schema.rows[0]).every(Boolean)) throw new Error("required autonomous-agent schema is missing");
  const seeded = await pool.query("select count(*)::int as count from workspaces");
  if (seeded.rows[0].count < 1) throw new Error("no workspace data; run pnpm db:seed");
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
NODE
}

check_redis() {
  pnpm --filter @navo/worker exec node - <<'NODE'
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:56379", {
  connectTimeout: 3000,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});
redis.ping()
  .then((reply) => { if (reply !== "PONG") throw new Error("unexpected Redis response"); })
  .catch(() => { process.exitCode = 1; })
  .finally(() => redis.disconnect());
NODE
}

check_worker() {
  pnpm --filter @navo/worker exec node - <<'NODE'
const { Queue } = require("bullmq");
const Redis = require("ioredis");
const connection = new Redis(process.env.REDIS_URL || "redis://localhost:56379", {
  connectTimeout: 3000,
  maxRetriesPerRequest: null,
  retryStrategy: () => null,
});
const queue = new Queue("navo-runs", { connection });
(async () => {
  const count = await queue.getWorkersCount();
  if (count < 1) throw new Error("no Navo queue worker is registered");
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => {
  await queue.close().catch(() => undefined);
  connection.disconnect();
});
NODE
}

check_web() {
  curl --fail --silent --show-error --max-time 5 --output /dev/null "${NAVO_WEB_URL:-http://localhost:3100/app/overview}"
}

echo "Navo local doctor"
check "Node.js 20+" check_node
check "pnpm available" command -v pnpm
check "Local .env.local configuration" test -f .env.local
check "Docker daemon" docker info
check "Docker Compose" docker compose version
check "PostgreSQL + autonomous schema + demo workspace" check_database
check "Redis queue backend" check_redis

if [[ "${runtime}" -eq 1 ]]; then
  check "Web app responding on port 3100" check_web
  check "BullMQ worker registered on navo-runs" check_worker
fi

if [[ "${failures}" -gt 0 ]]; then
  echo >&2
  if [[ "${runtime}" -eq 1 ]]; then
    echo "${failures} check(s) failed. Run 'pnpm run bootstrap', then keep 'pnpm dev' running before retrying 'pnpm run health'." >&2
  else
    echo "${failures} check(s) failed. Run 'pnpm run bootstrap' and inspect the first failed dependency." >&2
  fi
  exit 1
fi

if [[ "${runtime}" -eq 1 ]]; then
  echo "[ready] Web, worker, database, and Redis are ready for autonomous Missions."
else
  echo "[ready] Local dependencies and data are ready."
fi
