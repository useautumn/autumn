#!/usr/bin/env bash
# Cursor Cloud `start` — per-boot. Starts local Postgres/Redis/ClickHouse/ElasticMQ,
# writes server/.env if missing, migrates. Does not start the app (see terminals).
set -euo pipefail
cd "$(dirname "$0")/../.."

export DW_HEADLESS=1
if ! grep -q 'export DW_HEADLESS=1' "${HOME}/.bashrc" 2>/dev/null; then
	echo 'export DW_HEADLESS=1' >> "${HOME}/.bashrc"
fi

bash scripts/setup/agent-services.sh
