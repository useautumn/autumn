#!/usr/bin/env bash
# Starts the docker daemon on a Conductor VM. Sourced by setup.sh and workspace.sh.

# Amazon Linux 2023 ships no docker, and the Cloud computer install script that
# used to supply it is org-level UI state. Install it here so provisioning is
# repo-driven and survives that script changing.
ensure_docker_installed() {
	command -v dockerd >/dev/null 2>&1 && return 0

	echo "[conductor] installing docker"
	sudo dnf install -y docker >/dev/null 2>&1 || true

	# The image carries docker's rpm registered but its binaries deleted, so
	# `dnf install` reports "Nothing to do" and never restores them.
	if ! command -v dockerd >/dev/null 2>&1; then
		echo "[conductor] docker rpm registered without binaries — reinstalling"
		sudo dnf reinstall -y docker >/dev/null 2>&1 || true
	fi

	command -v dockerd >/dev/null 2>&1 || return 1
	sudo usermod -aG docker "$USER" 2>/dev/null || true
}

# `dnf install docker` ships the engine but not the Compose plugin, so dw logs
# "docker compose not available; skipping infra stack" and every service that
# needs Redis/SQS/DynamoDB dies on ECONNREFUSED.
ensure_compose_plugin() {
	docker compose version >/dev/null 2>&1 && return 0
	echo "[conductor] installing docker compose plugin"
	sudo mkdir -p /usr/libexec/docker/cli-plugins
	sudo curl -fsSL \
		"https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
		-o /usr/libexec/docker/cli-plugins/docker-compose
	sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
}

start_docker_daemon() {
	docker info >/dev/null 2>&1 && return 0
	ensure_docker_installed || { echo "[conductor] docker install failed" >&2; return 1; }

	echo "[conductor] starting docker daemon"
	# The image was snapshotted mid-build with docker running, so a fresh VM
	# inherits its leavings: a docker.pid pointing at an unrelated process, and a
	# containerd that dockerd adopts and then times out waiting 15s for. Clearing
	# both is safe — we only get here when no daemon answered.
	sudo rm -f /var/run/docker.pid
	sudo pkill -x containerd 2>/dev/null || true
	sudo rm -rf /var/run/docker/containerd

	# No systemd on these boxes. if/then rather than `a || b &`, which would
	# background the whole list instead of just the fallback.
	if ! sudo systemctl start docker 2>/dev/null; then
		sudo setsid dockerd >/tmp/dockerd.log 2>&1 </dev/null &
	fi
	for _ in $(seq 1 30); do
		# usermod's group only lands in a new login, so fix the socket in place.
		[ -S /var/run/docker.sock ] && sudo chmod 666 /var/run/docker.sock 2>/dev/null
		docker info >/dev/null 2>&1 && return 0
		sleep 2
	done

	echo "[conductor] docker failed to start; see /tmp/dockerd.log" >&2
	return 1
}
