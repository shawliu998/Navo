#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/local-env.sh"
cd "${NAVO_ROOT}"
navo_load_local_env

if [[ "${NAVO_FORCE_MOCK:-0}" == "1" ]]; then
  export AI_PROVIDER=mock
fi
echo "Navo AI provider: ${AI_PROVIDER:-mock}"

if [[ -z "${WEBSITE_RESEARCH_ALLOW_BENCHMARK_DNS:-}" ]]; then
  resolved_public_addresses="$(node -e "require('node:dns').lookup('example.com',{all:true},(error,addresses)=>{if(!error)console.log(addresses.map(item=>item.address).join('\\n'))})")"
  if grep -Eq '^198\.(18|19)\.' <<<"${resolved_public_addresses}"; then
    export WEBSITE_RESEARCH_ALLOW_BENCHMARK_DNS=true
    echo "Navo detected the local synthetic DNS proxy; real website research is enabled for DNS-resolved benchmark addresses."
  fi
fi

if ! bash scripts/doctor.sh; then
  echo >&2
  echo "Local prerequisites are not ready. Run 'pnpm run bootstrap' once, then retry 'pnpm dev'." >&2
  exit 1
fi

if ! node - <<'NODE'
const net = require("node:net");
const server = net.createServer();
server.once("error", () => process.exit(1));
server.listen(3100, () => server.close(() => process.exit(0)));
NODE
then
  echo "[fail] Port 3100 is already in use. Stop the existing Web process, or use 'pnpm run health' if Navo is already running." >&2
  exit 1
fi

echo "Starting Navo web + autonomous worker. Verify both from another terminal with: pnpm run health"
exec pnpm exec turbo dev --env-mode=loose
