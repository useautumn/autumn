#!/usr/bin/env bash
# Three combined broker+controller KRaft nodes for brokerChaos.ts, each in its own network namespace
# (10.77.n.2) so iptables can cut one broker off from the clients, from its peers, or both, by address.
#
#   node n listens on 10.77.n.2:9092 DIRECT   (advertised as itself: clients that bootstrap here go direct)
#                     10.77.n.2:9093 PROXIED  (advertised as 127.0.0.1:29n92, where stallProxy.ts listens)
#                     10.77.n.2:9094 INTERNAL (replication), 10.77.n.2:9095 CONTROLLER (KRaft quorum)
#
#   chaosCluster.sh net-up | net-down | start | stop | wipe
#   chaosCluster.sh kill <n> <TERM|KILL> | start-node <n> | pid <n> | wait-node <n>
#   chaosCluster.sh cut <n> <clients|brokers|full> | heal
#   chaosCluster.sh direct | proxied        print the bootstrap list
set -euo pipefail

KAFKA_HOME="${KAFKA_HOME:-$HOME/.capy/work/kafka_2.13-4.3.1}"
DIR="${CHAOS_CLUSTER_DIR:-$HOME/.capy/work/chaos-cluster}"
CLUSTER_ID="${CHAOS_CLUSTER_ID:-cHa0sKafkaKiller4p31Aw}"
HEAP="${CHAOS_BROKER_HEAP:-384m}"
CHAIN=KCHAOS
ip_of() { echo "10.77.$1.2"; }
VOTERS="1@$(ip_of 1):9095,2@$(ip_of 2):9095,3@$(ip_of 3):9095"

net_up() {
	sudo sysctl -qw net.ipv4.ip_forward=1
	for n in 1 2 3; do
		if ! sudo ip netns list | grep -q "^kchaos$n\b"; then
			sudo ip netns add "kchaos$n"
			sudo ip link add "kc${n}h" type veth peer name "kc${n}n"
			sudo ip link set "kc${n}n" netns "kchaos$n"
			sudo ip addr add "10.77.$n.1/24" dev "kc${n}h"
			sudo ip link set "kc${n}h" up
			sudo ip netns exec "kchaos$n" ip addr add "$(ip_of "$n")/24" dev "kc${n}n"
			sudo ip netns exec "kchaos$n" ip link set "kc${n}n" up
			sudo ip netns exec "kchaos$n" ip link set lo up
			sudo ip netns exec "kchaos$n" ip route add default via "10.77.$n.1"
		fi
	done
	if ! sudo iptables -L "$CHAIN" -n >/dev/null 2>&1; then
		sudo iptables -N "$CHAIN"
		sudo iptables -I FORWARD 1 -s 10.77.0.0/16 -d 10.77.0.0/16 -j ACCEPT
		for hook in FORWARD INPUT OUTPUT; do sudo iptables -I "$hook" 1 -j "$CHAIN"; done
	fi
}

net_down() {
	if sudo iptables -L "$CHAIN" -n >/dev/null 2>&1; then
		for hook in FORWARD INPUT OUTPUT; do sudo iptables -D "$hook" -j "$CHAIN" || true; done
		sudo iptables -D FORWARD -s 10.77.0.0/16 -d 10.77.0.0/16 -j ACCEPT || true
		sudo iptables -F "$CHAIN"
		sudo iptables -X "$CHAIN"
	fi
	for n in 1 2 3; do sudo ip netns del "kchaos$n" 2>/dev/null || true; done
}

props_of() {
	local n=$1 ip
	ip=$(ip_of "$n")
	cat <<EOF
process.roles=broker,controller
node.id=$n
controller.quorum.voters=$VOTERS
listeners=DIRECT://$ip:9092,PROXIED://$ip:9093,INTERNAL://$ip:9094,CONTROLLER://$ip:9095
advertised.listeners=DIRECT://$ip:9092,PROXIED://127.0.0.1:29${n}92,INTERNAL://$ip:9094
listener.security.protocol.map=DIRECT:PLAINTEXT,PROXIED:PLAINTEXT,INTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT
inter.broker.listener.name=INTERNAL
controller.listener.names=CONTROLLER
log.dirs=$DIR/data$n
num.partitions=1
default.replication.factor=3
min.insync.replicas=2
offsets.topic.replication.factor=3
transaction.state.log.replication.factor=3
transaction.state.log.min.isr=2
share.coordinator.state.topic.replication.factor=3
group.initial.rebalance.delay.ms=0
auto.create.topics.enable=false
EOF
}

