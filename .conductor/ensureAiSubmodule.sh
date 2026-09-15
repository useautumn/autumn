#!/usr/bin/env bash
# Checks out the private ai submodule. Sourced by setup.sh.
#
# Conductor's git credential broker is scoped to a chat session, so a setup
# script gets nothing from it and the clone fails with "no GitHub credential
# available", leaving the workspace without skills or .mcp.json. Infisical
# holds a PAT that can read the repo, and setup already has the machine
# identity, so authenticate with that instead.

readAiToken() {
	local cli="node_modules/.bin/infisical"
	command -v infisical >/dev/null 2>&1 && cli="infisical"

	local project="${INFISICAL_PROJECT_ID:-}"
	if [ -z "$project" ]; then
		project="$(bun --print 'require("./.infisical.json").workspaceId' 2>/dev/null || true)"
	fi

	local token
	token="$("$cli" secrets get GITHUB_TOKEN --projectId="$project" \
		--env=dev --recursive --plain --silent 2>/dev/null || true)"
	printf '%s' "${token%%$'\n'*}"
}

ensure_ai_submodule() {
	[ -f ai/package.json ] && return 0

	git submodule update --init --recursive ai 2>/dev/null && return 0

	local token
	token="$(readAiToken)"
	if [ -z "$token" ]; then
		echo "[conductor] no GITHUB_TOKEN in Infisical — ai submodule skipped" >&2
		return 1
	fi

	# `git submodule update` re-reads config in its child processes, so neither a
	# credential helper nor url.insteadOf reaches the clone. Do the clone here and
	# attach it, which keeps the credential on one command line we control.
	local pinned
	pinned="$(git rev-parse HEAD:ai 2>/dev/null)" || {
		echo "[conductor] no pinned ai commit in this tree" >&2
		return 1
	}

	# Conductor's credential helper and askpass both intercept and then fail, so
	# disable them and present the PAT as x-access-token's password.
	rmdir ai 2>/dev/null
	if ! env -u GIT_ASKPASS GIT_TERMINAL_PROMPT=0 git -c credential.helper= \
		clone --quiet "https://x-access-token:${token}@github.com/useautumn/ai" ai \
		2>/dev/null; then
		echo "[conductor] ai submodule clone failed — is GITHUB_TOKEN valid for useautumn/ai?" >&2
		return 1
	fi

	git -C ai checkout --quiet "$pinned"
	# The clone URL carries the PAT into .git/modules/ai/config; drop it.
	git -C ai remote set-url origin https://github.com/useautumn/ai
	git submodule absorbgitdirs ai 2>/dev/null

	echo "[conductor] ai submodule ready at ${pinned:0:7}"
}
