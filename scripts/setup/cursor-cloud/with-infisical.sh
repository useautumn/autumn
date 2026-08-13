#!/usr/bin/env bash
# Mint an Infisical token from the Cursor Cloud machine-identity secrets
# (INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET), then run the given command
# under `infisical run --env=dev --recursive`.
#
# Headless without identity: run the command against server/.env only.
# Laptop (not DW_HEADLESS): always wrap in infisical run (existing CLI session).
#
# Usage: with-infisical.sh [--env=dev] -- command [args...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:$HOME/.bun/bin:/usr/local/bin:$PATH"

INFISICAL_ENV="dev"
ENV_FILE="${ENV_FILE:-.env}"

while [ $# -gt 0 ]; do
	case "$1" in
		--env=*)
			INFISICAL_ENV="${1#--env=}"
			shift
			;;
		--env)
			INFISICAL_ENV="$2"
			shift 2
			;;
		--)
			shift
			break
			;;
		-*)
			echo "with-infisical.sh: unknown flag $1" >&2
			exit 2
			;;
		*)
			break
			;;
	esac
done

if [ $# -eq 0 ]; then
	echo "usage: with-infisical.sh [--env=dev] -- command [args...]" >&2
	exit 2
fi

# Cursor Runtime Secrets use INFISICAL_CLIENT_*; Infisical CLI also reads
# INFISICAL_UNIVERSAL_AUTH_CLIENT_*. Accept either.
if [ -z "${INFISICAL_CLIENT_ID:-}" ] && [ -n "${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:-}" ]; then
	export INFISICAL_CLIENT_ID="$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID"
	export INFISICAL_CLIENT_SECRET="${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:-}"
fi
if [ -n "${INFISICAL_CLIENT_ID:-}" ]; then
	export INFISICAL_UNIVERSAL_AUTH_CLIENT_ID="${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:-$INFISICAL_CLIENT_ID}"
	export INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET="${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:-$INFISICAL_CLIENT_SECRET}"
fi

if [ -z "${INFISICAL_TOKEN:-}" ]; then
	INFISICAL_TOKEN="$(bash "$ROOT/scripts/setup/cursor-cloud/infisical-machine-login.sh" 2>/dev/null || true)"
	export INFISICAL_TOKEN
fi

headless=0
if [ "${DW_HEADLESS:-}" = "1" ] || [ "${DW_HEADLESS:-}" = "true" ]; then
	headless=1
fi

can_run=0
if command -v infisical >/dev/null 2>&1; then
	if [ -n "${INFISICAL_TOKEN:-}" ]; then
		can_run=1
	elif [ "$headless" -eq 0 ]; then
		can_run=1
	fi
fi

if [ "$can_run" -eq 1 ]; then
	if [ "$headless" -eq 1 ]; then
		isolation=()
		while IFS= read -r line || [ -n "$line" ]; do
			case "$line" in
				""|\#*) continue ;;
				*) isolation+=("$line") ;;
			esac
		done < "$ROOT/scripts/setup/cursor-cloud/isolation.env"
		# Infisical injects first; `env` then pins local services and drops Neon.
		exec env ENV_FILE="$ENV_FILE" infisical run --env="$INFISICAL_ENV" --recursive --silent -- \
			env -u NEON_WORKTREE_API_KEY "${isolation[@]}" "$@"
	fi
	exec env ENV_FILE="$ENV_FILE" infisical run --env="$INFISICAL_ENV" --recursive -- "$@"
fi

if [ "$headless" -eq 1 ]; then
	echo "[with-infisical] no Infisical machine identity — running without vault (server/.env)" >&2
fi
exec "$@"
