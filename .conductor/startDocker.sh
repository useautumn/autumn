#!/usr/bin/env bash
# Starts the docker daemon on a Conductor VM. Sourced by setup.sh and workspace.sh.

start_docker_daemon() {
	docker info >/dev/null 2>&1 && return 0

	echo "[conductor] starting docker daemon"
	# The machine image was snapshotted with dockerd running, so /var/run/docker.pid
	# survives into a fresh VM pointing at an unrelated PID and dockerd refuses to
	# start. Safe to clear: we only get here when no daemon answered.
	sudo rm -f /var/run/docker.pid

	# No systemd on these boxes. if/then rather than `a || b &`, which would
	# background the whole list instead of just the fallback.
	if ! sudo systemctl start docker 2>/dev/null; then
		sudo setsid dockerd >/tmp/dockerd.log 2>&1 </dev/null &
	fi
	for _ in $(seq 1 30); do
		docker info >/dev/null 2>&1 && return 0
		sleep 2
	done

	echo "[conductor] docker failed to start; see /tmp/dockerd.log" >&2
	return 1
}
