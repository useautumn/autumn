#!/usr/bin/env bash
# Native Apache Kafka for Capy VMs: the balance worker's broker, run as a JVM process
# rather than a container. Redpanda was rejected because it fails the worker's handoff tests.
set -euo pipefail

CAPY_KAFKA_VERSION="3.9.1"
CAPY_KAFKA_DIST="kafka_2.13-${CAPY_KAFKA_VERSION}"
CAPY_KAFKA_HOME="${CAPY_KAFKA_HOME:-$HOME/.cache/autumn-capy/$CAPY_KAFKA_DIST}"
export CAPY_KAFKA_HOME

# archive.apache.org is authoritative for the checksum but slow, so mirrors go first.
CAPY_KAFKA_MIRRORS=(
	"https://dlcdn.apache.org/kafka"
	"https://mirror.lyrahosting.com/apache/kafka"
	"https://archive.apache.org/dist/kafka"
)

install_capy_kafka() {
	local log_prefix="${1:-[capy-kafka]}"
	if [ -x "$CAPY_KAFKA_HOME/bin/kafka-server-start.sh" ]; then
		return 0
	fi
	command -v java >/dev/null 2>&1 || {
		echo "$log_prefix ERROR: java is required to run Kafka" >&2
		return 1
	}

	local tmp expected actual mirror
	tmp="$(mktemp -d)"
	trap 'rm -rf "$tmp"' RETURN
	expected="$(curl -fsSL --retry 3 "https://archive.apache.org/dist/kafka/$CAPY_KAFKA_VERSION/$CAPY_KAFKA_DIST.tgz.sha512" |
		sed 's/^[^:]*://' | tr -d ' \n' | tr 'A-F' 'a-f')"
	[ -n "$expected" ] || {
		echo "$log_prefix ERROR: could not fetch the Kafka checksum" >&2
		return 1
	}

	for mirror in "${CAPY_KAFKA_MIRRORS[@]}"; do
		echo "$log_prefix downloading Kafka $CAPY_KAFKA_VERSION from $mirror"
		curl -fsSL --retry 2 -o "$tmp/kafka.tgz" "$mirror/$CAPY_KAFKA_VERSION/$CAPY_KAFKA_DIST.tgz" || continue
		actual="$(sha512sum "$tmp/kafka.tgz" | cut -d' ' -f1)"
		[ "$actual" = "$expected" ] && break
		echo "$log_prefix checksum mismatch from $mirror" >&2
		actual=""
	done
	[ -n "${actual:-}" ] || {
		echo "$log_prefix ERROR: no mirror served a verified Kafka $CAPY_KAFKA_VERSION" >&2
		return 1
	}

	mkdir -p "$(dirname "$CAPY_KAFKA_HOME")"
	tar -xzf "$tmp/kafka.tgz" -C "$tmp"
	rm -rf "$CAPY_KAFKA_HOME"
	mv "$tmp/$CAPY_KAFKA_DIST" "$CAPY_KAFKA_HOME"
	echo "$log_prefix Kafka $CAPY_KAFKA_VERSION installed at $CAPY_KAFKA_HOME"
}

capy_kafka_answers() {
	"$CAPY_KAFKA_HOME/bin/kafka-topics.sh" --bootstrap-server "127.0.0.1:$1" --list >/dev/null 2>&1
}

capy_kafka_alive() {
	[ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null
}

start_capy_kafka() {
	local log_prefix="${1:-[capy-kafka]}"
	local port="${CAPY_KAFKA_PORT:-19092}"
	local controller_port="${CAPY_KAFKA_CONTROLLER_PORT:-19093}"
	local dir="${CAPY_PREFIX:?CAPY_PREFIX is required}/kafka"
	local pid_file="$dir/kafka.pid"
	mkdir -p "$dir"

	if capy_kafka_alive "$pid_file" && capy_kafka_answers "$port"; then
		echo "$log_prefix kafka already running on :$port"
		return 0
	fi
	[ -x "$CAPY_KAFKA_HOME/bin/kafka-server-start.sh" ] || {
		echo "$log_prefix ERROR: Kafka is not installed at $CAPY_KAFKA_HOME; run capy-init.sh" >&2
		return 1
	}

	cat >"$dir/server.properties" <<EOF
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@127.0.0.1:$controller_port
listeners=HOST://127.0.0.1:$port,CONTROLLER://127.0.0.1:$controller_port
advertised.listeners=HOST://127.0.0.1:$port
listener.security.protocol.map=HOST:PLAINTEXT,CONTROLLER:PLAINTEXT
inter.broker.listener.name=HOST
controller.listener.names=CONTROLLER
log.dirs=$dir/data
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
group.initial.rebalance.delay.ms=0
auto.create.topics.enable=false
# A VM wake drops the page cache; unflushed records vanish while Neon keeps bookmarks past them.
log.flush.interval.messages=1
EOF
	if [ ! -f "$dir/data/meta.properties" ]; then
		"$CAPY_KAFKA_HOME/bin/kafka-storage.sh" format \
			-t "$("$CAPY_KAFKA_HOME/bin/kafka-storage.sh" random-uuid)" \
			-c "$dir/server.properties" >/dev/null
	fi

	echo "$log_prefix starting kafka on :$port"
	KAFKA_HEAP_OPTS="-Xms256m -Xmx512m" LOG_DIR="$dir/logs" \
		setsid "$CAPY_KAFKA_HOME/bin/kafka-server-start.sh" "$dir/server.properties" \
		>"$dir/kafka.log" 2>&1 </dev/null &
	echo $! >"$pid_file"

	local _
	for _ in $(seq 1 60); do
		if ! capy_kafka_alive "$pid_file"; then
			break
		fi
		if capy_kafka_answers "$port"; then
			echo "$log_prefix kafka ready on :$port"
			return 0
		fi
		sleep 1
	done
	echo "$log_prefix ERROR: kafka did not become ready on :$port; see $dir/kafka.log" >&2
	tail -20 "$dir/kafka.log" >&2 || true
	return 1
}

stop_capy_kafka() {
	local pid_file="${CAPY_PREFIX:?CAPY_PREFIX is required}/kafka/kafka.pid"
	capy_kafka_alive "$pid_file" || return 0
	local pid _
	pid="$(cat "$pid_file")"
	kill "$pid"
	for _ in $(seq 1 30); do
		kill -0 "$pid" 2>/dev/null || return 0
		sleep 1
	done
	kill -9 "$pid" 2>/dev/null || true
}
