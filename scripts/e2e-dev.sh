#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

web_pid=""
worker_pid=""

cleanup() {
  for pid in "${web_pid}" "${worker_pid}"; do
    if [[ -n "${pid}" ]]; then
      kill -TERM "${pid}" 2>/dev/null || true
    fi
  done

  for pid in "${web_pid}" "${worker_pid}"; do
    if [[ -n "${pid}" ]]; then
      wait "${pid}" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

AI_PROVIDER="${AI_PROVIDER:-mock}" pnpm --dir apps/web dev &
web_pid=$!

AI_PROVIDER="${AI_PROVIDER:-mock}" pnpm --dir apps/worker dev &
worker_pid=$!

wait "${web_pid}"
