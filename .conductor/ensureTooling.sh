#!/usr/bin/env bash
# Puts the pinned bun on PATH. Sourced by setup.sh and workspace.sh.
#
# Amazon Linux 2023 ships node/npm but no bun, and the Cloud computer install
# script that used to supply it is org-level UI state. Install it here so
# provisioning depends only on what is committed.

ensure_bun_installed() {
	local pinned
	pinned="$(tr -d '[:space:]' <"$(dirname "${BASH_SOURCE[0]}")/../.bun-version" 2>/dev/null || true)"

	export PATH="$HOME/.bun/bin:$(npm prefix -g 2>/dev/null)/bin:$PATH"
	if [ -n "$pinned" ] && [ "$(bun --version 2>/dev/null)" = "$pinned" ]; then
		return 0
	fi
	command -v bun >/dev/null 2>&1 && [ -z "$pinned" ] && return 0

	echo "[conductor] installing bun ${pinned:-latest}"
	# npm registry is proxy-exempt in these sandboxes; bun.sh can be 403'd.
	if npm install -g --silent "bun${pinned:+@$pinned}" >/dev/null 2>&1; then
		:
	elif [ -n "$pinned" ]; then
		curl -fsSL https://bun.sh/install | bash -s "bun-v${pinned}" >/dev/null 2>&1 || true
	else
		curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 || true
	fi

	export PATH="$HOME/.bun/bin:$(npm prefix -g 2>/dev/null)/bin:$PATH"
	command -v bun >/dev/null 2>&1 || { echo "[conductor] bun install failed" >&2; return 1; }
	echo "[conductor] bun $(bun --version)"
}

# `bun dw setup` shells out to neonctl to branch the database. It came from the
# Cloud computer install script, which is org-level UI state.
ensure_neonctl_installed() {
	command -v neonctl >/dev/null 2>&1 && return 0
	echo "[conductor] installing neonctl"
	npm install -g --silent neonctl >/dev/null 2>&1 || true
	export PATH="$(npm prefix -g 2>/dev/null)/bin:$PATH"
	command -v neonctl >/dev/null 2>&1 || { echo "[conductor] neonctl install failed" >&2; return 1; }
}
