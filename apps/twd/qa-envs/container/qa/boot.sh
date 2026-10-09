#!/usr/bin/env bash
# Boots the QA stack from a prepared snapshot. The disk is fresh on every wake, so
# Dragonfly, fakecloud and Kafka start empty; state lives in the env's Neon branch.
# Env (from the Durable Object): DATABASE_URL BETTER_AUTH_SECRET ENCRYPTION_IV ENCRYPTION_PASSWORD PUBLIC_URL
set -uo pipefail
log() { echo "[qa-boot] $(date -u +%H:%M:%S.%N | cut -c1-12) $*"; }
mkdir -p /var/qa/logs /var/qa/kafka /var/qa/dragonfly
L=/var/qa/logs
exec > >(tee -a "$L/boot.log") 2>&1
date +%s%N >/var/qa/boot-start
log "boot"

# Front proxy first so the Worker's readiness probe has something to talk to.
bun /qa/proxy.ts >"$L/proxy.log" 2>&1 &

dragonfly --port 6379 --bind 127.0.0.1 --dir /var/qa/dragonfly --dbfilename "" \
	--proactor_threads 1 --maxmemory 512mb --logtostderr >"$L/dragonfly.log" 2>&1 &
FAKECLOUD_REGION=us-east-2 fakecloud --addr 127.0.0.1:4566 >"$L/fakecloud.log" 2>&1 &

cat >/var/qa/kafka/server.properties <<EOF
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@127.0.0.1:19093
listeners=HOST://127.0.0.1:19092,CONTROLLER://127.0.0.1:19093
advertised.listeners=HOST://127.0.0.1:19092
listener.security.protocol.map=HOST:PLAINTEXT,CONTROLLER:PLAINTEXT
inter.broker.listener.name=HOST
controller.listener.names=CONTROLLER
log.dirs=/var/qa/kafka/data
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
group.initial.rebalance.delay.ms=0
auto.create.topics.enable=false
EOF
(
	/opt/kafka/bin/kafka-storage.sh format -t "$(/opt/kafka/bin/kafka-storage.sh random-uuid)" \
		-c /var/qa/kafka/server.properties >/dev/null &&
		KAFKA_HEAP_OPTS="-Xms128m -Xmx384m" LOG_DIR="$L/kafka" \
			exec /opt/kafka/bin/kafka-server-start.sh /var/qa/kafka/server.properties
) >"$L/kafka.log" 2>&1 &

SQS="http://localhost:4566/123456789012"
export NODE_ENV=development CAPY_DEV=1 SERVER_PORT=8080 WORKER_PROCESSES=1 \
	DATABASE_CRITICAL_URL="$DATABASE_URL" \
	REDIS_URL=redis://localhost:6379 MISC_CACHE_DRAGONFLY_PUBLIC_URL=redis://localhost:6379 \
	CACHE_V2_DRAGONFLY_URL=redis://localhost:6379 CACHE_V2_DRAGONFLY_PUBLIC_URL=redis://localhost:6379 \
	DYNAMODB_ENDPOINT=http://localhost:4566 KAFKA_BROKERS=127.0.0.1:19092 KAFKA_AUTH_MODE=none \
	KAFKAJS_LOG_LEVEL=error \
	SQS_QUEUE_URL="$SQS/autumn.fifo" SQS_QUEUE_URL_V2="$SQS/autumn.fifo" \
	TRACK_SQS_QUEUE_URL="$SQS/autumn-track.fifo" TRACK_ASYNC_SQS_QUEUE_URL="$SQS/autumn-track.fifo" \
	TRACK_ASYNC_STANDARD_SQS_QUEUE_URL="$SQS/autumn-track-async" \
	STRIPE_WEBHOOK_SQS_QUEUE_URL="$SQS/autumn-stripe-webhook.fifo" \
	AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN=arn:aws:iam::123456789012:role/fakecloud-scheduler \
	AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=x AWS_SECRET_ACCESS_KEY=x \
	AUTUMN_API_URL="$PUBLIC_URL" AUTUMN_PUBLIC_API_URL="$PUBLIC_URL" \
	CLIENT_URL="$PUBLIC_URL" GOOGLE_CLIENT_ID=capy-emulate GOOGLE_CLIENT_SECRET=capy-emulate \
	STRIPE_WEBHOOK_SKIP_VERIFY=true TESTS_ORG=unit-test-org TESTS_ORG_ID=org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt \
	BALANCE_WORKER_PORT=8082 BALANCE_WORKER_HOST=127.0.0.1 BALANCE_WORKER_ENDPOINT=http://127.0.0.1:8082 \
	TRIGGER_API_URL="" TRIGGER_ACCESS_TOKEN="" TRIGGER_SERVER_SECRET_KEY=""

wait_port() { for _ in $(seq 1 1200); do (echo >"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0; sleep 0.1; done; return 1; }

wait_port 4566 && for q in autumn.fifo autumn-track.fifo autumn-stripe-webhook.fifo autumn-track-async; do
	attrs='{}'
	[[ $q == *.fifo ]] && attrs='{"FifoQueue":"true","ContentBasedDeduplication":"true"}'
	curl -s -o /dev/null -X POST localhost:4566/ -H 'content-type: application/x-amz-json-1.0' \
		-H 'x-amz-target: AmazonSQS.CreateQueue' -d "{\"QueueName\":\"$q\",\"Attributes\":$attrs}"
done
log "fakecloud queues ready"
wait_port 6379 && log "dragonfly ready"

supervise() { # name, dir, cmd...: restart on exit, like dev's restart loop
	local name=$1 dir=$2; shift 2
	( cd "$dir" && while true; do "$@"; echo "[qa-boot] $name exited $?, restarting"; sleep 2; done ) >>"$L/$name.log" 2>&1 &
}

# The balance worker owns every partition before the env reports ready; it needs only Kafka and Neon.
(
	wait_port 19092 && log "kafka ready"
	# Kafka is fresh, so balance-worker bookmarks in Neon point past its empty logs.
	psql "$DATABASE_URL" -q -c "DELETE FROM partition_progress WHERE topic LIKE 'local-%'"
	cd /app/apps/balance-worker && bun --config=./bunfig.toml scripts/setupLocalTopics.ts >>"$L/balance-worker.log" 2>&1
	supervise balance-worker /app/apps/balance-worker bun --config=./bunfig.toml src/main.ts
	log "balance worker started"
	# Commands fail with NO_OWNER until each partition's preparing → ready → claimed records land.
	until /opt/kafka/bin/kafka-get-offsets.sh --bootstrap-server 127.0.0.1:19092 --topic local-ownership 2>/dev/null |
		awk -F: '$3 >= 3 { n++ } END { exit !(n >= 4) }'; do sleep 1; done
	sleep 1
	touch /var/qa/balance-owned
	log "balance worker owns every partition"
) &

supervise server /app/server bun src/index.ts
# The rest would compete with the server's 20+ s of module loading on 2 vCPUs.
wait_port 8080 && log "server listening"
supervise workers /app/server bun src/workers.ts
supervise cron /app/server bun src/cron.ts
log "all processes started"
wait
