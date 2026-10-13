#!/usr/bin/env bash
# Memory bubble for Capy VMs: when memory runs out, kill the greedy process
# instead of letting the kernel thrash the whole machine (no swap, no PSI here).
set -euo pipefail

# Headroom kept outside system.slice so a fast allocation is OOM-killed before reclaim thrashes.
CAPY_BUBBLE_RESERVE_MB="${CAPY_BUBBLE_RESERVE_MB:-256}"
# earlyoom thresholds in KiB of MemAvailable: SIGTERM at the first, SIGKILL at the second.
CAPY_BUBBLE_EARLYOOM_MIN_KIB="${CAPY_BUBBLE_EARLYOOM_MIN_KIB:-262144,131072}"
CAPY_BUBBLE_EARLYOOM_AVOID='^(envd|kappu|Xvfb|MainThread|dockerd|containerd.*|tmux.*|sshd|systemd.*|init|earlyoom)$'
CAPY_BUBBLE_EARLYOOM_PREFER='^(tsgo|tsc)$'

# Prints "changed" when the file content differs and was replaced.
capy_bubble_write() {
	local path="$1" content="$2"
	if [ -f "$path" ] && [ "$(sudo cat "$path")" = "$content" ]; then
		return 0
	fi
	sudo mkdir -p "$(dirname "$path")"
	printf '%s\n' "$content" | sudo tee "$path" >/dev/null
	echo changed
}

install_capy_bubble() {
	local log_prefix="${1:-[capy-bubble]}"
	if ! sudo -n true 2>/dev/null; then
		echo "$log_prefix WARNING: passwordless sudo unavailable; memory bubble not installed" >&2
		return 0
	fi

	if ! command -v earlyoom >/dev/null 2>&1; then
		echo "$log_prefix installing earlyoom"
		sudo apt-get update -qq
		sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq earlyoom >/dev/null
	fi

	local earlyoom_changed server_changed bubble_changed
	earlyoom_changed="$(capy_bubble_write /etc/default/earlyoom \
		"EARLYOOM_ARGS=\"-M $CAPY_BUBBLE_EARLYOOM_MIN_KIB -s 100,100 -r 60 --avoid '$CAPY_BUBBLE_EARLYOOM_AVOID' --prefer '$CAPY_BUBBLE_EARLYOOM_PREFER'\"")"

	# One OOM kill inside the machine server must not stop the server and every agent command with it.
	server_changed="$(capy_bubble_write /etc/systemd/system/capy-machine-server.service.d/oom.conf "[Service]
OOMPolicy=continue")"

	bubble_changed="$(capy_bubble_write /usr/local/sbin/capy-bubble "#!/bin/sh
set -eu
total_kib=\$(awk '/^MemTotal:/ { print \$2 }' /proc/meminfo)
max_mb=\$(( total_kib / 1024 - $CAPY_BUBBLE_RESERVE_MB ))
exec systemctl set-property --runtime system.slice MemoryMax=\${max_mb}M MemorySwapMax=0")"
	sudo chmod 755 /usr/local/sbin/capy-bubble

	# The cap is reapplied every boot from MemTotal, so one snapshot fits every VM size.
	bubble_changed+="$(capy_bubble_write /etc/systemd/system/capy-bubble.service "[Unit]
Description=Cap system.slice memory below RAM so OOM kills the greedy process instead of thrashing
After=local-fs.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/capy-bubble

[Install]
WantedBy=multi-user.target")"

	if [ -n "$server_changed$bubble_changed" ]; then
		sudo systemctl daemon-reload
	fi
	sudo systemctl enable earlyoom capy-bubble >/dev/null 2>&1
	if [ -n "$bubble_changed" ]; then
		sudo systemctl restart capy-bubble
	else
		sudo systemctl start capy-bubble
	fi
	if [ -n "$earlyoom_changed" ]; then
		sudo systemctl restart earlyoom
	else
		sudo systemctl start earlyoom
	fi
	echo "$log_prefix memory bubble on: system.slice MemoryMax=$(systemctl show -P MemoryMax system.slice), earlyoom $(systemctl is-active earlyoom), machine server OOMPolicy=$(systemctl show -P OOMPolicy capy-machine-server.service)"
}
