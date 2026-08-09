# Conductor Cloud — "Install software" script
# Settings > Organization > Cloud Computer > Install software
#
# Runs once per build, from the sandbox home, as bash with `set -euo pipefail`.
# Any failing command fails the build, so every step is guarded or idempotent.
# Base image is Amazon Linux 2023: dnf, sudo available, no bun and no Docker.

# --- bun -------------------------------------------------------------------
# Symlinked into /usr/local/bin because a PATH export here does not survive
# into workspace shells.
curl -fsSL https://bun.sh/install | bash
sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
sudo ln -sf "$HOME/.bun/bin/bunx" /usr/local/bin/bunx
bun --version

# --- CLIs ------------------------------------------------------------------
# Infisical must be >= 0.43.116: earlier versions ignore INFISICAL_PROJECT_ID
# and fail every `infisical run` with "Project ID is required".
sudo npm install -g --silent @infisical/cli@0.43.120 neonctl
infisical --version
neonctl --version

# --- postgres client (psql, for dw migrations) -----------------------------
sudo dnf install -y -q postgresql16 || sudo dnf install -y -q postgresql15

# --- other binaries dw shells out to ---------------------------------------
# lsof: killOwnPorts. procps-ng: pgrep. Neither ships in the base image.
sudo dnf install -y -q lsof procps-ng

# --- docker ----------------------------------------------------------------
sudo dnf install -y -q docker
sudo usermod -aG docker "$(whoami)" || true
# systemd may not be running in a build sandbox; fall back to a bare daemon.
if ! sudo systemctl enable --now docker 2>/dev/null; then
  sudo nohup dockerd >/tmp/dockerd.log 2>&1 &
fi
for _ in $(seq 1 30); do
  if sudo docker info >/dev/null 2>&1; then break; fi
  sleep 2
done
sudo docker version --format '{{.Server.Version}}'

# --- pre-pull the dw stack (~1.1GB; baked here, free per workspace) ---------
# Tags omitted deliberately — `:latest` is the default, and an explicit tag got
# mangled to `:late` somewhere between the config field and the daemon.
sudo docker pull -q docker.dragonflydb.io/dragonflydb/dragonfly
sudo docker pull -q softwaremill/elasticmq-native
sudo docker pull -q amazon/dynamodb-local

# --- infisical login helper ------------------------------------------------
# Prints a fresh token:  export INFISICAL_TOKEN=$(autumn-infisical-login)
# Kept as a script rather than a baked value so nothing expires and no
# credential lands in the machine image.
sudo tee /usr/local/bin/autumn-infisical-login >/dev/null <<'HELPER'
#!/bin/sh
if [ -z "${INFISICAL_CLIENT_ID:-}" ] || [ -z "${INFISICAL_CLIENT_SECRET:-}" ]; then
  echo "autumn-infisical-login: INFISICAL_CLIENT_ID/SECRET not set" >&2
  exit 1
fi
exec infisical login --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" \
  --client-secret="$INFISICAL_CLIENT_SECRET" \
  --plain --silent
HELPER
sudo chmod +x /usr/local/bin/autumn-infisical-login

# --- auto-export INFISICAL_TOKEN in every shell ----------------------------
# Sourced via BASH_ENV (set in the Environment section), which non-interactive
# `bash -c` honours — .bashrc alone would miss the agent's tool calls. Token is
# cached for 30 min so nested subshells don't re-login on every invocation.
sudo tee /usr/local/share/autumn-env.sh >/dev/null <<'ENVSH'
if [ -z "${INFISICAL_TOKEN:-}" ] && [ -n "${INFISICAL_CLIENT_ID:-}" ]; then
  _tok_cache="$HOME/.cache/autumn-infisical-token"
  if [ -s "$_tok_cache" ] && [ -n "$(find "$_tok_cache" -mmin -30 2>/dev/null)" ]; then
    INFISICAL_TOKEN="$(cat "$_tok_cache")"
  else
    mkdir -p "$HOME/.cache"
    INFISICAL_TOKEN="$(autumn-infisical-login 2>/dev/null || true)"
    if [ -n "$INFISICAL_TOKEN" ]; then
      printf '%s' "$INFISICAL_TOKEN" > "$_tok_cache"
      chmod 600 "$_tok_cache"
    fi
  fi
  export INFISICAL_TOKEN
  unset _tok_cache
fi
ENVSH
sudo chmod 644 /usr/local/share/autumn-env.sh
grep -q autumn-env.sh "$HOME/.bashrc" 2>/dev/null || \
  echo '. /usr/local/share/autumn-env.sh' >> "$HOME/.bashrc"

# --- materialize agent config into the cloned repo -------------------------
# Only ~10 skills are committed to .claude/skills; the rest are symlinks that
# ai-sync creates into a gitignored dir, so a fresh clone has neither them nor
# AGENTS.md. Baked here once rather than paid per workspace.
#
# Full `bun sync` — skills, rules AND .mcp.json. syncMcps now drops the two
# stdio servers that need a cloud checkout instead of aborting the whole step,
# so the seven remote servers land here.
cd "$HOME/autumn"
git submodule update --init --recursive ai
# --frozen-lockfile always: regenerating bun.lock flips configVersion 0 -> 1
# (hoisted -> isolated linker) and breaks the runtime.
bun install --frozen-lockfile
cd ai
bun install --silent
bun sync
cd "$HOME"
echo "skills materialized: $(ls "$HOME/autumn/.claude/skills" | wc -l)"
echo "mcp servers: $(jq -r '.mcpServers | keys | join(", ")' "$HOME/autumn/.mcp.json" 2>/dev/null || echo none)"

echo "cloud computer ready: bun $(bun --version), $(infisical --version)"
