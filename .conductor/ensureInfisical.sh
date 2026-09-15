#!/usr/bin/env bash
# Exchanges the machine identity for an Infisical token. Sourced by setup.sh.
#
# Conductor injects INFISICAL_CLIENT_ID/SECRET but no INFISICAL_TOKEN, so
# `infisical run` drops into an interactive host picker and dies on EOF.
# The CLI ships in node_modules, so this must run after `bun install`.

ensure_infisical_session() {
	[ -n "${INFISICAL_TOKEN:-}" ] && return 0

	if [ -z "${INFISICAL_CLIENT_ID:-}" ] || [ -z "${INFISICAL_CLIENT_SECRET:-}" ]; then
		echo "[conductor] no Infisical machine identity in the environment" >&2
		return 1
	fi

	local cli="node_modules/.bin/infisical"
	command -v infisical >/dev/null 2>&1 && cli="infisical"

	INFISICAL_TOKEN="$("$cli" login --method=universal-auth \
		--client-id="$INFISICAL_CLIENT_ID" --client-secret="$INFISICAL_CLIENT_SECRET" \
		--plain --silent 2>/dev/null || true)"
	INFISICAL_TOKEN="${INFISICAL_TOKEN%%$'\n'*}"

	if [ -z "$INFISICAL_TOKEN" ]; then
		echo "[conductor] Infisical login failed" >&2
		return 1
	fi
	export INFISICAL_TOKEN
	echo "[conductor] Infisical session ready"
}