start_node() {
	local n=$1 props="$DIR/node$1.properties"
	if pid_of "$n" >/dev/null; then return 0; fi
	sudo ip netns exec "kchaos$n" sudo -u "$USER" -H env PATH="$PATH" \
		KAFKA_HEAP_OPTS="-Xms$HEAP -Xmx$HEAP" LOG_DIR="$DIR/logs$n" \
		"$KAFKA_HOME/bin/kafka-server-start.sh" -daemon "$props"
}

pid_of() { pgrep -f "java.*$DIR/node$1.properties"; }

wait_node() {
	local n=$1
	for _ in $(seq 1 90); do
		if (exec 3<>"/dev/tcp/$(ip_of "$n")/9092") 2>/dev/null; then return 0; fi
		sleep 1
	done
	echo "node $n never listened" >&2
	return 1
}

start() {
	net_up
	mkdir -p "$DIR"
	for n in 1 2 3; do
		props_of "$n" >"$DIR/node$n.properties"
		if [ ! -f "$DIR/data$n/meta.properties" ]; then
			"$KAFKA_HOME/bin/kafka-storage.sh" format -t "$CLUSTER_ID" -c "$DIR/node$n.properties" >/dev/null
		fi
		start_node "$n"
	done
	for n in 1 2 3; do wait_node "$n"; done
	echo "brokers up: direct $(direct) | proxied $(proxied)"
}

stop() {
	pkill -f "java.*$DIR/node[123].properties" || true
	for _ in $(seq 1 30); do
		pgrep -f "java.*$DIR/node[123].properties" >/dev/null || return 0
		sleep 1
	done
	pkill -9 -f "java.*$DIR/node[123].properties" || true
}

kill_node() {
	local n=$1 signal=$2 pid
	pid=$(pid_of "$n")
	kill "-$signal" "$pid"
	echo "$pid"
}

cut() {
	local n=$1 mode=$2 ip
	ip=$(ip_of "$n")
	case "$mode" in clients | brokers | full) ;; *)
		echo "unknown mode $mode" >&2
		return 1
		;;
	esac
	# Clients live in the root namespace and reach node n from its veth's host side, 10.77.n.1.
	if [ "$mode" != brokers ]; then
		sudo iptables -A "$CHAIN" -s "10.77.$n.1" -d "$ip" -j DROP
		sudo iptables -A "$CHAIN" -s "$ip" -d "10.77.$n.1" -j DROP
	fi
	if [ "$mode" != clients ]; then
		for m in 1 2 3; do
			[ "$m" = "$n" ] && continue
			sudo iptables -A "$CHAIN" -s "$ip" -d "$(ip_of "$m")" -j DROP
			sudo iptables -A "$CHAIN" -s "$(ip_of "$m")" -d "$ip" -j DROP
		done
	fi
}

heal() { sudo iptables -F "$CHAIN"; }

direct() { echo "$(ip_of 1):9092,$(ip_of 2):9092,$(ip_of 3):9092"; }
proxied() { echo "127.0.0.1:29192,127.0.0.1:29292,127.0.0.1:29392"; }

cmd=${1:-start}
shift || true
case "$cmd" in
net-up) net_up ;;
net-down) net_down ;;
start) start ;;
stop) stop ;;
wipe) stop && rm -rf "$DIR" ;;
kill) kill_node "$@" ;;
start-node) start_node "$@" ;;
wait-node) wait_node "$@" ;;
pid) pid_of "$@" ;;
cut) cut "$@" ;;
heal) heal ;;
direct) direct ;;
proxied) proxied ;;
*)
	echo "unknown command $cmd" >&2
	exit 1
	;;
esac
