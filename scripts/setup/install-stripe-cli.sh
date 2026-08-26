#!/usr/bin/env bash
set -euo pipefail

parse_stripe_version() {
	local output="$1"
	printf '%s\n' "$output" | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true
}

install_stripe_cli() {
	local log_prefix="${1:-[setup]}"
	local target="${2:-/usr/local/bin/stripe}"
	local stripe_ver="${3:-1.33.0}"

	if [ -x "$target" ]; then
		local current_version current_output
		current_output="$("$target" version 2>/dev/null || true)"
		current_version="$(parse_stripe_version "$current_output")"
		if [ "$current_version" = "$stripe_ver" ]; then
			return 0
		fi
		echo "$log_prefix replacing Stripe CLI ${current_version:-unknown} with $stripe_ver at $target"
	fi

	local arch stripe_arch tmp tmp_target
	arch="$(uname -m)"
	case "$arch" in
		x86_64) stripe_arch="x86_64" ;;
		aarch64|arm64) stripe_arch="arm64" ;;
		*) stripe_arch="x86_64" ;;
	esac

	tmp="$(mktemp -d)"
	trap 'rm -rf "$tmp"' RETURN
	curl -fsSL -o "$tmp/stripe.tar.gz" \
		"https://github.com/stripe/stripe-cli/releases/download/v${stripe_ver}/stripe_${stripe_ver}_linux_${stripe_arch}.tar.gz"
	tar -xzf "$tmp/stripe.tar.gz" -C "$tmp"
	tmp_target="$tmp/stripe"

	if [ "$EUID" -eq 0 ]; then
		install -m 0755 "$tmp_target" "$target"
	elif [ -w "$(dirname "$target")" ]; then
		install -m 0755 "$tmp_target" "$target"
	else
		command -v sudo >/dev/null 2>&1 || {
			echo "$log_prefix ERROR: sudo is required to install Stripe CLI into $target" >&2
			return 1
		}
		sudo install -m 0755 "$tmp_target" "$target"
	fi

	"$target" version
}
