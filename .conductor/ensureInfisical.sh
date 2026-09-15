#!/usr/bin/env bash
# Resolves an Infisical token for setup.sh.
#
# Cloud Conductor injects INFISICAL_CLIENT_ID/SECRET but no INFISICAL_TOKEN, so
# `infisical run` drops into an interactive host picker and dies on EOF. Local
# Conductor injects neither — fail-closed on that used to abort every Mac
# workspace. Cloud installs the CLI globally before this runs; locally it falls
# back to node_modules/.bin, so run it after `bun install` there.

ensure_infisical_session() {
	[ -n "${INFISICAL_TOKEN:-}" ] && return 0

	# setup.sh caches a token for later shells (and the Run button's non-login env).
	if [ -s "$HOME/.cache/autumn-infisical-token" ]; then
		INFISICAL_TOKEN="$(cat "$HOME/.cache/autumn-infisical-token")"
		INFISICAL_TOKEN="${INFISICAL_TOKEN%%$'\n'*}"
		if [ -n "$INFISICAL_TOKEN" ]; then
			export INFISICAL_TOKEN
			echo "[conductor] Infisical session ready (cached)"
			return 0
		fi
	fi

	if [ -z "${INFISICAL_CLIENT_ID:-}" ] || [ -z "${INFISICAL_CLIENT_SECRET:-}" ]; then
		# Local Conductor never injects a machine identity. Failing here is why
		# setup always died in the UI — `bun dw` already uses the CLI login
		# on this Mac.
		echo "[conductor] no Infisical machine identity — using existing CLI session"
		return 0
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

	# Later shells and agent sessions get the machine identity but no token, so
	# cache it for shellrc.sh rather than making each one log in again.
	umask 077
	mkdir -p "$HOME/.cache"
	printf '%s' "$INFISICAL_TOKEN" >"$HOME/.cache/autumn-infisical-token"

	# Every `bun t` / `bun dw` / `bun d` is `infisical run -- …` with no
	# --projectId, so the CLI needs a token or it opens an interactive host
	# picker. bun auto-loads .env for `bun run`, which reaches plain shells that
	# never source shellrc. .env* is gitignored.
	touch .env
	{ grep -v '^INFISICAL_TOKEN=' .env || true; } >.env.conductor-tmp
	printf 'INFISICAL_TOKEN=%s\n' "$INFISICAL_TOKEN" >>.env.conductor-tmp
	mv .env.conductor-tmp .env
	chmod 600 .env

	echo "[conductor] Infisical session ready"
}
