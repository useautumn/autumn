#!/usr/bin/env bash
set -euo pipefail

prefix="${NETCHAOS_PREFIX:-bwc}"
service_ip="${NETCHAOS_SERVICE_IP:-10.199.0.1}"
xdp_dir="${NETCHAOS_XDP_DIR:-${HOME}/.cache/netchaos-xdp}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ns_of() { echo "${prefix}$1"; }
host_if() { echo "${prefix}$1h"; }
ns_if() { echo "${prefix}$1n"; }

up() {
	local count="$1"
	sudo sysctl -qw net.ipv4.ip_forward=1
	sudo ip addr replace "${service_ip}/32" dev lo
	for i in $(seq 1 "$count"); do
		local ns host nsif
		ns="$(ns_of "$i")"
		host="$(host_if "$i")"
		nsif="$(ns_if "$i")"
		if [ -e "/var/run/netns/$ns" ]; then continue; fi
		sudo ip netns add "$ns"
		sudo ip link add "$host" gso_max_segs 1 type veth peer name "$nsif" gso_max_segs 1
		sudo ip link set "$nsif" netns "$ns"
		sudo ip addr add "10.200.$i.1/24" dev "$host"
		sudo ip link set "$host" up
		sudo ip netns exec "$ns" ip addr add "10.200.$i.2/24" dev "$nsif"
		sudo ip netns exec "$ns" ip link set "$nsif" up
		sudo ip netns exec "$ns" ip link set lo up
		sudo ip netns exec "$ns" ip route add default via "10.200.$i.1"
		sudo iptables -t nat -C POSTROUTING -s "10.200.$i.0/24" ! -d 10.200.0.0/16 -j MASQUERADE 2>/dev/null ||
			sudo iptables -t nat -A POSTROUTING -s "10.200.$i.0/24" ! -d 10.200.0.0/16 -j MASQUERADE
		sudo iptables -C FORWARD -i "$host" -j ACCEPT 2>/dev/null || sudo iptables -I FORWARD -i "$host" -j ACCEPT
		sudo iptables -C FORWARD -o "$host" -j ACCEPT 2>/dev/null || sudo iptables -I FORWARD -o "$host" -j ACCEPT
	done
}

down() {
	for path in /var/run/netns/"${prefix}"*; do
		[ -e "$path" ] || continue
		local ns i
		ns="$(basename "$path")"
		i="${ns#"${prefix}"}"
		sudo iptables -t nat -D POSTROUTING -s "10.200.$i.0/24" ! -d 10.200.0.0/16 -j MASQUERADE 2>/dev/null || true
		sudo iptables -D FORWARD -i "$(host_if "$i")" -j ACCEPT 2>/dev/null || true
		sudo iptables -D FORWARD -o "$(host_if "$i")" -j ACCEPT 2>/dev/null || true
		sudo ip link del "$(host_if "$i")" 2>/dev/null || true
		sudo ip netns del "$ns"
	done
}

xdp_obj() {
	local permille="$1" port="${2:-0}"
	local obj="$xdp_dir/xdp-loss-$permille-$port.o"
	mkdir -p "$xdp_dir"
	if [ ! -f "$obj" ]; then
		clang -O2 -g -target bpf -I/usr/include/x86_64-linux-gnu \
			-DLOSS_PER_MILLE="$permille" -DMATCH_PORT="$port" \
			-c "$here/xdpLoss.c" -o "$obj"
	fi
	echo "$obj"
}

attach_out() {
	sudo ip link set dev "$(host_if "$1")" xdpgeneric off
	sudo ip link set dev "$(host_if "$1")" xdpgeneric obj "$2" sec xdp
}

attach_in() {
	sudo ip netns exec "$(ns_of "$1")" ip link set dev "$(ns_if "$1")" xdpgeneric off
	sudo ip netns exec "$(ns_of "$1")" ip link set dev "$(ns_if "$1")" xdpgeneric obj "$2" sec xdp
}

loss() {
	local i="$1" permille="$2" direction="$3" port="${4:-0}"
	local obj
	obj="$(xdp_obj "$permille" "$port")"
	case "$direction" in
	both)
		attach_out "$i" "$obj"
		attach_in "$i" "$obj"
		;;
	out) attach_out "$i" "$obj" ;;
	in) attach_in "$i" "$obj" ;;
	*)
		echo "direction must be both, in or out" >&2
		exit 2
		;;
	esac
	echo "loss $permille/1000 $direction port=$port on $(ns_of "$i")"
}

clear_loss() {
	local i="$1"
	sudo ip link set dev "$(host_if "$i")" xdpgeneric off
	sudo ip netns exec "$(ns_of "$i")" ip link set dev "$(ns_if "$i")" xdpgeneric off
	echo "cleared $(ns_of "$i")"
}

show() {
	for path in /var/run/netns/"${prefix}"*; do
		[ -e "$path" ] || continue
		local ns i
		ns="$(basename "$path")"
		i="${ns#"${prefix}"}"
		ip link show dev "$(host_if "$i")"
		sudo ip netns exec "$ns" ip link show dev "$(ns_if "$i")"
	done
}

command="${1:-}"
shift || true
case "$command" in
up) up "${1:-6}" ;;
down) down ;;
loss) loss "$@" ;;
clear) clear_loss "$@" ;;
show) show ;;
*)
	echo "usage: $0 up <count> | down | loss <index> <per-mille> <both|in|out> [port] | clear <index> | show" >&2
	exit 2
	;;
esac
