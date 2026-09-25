#!/usr/bin/env bash
# Second half of scripts/tesser/dev.sh: runs directly, or under `infisical run`
# when the box has Infisical credentials. Never invoked by Tesser itself.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
log() { echo "[tesser-dev] $*"; }

# `infisical run --env=dev` injects the PlanetScale dev DATABASE_URL and the
# shared Redis/SQS URLs. Re-apply the isolation overlay in server/.env (and a
# shipped server/.env.local) so every child of scripts/dev.ts (server, workers,
# vite, checkout, leaf, Trigger.dev) stays on the box's own services, as
# scripts/setup/claude-cloud/with-env.sh does, and drop the keys that would
# still reach remote infra.
set -a
# shellcheck disable=SC1091
. ./server/.env
if [ -f ./server/.env.local ]; then
	# shellcheck disable=SC1091
	. ./server/.env.local
fi
set +a
unset NEON_WORKTREE_API_KEY MISC_CACHE_DRAGONFLY_PRIVATE_URL CACHE_BACKUP_URL
export STRIPE_WEBHOOK_SKIP_VERIFY=true
case "${DATABASE_URL:-}" in
*localhost* | *127.0.0.1*) ;;
*)
	echo "[tesser-dev] refusing to start: DATABASE_URL is not local" >&2
	exit 1
	;;
esac

# unit-test-org (needs the Stripe sandbox key, i.e. Infisical mode only).
if [ -n "${STRIPE_SANDBOX_SECRET_KEY:-}" ]; then
	# with-env.sh reads the key from here for tests run on this box.
	(umask 077 && mkdir -p "$HOME/.cache" \
		&& printf '%s' "$STRIPE_SANDBOX_SECRET_KEY" >"$HOME/.cache/autumn-stripe-sandbox-secret-key")
	log "ensuring unit-test-org in local postgres"
	AUTUMN_DB_DIRECT=1 bun scripts/setup/setup-test.ts --ensure \
		|| log "WARNING: unit-test-org seed failed; continuing"
fi

exec bun scripts/dev.ts
