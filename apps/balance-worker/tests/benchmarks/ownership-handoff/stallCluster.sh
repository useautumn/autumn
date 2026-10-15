#!/usr/bin/env bash
# Three combined broker+controller KRaft nodes for brokerStall.ts. Clients reach node n through
# stallProxy.ts on 29n92 (the advertised listener); the brokers' own listeners sit on 39n92 and
# replicate between themselves on 39n93, so only client traffic crosses the proxy.
#
#   stallCluster.sh start | stop
set -euo pipefail

KAFKA_HOME="${KAFKA_HOME:-$HOME/.cache/autumn-capy/kafka_2.13-3.9.1}"
DIR="${STALL_CLUSTER_DIR:-$HOME/.capy/work/stall-cluster}"
CLUSTER_ID="${STALL_CLUSTER_ID:-bCYdDm7fQSmyaPKhP3a7vw}"
VOTERS="1@127.0.0.1:29193,2@127.0.0.1:29293,3@127.0.0.1:29393"

start() {
	mkdir -p "$DIR"
	for n in 1 2 3; do
		local props="$DIR/node$n.properties"
		cat >"$props" <<EOF
process.roles=broker,controller
node.id=$n
controller.quorum.voters=$VOTERS
listeners=CLIENT://127.0.0.1:39${n}92,INTERNAL://127.0.0.1:39${n}93,CONTROLLER://127.0.0.1:29${n}93
advertised.listeners=CLIENT://127.0.0.1:29${n}92,INTERNAL://127.0.0.1:39${n}93
listener.security.protocol.map=CLIENT:PLAINTEXT,INTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT
inter.broker.listener.name=INTERNAL
controller.listener.names=CONTROLLER
log.dirs=$DIR/data$n
num.partitions=1
default.replication.factor=3
min.insync.replicas=2
offsets.topic.replication.factor=3
transaction.state.log.replication.factor=3
transaction.state.log.min.isr=2
group.initial.rebalance.delay.ms=0
auto.create.topics.enable=false
EOF
		if [ ! -f "$DIR/data$n/meta.properties" ]; then
			"$KAFKA_HOME/bin/kafka-storage.sh" format -t "$CLUSTER_ID" -c "$props" >/dev/null
		fi
		KAFKA_HEAP_OPTS="-Xms256m -Xmx384m" LOG_DIR="$DIR/logs$n" \
			"$KAFKA_HOME/bin/kafka-server-start.sh" -daemon "$props"
	done
	for n in 1 2 3; do
		for _ in $(seq 1 60); do
			if (exec 3<>/dev/tcp/127.0.0.1/39${n}92) 2>/dev/null; then break; fi
			sleep 1
		done
	done
	echo "brokers listening on 39192/39292/39392 behind proxies 29192/29292/29392"
}

stop() {
	pkill -f "$DIR/node[123].properties" || true
}

"${1:-start}"
