#!/usr/bin/env bash

# Shared by local bootstrap and health scripts. This intentionally handles the
# simple KEY=VALUE format used by .env.example without evaluating shell code.

NAVO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

navo_load_local_env() {
  local env_file="${NAVO_ROOT}/.env.local"
  local line key value

  [[ -f "${env_file}" ]] || return 0

  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "${key}=${value}"
  done < "${env_file}"
}

navo_require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[fail] Missing required command: $1" >&2
    return 1
  fi
}
