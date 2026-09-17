#!/usr/bin/env bash
# Source of truth for Conductor's Cloud computer "Install script".
#
# Conductor stores that script as org-level UI state, where it cannot be
# reviewed or rolled back with the code — and emptying it silently removed bun,
# docker, psql and neonctl from every workspace. Keep this file in sync and
# paste it back whenever the image is rebuilt.
#
# Runs once at image build, as the image user. Per-workspace provisioning lives
# in .conductor/setup.sh.
set -euo pipefail

INFISICAL_PROJECT_ID="6c89edef-5d27-4cd6-a496-3b3d6170ecec"

# --- machine tooling --------------------------------------------------------
sudo dnf install -y docker postgresql16 lsof tmux

sudo mkdir -p /usr/libexec/docker/cli-plugins
sudo curl -fsSL \
	"https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
	-o /usr/libexec/docker/cli-plugins/docker-compose
sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose

curl -fsSL https://bun.sh/install | bash
sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
sudo ln -sf "$HOME/.bun/bin/bunx" /usr/local/bin/bunx

npm install -g neonctl @infisical/cli

# --- agent skills, baked into the image -------------------------------------
# Conductor opens the first chat within seconds of a workspace existing, and an
# agent freezes its skill registry at chat start. Workspace setup can never win
# that race — it was still 60s short after every reordering — so user-scope
# skills have to already be on the machine. This is what Cursor's install script
# does for the same reason.
bake_skills() {
	local token="${GITHUB_TOKEN:-}"

	if [ -z "$token" ] && [ -n "${INFISICAL_CLIENT_ID:-}" ] && [ -n "${INFISICAL_CLIENT_SECRET:-}" ]; then
		INFISICAL_TOKEN="$(infisical login --method=universal-auth \
			--client-id="$INFISICAL_CLIENT_ID" --client-secret="$INFISICAL_CLIENT_SECRET" \
			--plain --silent 2>/dev/null || true)"
		export INFISICAL_TOKEN
		token="$(infisical secrets get GITHUB_TOKEN --projectId="$INFISICAL_PROJECT_ID" \
			--env=dev --recursive --plain --silent 2>/dev/null || true)"
		token="${token%%$'\n'*}"
	fi

	if [ -z "$token" ]; then
		echo "[install] WARNING: no GitHub credential at build time — the first chat in" >&2
		echo "[install] each workspace will have no skills. Set GITHUB_TOKEN, or expose" >&2
		echo "[install] INFISICAL_CLIENT_ID/SECRET to the build." >&2
		return 0
	fi

	rm -rf /tmp/ai-skills
	# A classic PAT authenticates as x-access-token's password; Conductor's own
	# credential helper and askpass both intercept and then fail, so disable them.
	if ! env -u GIT_ASKPASS GIT_TERMINAL_PROMPT=0 git -c credential.helper= \
		clone --quiet --depth 1 \
		"https://x-access-token:${token}@github.com/useautumn/ai" /tmp/ai-skills 2>/dev/null; then
		echo "[install] WARNING: could not clone useautumn/ai — is GITHUB_TOKEN valid?" >&2
		return 0
	fi

	# Skills live at config/skills/<group>/<skill>/SKILL.md; agents want them flat.
	for dir in "$HOME/.claude/skills" "$HOME/.cursor/skills" "$HOME/.codex/skills"; do
		mkdir -p "$dir"
		find /tmp/ai-skills/config/skills -mindepth 2 -maxdepth 2 -type d \
			-exec cp -r {} "$dir/" \;
	done
	rm -rf /tmp/ai-skills

	echo "[install] baked $(ls "$HOME/.claude/skills" | wc -l) skills into user scope"
}

bake_skills

echo "[install] complete"
