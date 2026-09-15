#!/usr/bin/env bash
# Checks out the private ai submodule. Sourced by setup.sh.
#
# Conductor's git credential broker is scoped to a chat session, so a setup
# script gets nothing from it and the clone fails with "no GitHub credential
# available". Infisical holds a PAT that can read the repo, and setup already
# has the machine identity, so authenticate with that instead.

ensure_ai_submodule() {
	[ -f ai/package.json ] && return 0

	git submodule update --init --recursive ai 2>/dev/null && return 0

	local cli="node_modules/.bin/infisical"
	command -v infisical >/dev/null 2>&1 && cli="infisical"

	local project="${INFISICAL_PROJECT_ID:-}"
	if [ -z "$project" ]; then
		project="$(bun --print 'require("./.infisical.json").workspaceId' 2>/dev/null || true)"
	fi

	local token
	token="$("$cli" secrets get GITHUB_TOKEN --projectId="$project" \
		--env=dev --recursive --plain --silent 2>/dev/null || true)"
	token="${token%%$'\n'*}"
	if [ -z "$token" ]; then
		echo "[conductor] no GITHUB_TOKEN in Infisical — ai submodule skipped" >&2
		return 1
	fi

	# A classic PAT authenticates as the username with an empty password; git's
	# credential helpers reject that shape, so rewrite the URL instead. The token
	# goes in a 0600 config rather than argv, which `ps` would expose.
	local config
	config="$(mktemp)"
	chmod 600 "$config"
	git config --file "$config" \
		"url.https://${token}@github.com/.insteadOf" "https://github.com/"

	local status=0
	GIT_CONFIG_GLOBAL="$config" git submodule update --init --recursive ai || status=1
	rm -f "$config"

	if [ "$status" -ne 0 ]; then
		echo "[conductor] ai submodule clone failed" >&2
		return 1
	fi
	echo "[conductor] ai submodule ready"
}
