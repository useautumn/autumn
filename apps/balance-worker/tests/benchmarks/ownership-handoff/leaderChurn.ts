/**
 * Replays broker-side faults against real balance workers while this process hammers the routing
 * client at 20 req/s per partition. CHURN_SCENARIO picks the fault:
 *
 *   leader       (default) every few seconds every partition led by one broker moves onto the other
 *                two, so a fetch to the old leader answers NOT_LEADER: a Confluent leader election.
 *   coordinator  every few seconds the __consumer_offsets partitions coordinating the worker group, the
 *                routing client's ownership group and a herald-style group move off their leader, so
 *                every member hears NOT_COORDINATOR and the group is reloaded on another broker.
 *   partitions   once, the metering, ownership and command topics grow to CHURN_GROW_TO partitions;
 *                with CHURN_SPAWN_AFTER_GROW a fresh worker then boots against the grown topics.
 *
 * Workers run as subprocesses of benchWorker.ts. The report covers outcomes, group joins and
 * re-prepares per phase, consumer crashes of every group (workers, routing, herald-style), recovery
 * time once the fault is cleared, and a reconciliation of every success the client saw against the
 * metering log (read committed, from the beginning) and the balances in Postgres.
 *
 *   cd apps/balance-worker
 *   KAFKA_BROKERS=<3 brokers> KAFKA_BIN=... DATABASE_URL=... NODE_ENV=test bun run benchmark:leader-churn
 *
 * KAFKA_BIN names the Kafka distribution's bin/ directory; reassignments, coordinator lookups and
 * partition growth go through its Java admin (ReassignPartitions.java) because librdkafka's admin has
 * none of them.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTrackCommand } from "@autumn/balance-engine";
import {
	BalanceWorkerClientError,
	createBalanceWorkerClient,
} from "@autumn/balance-worker-client";
import {
	BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY,
	defaultSubjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	BALANCE_WORKER_REQUEST_TIMEOUT_MS,
	BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import {
	type Consumer,
	type ConsumerConfig,
	createConsumerGroupConfig,
	createOwnershipConsumer,
	type Kafka,
	meteringIdentityToPartition,
	ownershipTopic,
	parseTrustedMeteringRecord,
} from "@autumn/kafka";
import { createTestKafka } from "../../fixtures/testKafka.js";
import {
	openFixturePostgres,
	type SeededCustomer,
	seedCustomer,
} from "../../integration/postgres/postgresCustomerFixture.js";

const BACKEND = "postgres" as const;
const PARTITION_COUNT = Number(process.env.CHURN_PARTITIONS ?? 16);
const REPLICATION = Number(process.env.CHURN_RF ?? 2);
const HAMMER_INTERVAL_MS = 50;
const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
if (brokers.length === 0) throw new Error("KAFKA_BROKERS is required");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
	throw new Error("DATABASE_URL is required (a migrated Postgres)");
const kafkaBin = process.env.KAFKA_BIN;
if (!kafkaBin)
	throw new Error("KAFKA_BIN is required (Kafka's bin/ directory)");

type WorkerEvent = { t: number; worker: string; event: string } & Record<
	string,
	unknown
>;
type OwnershipEvent = {
	seenAt: number;
	partition: number;
	offset: string;
	type: "claimed" | "unowned" | "released" | "ready" | "draining" | "preparing";
	endpoint?: string;
	at: number;
};
type ClientOutcome = {
	commandId: string;
	partition: number;
	sentAt: number;
	doneAt: number;
	outcome: string;
};
type RawHttp = {
	lane: "hammer" | "probe";
	partition: number;
	endpoint: string;
	sentAt: number;
	doneAt: number;
	status: number | "error";
};

const workerEvents: WorkerEvent[] = [];

/** When the record's author wrote it, whichever kind it is. */
function recordTimestamp({
	record,
}: {
	record: ReturnType<typeof ownershipTopic.parse>;
}): number {
	switch (record.type) {
		case "claimed":
			return record.claimedAt;
		case "ready":
			return record.readyAt;
		case "draining":
			return record.drainingAt;
		case "preparing":
			return record.preparingAt;
		case "unowned":
		case "released":
			return record.releasedAt;
	}
}

const ownershipEvents: OwnershipEvent[] = [];
const outcomes: ClientOutcome[] = [];
const probeOutcomes: ClientOutcome[] = [];
const rawHttp: RawHttp[] = [];

const deployment = `bench-${crypto.randomUUID().slice(0, 8)}`;
const topics = {
	metering: `${deployment}-events`,
	ownership: `${deployment}-ownership`,
	commands: `${deployment}-commands`,
	catalog: `${deployment}-catalog-invalidations`,
};
const kafka = createTestKafka({ clientId: deployment, brokers });
const admin = kafka.admin();
await admin.connect();
await admin.createTopics({
	topics: [
		{
			topic: topics.metering,
			numPartitions: PARTITION_COUNT,
			replicationFactor: REPLICATION,
		},
		{
			topic: topics.commands,
			numPartitions: PARTITION_COUNT,
			replicationFactor: REPLICATION,
		},
		{
			topic: topics.ownership,
			numPartitions: PARTITION_COUNT,
			replicationFactor: REPLICATION,
			configEntries: [{ name: "cleanup.policy", value: "compact" }],
		},
		{ topic: topics.catalog, numPartitions: 1, replicationFactor: REPLICATION },
	],
});

// Every broker must know the new topics before a producer or consumer asks one that does not yet.
for (let attempt = 0; ; attempt++) {
	try {
		const metadata = await admin.fetchTopicMetadata({
			topics: Object.values(topics),
		});
		if (metadata.topics.every((t) => t.partitions.every((p) => p.leader >= 0)))
			break;
	} catch (cause) {
		if (attempt > 30) throw cause;
	}
	await Bun.sleep(500);
}
await Bun.sleep(3_000);

// One customer per partition, seeded the way the postgres integration tests do it.
const postgres = openFixturePostgres({ databaseUrl });
const customers = new Map<number, SeededCustomer>();
const extraCustomers: SeededCustomer[] = [];
while (customers.size < PARTITION_COUNT) {
	const customer = await seedCustomer({ postgres, balance: 1_000_000_000 });
	const partition = meteringIdentityToPartition({
		identity: customer.identity,
		partitionCount: PARTITION_COUNT,
	});
	if (customers.has(partition)) extraCustomers.push(customer);
	else customers.set(partition, customer);
}

// Raw view of the ownership log: every record with its payload timestamp and when we saw it.
const watcher = kafka.consumer({ groupId: `${deployment}-watch` });
await watcher.connect();
await watcher.subscribe({ topics: [topics.ownership], fromBeginning: true });
await watcher.run({
	eachMessage: async ({ partition, message }) => {
		const record = ownershipTopic.parse({
			key: message.key,
			value: message.value,
		});
		ownershipEvents.push({
			seenAt: Date.now(),
			partition,
			offset: message.offset,
			type: record.type,
			endpoint: record.endpoint,
			at: recordTimestamp({ record }),
		});
	},
});

/** Every group consumer's lifecycle, under the name of the process that owns it. */
function instrumentConsumer({
	consumer,
	owner,
	groupId,
}: {
	consumer: Consumer;
	owner: string;
	groupId: string;
}): Consumer {
	consumer.on(consumer.events.GROUP_JOIN, (event) =>
		workerEvents.push({
			t: Date.now(),
			worker: owner,
			event: "consumer.group_join",
			groupId,
			assignment: event.payload.memberAssignment,
		}),
	);
	consumer.on(consumer.events.REBALANCING, () =>
		workerEvents.push({
			t: Date.now(),
			worker: owner,
			event: "consumer.rebalancing",
			groupId,
		}),
	);
	consumer.on(consumer.events.CRASH, (event) => {
		workerEvents.push({
			t: Date.now(),
			worker: owner,
			event: "consumer.crash",
			groupId,
			restart: event.payload.restart,
			error: String(event.payload.error),
		});
		console.error(
			`[${owner}] consumer crash restart=${event.payload.restart}: ${event.payload.error}`,
		);
	});
	return consumer;
}
const groupIds: Record<string, string> = {};
/** The routing client's Kafka, with its ownership consumer instrumented like a worker's. */
const routingKafka = {
	producer: (config?: Parameters<Kafka["producer"]>[0]) =>
		kafka.producer(config),
	admin: () => kafka.admin(),
	consumer(config: ConsumerConfig) {
		groupIds.routing = config.groupId;
		return instrumentConsumer({
			consumer: kafka.consumer(config),
			owner: "routing",
			groupId: config.groupId,
		});
	},
};

// The same client a server uses, with production budgets, plus a tap on the raw HTTP layer.
const routing = createOwnershipConsumer({
	ctx: {
		kafka: routingKafka,
		onFailed: ({ cause }) => {
			workerEvents.push({
				t: Date.now(),
				worker: "routing",
				event: "routing.failed",
				error: String(cause),
			});
			console.error(`[routing] ownership consumer failed: ${cause}`);
		},
	},
	config: { topic: topics.ownership },
});
await routing.start();

// A herald job's consumer shape: its own group, the broker's uniform dealing, statistics-driven liveness.
const heraldSeen = new Map<number, Set<string>>();
groupIds.herald = `${deployment}-herald`;
const herald = instrumentConsumer({
	consumer: kafka.consumer({
		...createConsumerGroupConfig({
			groupId: groupIds.herald,
			timings: {
				fetchMaxWaitTimeMs: 250,
				heartbeatIntervalMs: 3000,
				rebalanceTimeoutMs: 60000,
				sessionTimeoutMs: 30000,
			},
			remoteAssignor: "uniform",
		}),
		statisticsIntervalMs: 1_000,
	}),
	owner: "herald",
	groupId: groupIds.herald,
});
await herald.connect();
await herald.subscribe({ topics: [topics.metering], fromBeginning: true });
await herald.run({
	partitionsConsumedConcurrently: 8,
	eachMessage: async ({ partition, message }) => {
		const seen = heraldSeen.get(partition) ?? new Set<string>();
		seen.add(message.offset);
		heraldSeen.set(partition, seen);
	},
});
const client = createBalanceWorkerClient({
	ctx: {
		owners: routing,
		http: {
			async postJson({ url, body, signal }) {
				const sentAt = Date.now();
				// Tracks travel batched per partition now; the lane is the batch's, and every batch here is one lane.
				const { route, command, commands } = body as {
					route: { partition: number };
					command?: { requestId: string };
					commands?: { requestId: string }[];
				};
				const requestId = command?.requestId ?? commands?.[0]?.requestId ?? "";
				const lane = requestId.startsWith("probe-") ? "probe" : "hammer";
				const endpoint = new URL(url).origin;
				try {
					const response = await fetch(url, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
						signal,
					});
					const json = await response.json();
					if (response.status >= 500 && process.env.BENCH_DEBUG)
						console.error("worker 5xx", JSON.stringify(json));
					rawHttp.push({
						lane,
						partition: route.partition,
						endpoint,
						sentAt,
						doneAt: Date.now(),
						status: response.status,
					});
					return { status: response.status, body: json };
				} catch (cause) {
					if (process.env.BENCH_DEBUG)
						console.error(`worker transport error ${url}: ${cause}`);
					rawHttp.push({
						lane,
						partition: route.partition,
						endpoint,
						sentAt,
						doneAt: Date.now(),
						status: "error",
					});
					throw cause;
				}
			},
		},
	},
	config: {
		partitionCount: PARTITION_COUNT,
		timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
		routeRefreshTimeoutMs: BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
	},
});

async function trackOnce(
	partition: number,
	lane: "hammer" | "probe" = "hammer",
): Promise<string> {
	const customer = customers.get(partition);
	if (!customer) throw new Error(`No customer for partition ${partition}`);
	const id = `${lane}-${crypto.randomUUID()}`;
	const command = parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			org: {
				config: {
					reverse_deduction_order: false,
					block_overdue_entitlements: false,
					include_past_due: true,
				},
			},
			commandId: id,
			requestId: id,
			identity: customer.identity,
			featureId: customer.featureId,
			internalFeatureId: customer.internalFeatureId,
			value: 1,
			overageBehavior: "reject",
			properties: null,
			usageEvent: { name: customer.featureId, idempotencyKey: null, id: null },
			occurredAt: Date.now(),
		},
	});
	const sentAt = Date.now();
	let outcome = "200";
	try {
		await client.track({ command });
	} catch (cause) {
		outcome =
			cause instanceof BalanceWorkerClientError
				? cause.workerCode
					? `${cause.code}:${cause.workerCode}`
					: cause.code
				: `THROW:${(cause as Error).name}`;
		if (process.env.BENCH_DEBUG)
			console.error(
				`track ${outcome} on partition ${partition}: ${(cause as Error).message} <- ${(cause as Error).cause}`,
			);
	}
	(lane === "probe" ? probeOutcomes : outcomes).push({
		commandId: id,
		partition,
		sentAt,
		doneAt: Date.now(),
		outcome,
	});
	return outcome;
}

let hammering = false;
function startHammer(): void {
	hammering = true;
	for (const partition of customers.keys()) {
		void (async () => {
			let next = Date.now();
			while (hammering) {
				void trackOnce(partition);
				next += HAMMER_INTERVAL_MS;
				await Bun.sleep(Math.max(0, next - Date.now()));
			}
		})();
	}
}

// Workers as subprocesses so a hard kill is a real SIGKILL.
type Worker = {
	name: string;
	endpoint: string;
	child: Bun.Subprocess;
	spawnedAt: number;
	dir: string;
};
const workersByEndpoint = new Map<string, string>();

/** The snapshot settings every spawned worker serves from memory. */
const subjectSnapshotsConfig = {
	...defaultSubjectSnapshotsEdgeConfig(),
	mode: "off" as const,
};
const edgeConfigOverride = Buffer.from(
	JSON.stringify({
		[BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY]: subjectSnapshotsConfig,
	}),
).toString("base64");
async function reservePort(): Promise<number> {
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: () => new Response(),
	});
	const port = server.port;
	await server.stop();
	if (port === undefined) throw new Error("No port");
	return port;
}
async function spawnWorker(name: string): Promise<Worker> {
	const port = await reservePort();
	const dir = mkdtempSync(join(tmpdir(), `bench-${name}-`));
	const env = {
		...createBalanceWorkerEnv({
			DATABASE_URL: databaseUrl,
			KAFKA_BROKERS: brokers.join(","),
			KAFKA_AUTH_MODE: "none",
			KAFKA_GROUP_PROTOCOL: process.env.KAFKA_GROUP_PROTOCOL,
			BALANCE_WORKER_HOST: "127.0.0.1",
			BALANCE_WORKER_PORT: String(port),
			BALANCE_WORKER_SQLITE_PATH: join(dir, "state.sqlite"),
			BALANCE_WORKER_DEPLOYMENT: deployment,
			BALANCE_WORKER_PARTITION_COUNT: String(PARTITION_COUNT),
		}),
		BENCH_NAME: name,
		BENCH_BACKEND: BACKEND,
	};
	const {
		AUTUMN_EDGE_CONFIG_OVERRIDE_B64: _,
		LIBRDKAFKA_DEBUG: __,
		LIBRDKAFKA_TEST_WITHHOLD_DELIVERY: ___,
		...inherited
	} = process.env;
	const child = Bun.spawn(
		["bun", new URL("./benchWorker.ts", import.meta.url).pathname],
		{
			env: {
				...inherited,
				NODE_ENV: "test",
				...(process.env.CHURN_WORKER_LIBRDKAFKA_DEBUG && {
					LIBRDKAFKA_DEBUG: process.env.CHURN_WORKER_LIBRDKAFKA_DEBUG,
				}),
				// Fault injection: only CHURN_FAULT_WORKER withholds its delivery reports (CHURN_FAULT_SPEC).
				...(name === process.env.CHURN_FAULT_WORKER && {
					LIBRDKAFKA_TEST_WITHHOLD_DELIVERY: process.env.CHURN_FAULT_SPEC,
				}),
				AUTUMN_EDGE_CONFIG_OVERRIDE_B64: edgeConfigOverride,
				BENCH_WORKER_ENV: JSON.stringify(env),
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const spawnedAt = Date.now();
	children.push(child);
	workerEvents.push({
		t: spawnedAt,
		worker: name,
		event: "worker.spawned",
		pid: child.pid,
	});
	void child.exited.then((exitCode) =>
		workerEvents.push({
			t: Date.now(),
			worker: name,
			event: "worker.exited",
			exitCode,
			duringRun: hammering,
		}),
	);
	workersByEndpoint.set(env.BALANCE_WORKER_ENDPOINT, name);
	// The producer thread logs to stderr; its lines are kept like stdout's, timestamped on arrival.
	void (async () => {
		let buffered = "";
		for await (const chunk of child.stderr as ReadableStream<Uint8Array>) {
			const text = new TextDecoder().decode(chunk);
			process.stderr.write(text);
			buffered += text;
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) {
				try {
					const parsed = JSON.parse(line);
					if (typeof parsed.message === "string")
						recordKafkaLog({ worker: name, line: parsed });
				} catch {
					// Not a log line.
				}
			}
		}
	})();
	void (async () => {
		let buffered = "";
		for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
			buffered += new TextDecoder().decode(chunk);
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) {
				if (!line) continue;
				// biome-ignore lint/suspicious/noExplicitAny: worker lines are either events or kafka log lines
				let parsed: any;
				try {
					parsed = JSON.parse(line);
				} catch {
					workerEvents.push({
						t: Date.now(),
						worker: name,
						event: "worker.stdout",
						line: line.slice(0, 500),
					});
					continue;
				}
				if (typeof parsed.message === "string") {
					recordKafkaLog({ worker: name, line: parsed });
					continue;
				}
				if (!("event" in parsed)) continue;
				workerEvents.push(parsed);
				if (
					/^(log\.error|error|unhealthy|consumer\.crash|service\.stopped)/.test(
						parsed.event,
					)
				)
					console.error(`[${parsed.worker}] ${line.slice(0, 2000)}`);
			}
		}
	})();
	return { name, endpoint: env.BALANCE_WORKER_ENDPOINT, child, spawnedAt, dir };
}

// A fetch the old leader refused, as librdkafka logs it with `debug: fetch` (LIBRDKAFKA_DEBUG).
const LEADER_FETCH_ERROR =
	/Fetch failed at .*: (NOT_LEADER_OR_FOLLOWER|UNKNOWN_TOPIC_OR_PART|FENCED_LEADER_EPOCH|UNKNOWN_LEADER_EPOCH|LEADER_NOT_AVAILABLE|OFFSET_NOT_AVAILABLE)/;
// librdkafka applying a new leader from metadata (`debug: topic`).
const LEADER_MIGRATION =
	/[Mm]igrating topic|[Dd]elegat|leader .* -> |[Ll]eader changed/;
/** Diagnostics: librdkafka log lines matching CHURN_LOG_MATCH are kept verbatim in the raw data. */
const LOG_MATCH = process.env.CHURN_LOG_MATCH
	? new RegExp(process.env.CHURN_LOG_MATCH, "i")
	: null;
function recordKafkaLog({
	worker,
	line,
}: {
	worker: string;
	line: { message: string; level?: string; groupId?: string };
}): void {
	const leaderError = LEADER_FETCH_ERROR.exec(line.message);
	if (leaderError) {
		workerEvents.push({
			t: Date.now(),
			worker,
			event: "kafka.fetch_leader_error",
			code: leaderError[1],
			message: line.message,
		});
		return;
	}
	if (LOG_MATCH?.test(line.message)) {
		workerEvents.push({
			t: Date.now(),
			worker,
			event: "kafka.match",
			message: line.message,
		});
		return;
	}
	if (LEADER_MIGRATION.test(line.message)) {
		workerEvents.push({
			t: Date.now(),
			worker,
			event: "kafka.leader_migration",
			message: line.message,
		});
		return;
	}
	if (line.level === "WARN" || line.level === "ERROR")
		workerEvents.push({
			t: Date.now(),
			worker,
			event: `kafka.${line.level.toLowerCase()}`,
			message: line.message,
		});
}

const children: Bun.Subprocess[] = [];
process.on("exit", () => {
	for (const child of children) child.kill("SIGKILL");
});
async function waitFor(
	condition: () => boolean,
	timeoutMs: number,
	what: string,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) {
			const dump = join(
				process.env.BENCH_OUT_DIR ?? tmpdir(),
				`ownership-handoff-timeout-${deployment}.json`,
			);
			await Bun.write(
				dump,
				JSON.stringify(
					{ workerEvents, ownershipEvents, outcomes, rawHttp },
					null,
					1,
				),
			);
			console.error(`timeout diagnostics: ${dump}`);
			throw new Error(`Timed out waiting for ${what}`);
		}
		await Bun.sleep(10);
	}
}
function claimsAfter(t0: number): Map<number, OwnershipEvent> {
	const byPartition = new Map<number, OwnershipEvent>();
	for (const event of ownershipEvents)
		if (
			event.type === "claimed" &&
			event.at >= t0 &&
			!byPartition.has(event.partition)
		)
			byPartition.set(event.partition, event);
	return byPartition;
}

// --- Faults --------------------------------------------------------------------------------------
// leader: each wave moves every partition led by one broker onto the other two, so the old leader stops
// hosting it and a fetch to it answers NOT_LEADER: the response Confluent gives during an election.
// coordinator: each wave moves the __consumer_offsets partitions that coordinate our groups off their
// leader, so the group is unloaded there and loaded on another broker.
// partitions: one wave grows the metering, ownership and command topics.
const SCENARIO = (process.env.CHURN_SCENARIO ?? "leader") as
	| "leader"
	| "coordinator"
	| "partitions";
const WORKERS = Number(process.env.CHURN_WORKERS ?? 4);
const WAVES = Number(process.env.CHURN_WAVES ?? 6);
const WAVE_GAP_MS = Number(process.env.CHURN_WAVE_GAP_MS ?? 6_000);
const BASELINE_MS = Number(process.env.CHURN_BASELINE_MS ?? 10_000);
const SETTLE_MS = Number(process.env.CHURN_SETTLE_MS ?? 30_000);
const GROW_TO = Number(process.env.CHURN_GROW_TO ?? 24);
const SPAWN_AFTER_GROW = process.env.CHURN_SPAWN_AFTER_GROW === "1";
const BROKER_IDS = [1, 2, 3];
const OFFSETS_TOPIC = "__consumer_offsets";
const OFFSETS_TOPIC_PARTITIONS = 50;
const marks: { t: number; label: string; moved?: Record<string, number[]> }[] =
	[];

/** Which of our topics a leader wave moves: CHURN_TOPICS=metering,commands,... narrows it to find what hurts. */
const churnTopics = (process.env.CHURN_TOPICS ?? Object.keys(topics).join(","))
	.split(",")
	.map((name) => topics[name as keyof typeof topics]);
async function moveLeadersOff({ broker }: { broker: number }): Promise<number> {
	const metadata = await admin.fetchTopicMetadata({ topics: churnTopics });
	const reassign: {
		topic: string;
		partitionAssignment: { partition: number; replicas: number[] }[];
	}[] = [];
	let moved = 0;
	for (const topic of metadata.topics) {
		const partitionAssignment = topic.partitions
			.filter((p) => p.leader === broker)
			.map((p) => ({
				partition: p.partitionId,
				replicas: BROKER_IDS.filter((b) => b !== broker).slice(0, REPLICATION),
			}));
		moved += partitionAssignment.length;
		if (partitionAssignment.length)
			reassign.push({ topic: topic.name, partitionAssignment });
	}
	if (reassign.length) await reassignPartitions({ reassign });
	marks.push({
		t: Date.now(),
		label: `moves off ${broker}`,
		moved: Object.fromEntries(
			reassign.map(({ topic, partitionAssignment }) => [
				topic,
				partitionAssignment.map((p) => p.partition),
			]),
		),
	});
	return moved;
}

/** Kafka's own placement of a group on __consumer_offsets: Utils.abs(groupId.hashCode()) % partitions. */
function offsetsPartitionOf({ groupId }: { groupId: string }): number {
	let hash = 0;
	for (let i = 0; i < groupId.length; i++)
		hash = (Math.imul(31, hash) + groupId.charCodeAt(i)) | 0;
	return (hash & 0x7fffffff) % OFFSETS_TOPIC_PARTITIONS;
}

/** Moves each group's coordinator off the broker hosting it now; returns what moved where. */
async function moveCoordinators(): Promise<string> {
	const byPartition = new Map<number, { leader: number; groups: string[] }>();
	for (const [name, groupId] of Object.entries(groupIds)) {
		const reply = await adminRequest(`coord ${groupId}`);
		const leader = Number(reply.split(" ")[1]);
		const partition = offsetsPartitionOf({ groupId });
		const entry = byPartition.get(partition) ?? { leader, groups: [] };
		entry.groups.push(name);
		byPartition.set(partition, entry);
	}
	const partitionAssignment = [...byPartition].map(
		([partition, { leader }]) => ({
			partition,
			replicas: BROKER_IDS.filter((b) => b !== leader),
		}),
	);
	const requestedAt = Date.now();
	await reassignPartitions({
		reassign: [{ topic: OFFSETS_TOPIC, partitionAssignment }],
	});
	// The move is asynchronous: a group has moved once its coordinator lookup names another broker.
	const movedAfterMs = new Map<number, number | null>();
	const deadline = requestedAt + WAVE_GAP_MS - 500;
	for (const [partition, { leader, groups }] of byPartition) {
		const groupId = groupIds[groups[0]];
		movedAfterMs.set(partition, null);
		while (Date.now() < deadline) {
			const now = Number(
				(await adminRequest(`coord ${groupId}`)).split(" ")[1],
			);
			if (now !== leader) {
				movedAfterMs.set(partition, Date.now() - requestedAt);
				break;
			}
			await Bun.sleep(100);
		}
	}
	return [...byPartition]
		.map(
			([partition, { leader, groups }]) =>
				`${groups.join("+")}@${OFFSETS_TOPIC}-${partition} off ${leader} (${movedAfterMs.get(partition) === null ? "not moved yet" : `moved in ${movedAfterMs.get(partition)}ms`})`,
		)
		.join(", ");
}

// A warm JVM admin (ReassignPartitions.java): librdkafka's admin has no reassignment, coordinator or growth.
const reassigner = Bun.spawn(
	[
		"java",
		"-Xmx128m",
		"-cp",
		`${join(kafkaBin, "../libs")}/*`,
		new URL("./ReassignPartitions.java", import.meta.url).pathname,
		brokers.join(","),
	],
	{ stdin: "pipe", stdout: "pipe", stderr: "inherit" },
);
children.push(reassigner);
const reassignerLines = (async function* () {
	let buffered = "";
	for await (const chunk of reassigner.stdout as ReadableStream<Uint8Array>) {
		buffered += new TextDecoder().decode(chunk);
		const lines = buffered.split("\n");
		buffered = lines.pop() ?? "";
		yield* lines.filter((line) => !line.startsWith("SLF4J"));
	}
})();
async function nextReassignerLine(): Promise<string> {
	const { value, done } = await reassignerLines.next();
	if (done) throw new Error("reassigner exited");
	return value;
}
if ((await nextReassignerLine()) !== "ready")
	throw new Error("reassigner failed to start");

let adminQueue: Promise<unknown> = Promise.resolve();
/** One request at a time: the helper answers in order. */
function adminRequest(line: string): Promise<string> {
	const reply = adminQueue.then(async () => {
		reassigner.stdin.write(`${line}\n`);
		reassigner.stdin.flush();
		const answer = await nextReassignerLine();
		if (!answer.startsWith("ok"))
			throw new Error(`admin request failed: ${line.slice(0, 200)}: ${answer}`);
		return answer;
	});
	adminQueue = reply.catch(() => undefined);
	return reply;
}

async function reassignPartitions({
	reassign,
}: {
	reassign: {
		topic: string;
		partitionAssignment: { partition: number; replicas: number[] }[];
	}[];
}): Promise<void> {
	await adminRequest(
		reassign
			.flatMap(({ topic, partitionAssignment }) =>
				partitionAssignment.map(
					({ partition, replicas }) =>
						`${topic}:${partition}:${replicas.join(",")}`,
				),
			)
			.join(" "),
	);
}

const workers: Worker[] = [];
for (let i = 0; i < WORKERS; i++)
	workers.push(await spawnWorker(String.fromCharCode(65 + i)));
await waitFor(
	() => claimsAfter(workers[0].spawnedAt).size === PARTITION_COUNT,
	180_000,
	"every partition claimed",
);
const settleDeadline = Date.now() + 180_000;
for (const partition of customers.keys()) {
	while ((await trackOnce(partition)) !== "200") {
		if (Date.now() > settleDeadline)
			throw new Error(`partition ${partition} never served`);
		await Bun.sleep(250);
	}
}
groupIds.worker = String(
	workerEvents.find((e) => e.event === "worker.starting")?.groupId,
);
// A fault aimed at one worker's partition needs that worker to own it; the dealing is the broker's, so retry.
const faultPartition = Number(process.env.CHURN_FAULT_SPEC?.split(":")[1]);
if (process.env.CHURN_FAULT_WORKER) {
	const owned = workerEvents
		.filter(
			(e) =>
				e.event === "consumer.group_join" &&
				e.worker === process.env.CHURN_FAULT_WORKER,
		)
		.at(-1)?.partitions as number[] | undefined;
	if (!owned?.includes(faultPartition)) {
		console.error(
			`fault worker ${process.env.CHURN_FAULT_WORKER} owns ${JSON.stringify(owned)}, not ${faultPartition}; retry`,
		);
		for (const worker of workers) worker.child.kill("SIGKILL");
		await admin.deleteTopics({ topics: Object.values(topics) });
		for (const customer of [...customers.values(), ...extraCustomers])
			await customer.cleanup();
		process.exit(3);
	}
	marks.push({
		t: Date.now(),
		label: `fault armed: ${process.env.CHURN_FAULT_WORKER} owns ${faultPartition}, spec ${process.env.CHURN_FAULT_SPEC}`,
	});
}
await Bun.sleep(5_000);
// The warm-up's tracks deducted too: kept for the reconciliation, out of the per-phase counts.
const warmupOutcomes = outcomes.splice(0);

// Routing health as a server sees it: every 100 ms, which partitions the ownership consumer can route.
let topicPartitionCount = PARTITION_COUNT;
const ownershipSamples: {
	t: number;
	unowned: number[];
	error?: string;
}[] = [];
let sampling = true;
const sampler = (async () => {
	while (sampling) {
		const t = Date.now();
		try {
			const unowned: number[] = [];
			for (let partition = 0; partition < topicPartitionCount; partition++)
				if (!routing.findOwner({ partition })) unowned.push(partition);
			ownershipSamples.push({ t, unowned });
		} catch (cause) {
			ownershipSamples.push({ t, unowned: [], error: String(cause) });
		}
		await Bun.sleep(100);
	}
})();

console.error(`fleet of ${WORKERS} settled; hammering; scenario ${SCENARIO}`);
startHammer();
await Bun.sleep(BASELINE_MS);
const churnStart = Date.now();
marks.push({ t: churnStart, label: "churn.start" });
const lateWorkers: Worker[] = [];
for (let wave = 0; wave < WAVES; wave++) {
	let label: string;
	if (SCENARIO === "leader") {
		const broker = BROKER_IDS[wave % BROKER_IDS.length];
		const moved = await moveLeadersOff({ broker });
		label = `wave ${wave}: moved ${moved} leaders off broker ${broker}`;
	} else if (SCENARIO === "coordinator") {
		label = `wave ${wave}: moved coordinators ${await moveCoordinators()}`;
	} else {
		if (wave > 0) break;
		await adminRequest(
			`grow ${[topics.metering, topics.ownership, topics.commands].map((t) => `${t}:${GROW_TO}`).join(" ")}`,
		);
		topicPartitionCount = GROW_TO;
		label = `wave ${wave}: grew metering/ownership/commands ${PARTITION_COUNT} -> ${GROW_TO}`;
	}
	marks.push({ t: Date.now(), label });
	console.error(label);
	await Bun.sleep(
		Math.max(0, churnStart + (wave + 1) * WAVE_GAP_MS - Date.now()),
	);
}
if (SCENARIO === "partitions") {
	await Bun.sleep(Math.max(0, churnStart + WAVES * WAVE_GAP_MS - Date.now()));
	if (SPAWN_AFTER_GROW) {
		const late = await spawnWorker("E");
		lateWorkers.push(late);
		marks.push({ t: Date.now(), label: "spawned worker E after growth" });
	}
}
const churnEnd = Date.now();
marks.push({ t: churnEnd, label: "churn.end" });
await Bun.sleep(SETTLE_MS);
hammering = false;
await Bun.sleep(1_500);
const hammerEnd = Date.now();
// Every request still in flight is answered or times out within the client's own budget.
await Bun.sleep(BALANCE_WORKER_REQUEST_TIMEOUT_MS + 1_000);
sampling = false;
await sampler;

function countBy<T>(
	items: T[],
	key: (item: T) => string,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
	return out;
}
const phase = (t: number) =>
	t < churnStart ? "baseline" : t <= churnEnd + 5_000 ? "churn" : "after";
const perSecond: Record<string, Record<string, number>> = {};
for (const o of outcomes) {
	const s = String(Math.floor((o.sentAt - churnStart) / 1000));
	perSecond[s] ??= {};
	perSecond[s][o.outcome] = (perSecond[s][o.outcome] ?? 0) + 1;
}
/** Per partition, the longest stretch between two served (200) requests sent in this window. */
function longestUnservedMs({ from, to }: { from: number; to: number }) {
	const longest: Record<number, number> = {};
	for (const partition of customers.keys()) {
		const served = outcomes
			.filter(
				(o) =>
					o.partition === partition &&
					o.outcome === "200" &&
					o.sentAt >= from &&
					o.sentAt <= to,
			)
			.map((o) => o.doneAt)
			.sort((a, b) => a - b);
		let gap = 0;
		for (let i = 1; i < served.length; i++)
			gap = Math.max(gap, served[i] - served[i - 1]);
		longest[partition] = served.length ? gap : to - from;
	}
	return longest;
}
const unservedDuringChurn = longestUnservedMs({
	from: churnStart,
	to: churnEnd + 5_000,
});

/**
 * From the fault cleared to the last moment anything was still wrong: a failed request, a routed partition
 * without an owner, or a routing client that could not answer. Null when it was still wrong at the end.
 */
function recoveryOf(): {
	recoveryMs: number | null;
	lastFailureMs: number | null;
	lastUnroutableMs: number | null;
} {
	const failures = outcomes.filter((o) => o.outcome !== "200");
	const lastFailure = Math.max(0, ...failures.map((o) => o.doneAt));
	const badSamples = ownershipSamples.filter(
		(s) => s.error !== undefined || s.unowned.some((p) => p < PARTITION_COUNT),
	);
	const lastUnroutable = Math.max(0, ...badSamples.map((s) => s.t));
	const lastBad = Math.max(lastFailure, lastUnroutable);
	const rel = (t: number) => (t === 0 ? null : t - churnEnd);
	return {
		recoveryMs:
			lastBad >= hammerEnd - 2_000 ? null : Math.max(0, lastBad - churnEnd),
		lastFailureMs: rel(lastFailure),
		lastUnroutableMs: rel(lastUnroutable),
	};
}

// --- Reconciliation: every success once in the log and in Postgres, nothing twice, balances add up ---
type LoggedTrack = {
	partition: number;
	offset: string;
	commandId: string;
	customerId: string;
	status: string;
	balanceDelta: number;
};
async function readMeteringLog(): Promise<{
	records: LoggedTrack[];
	ends: Map<number, bigint>;
	lastRecordNext: Map<number, bigint>;
	unreadable: number;
	otherRecords: Record<string, number>;
}> {
	const offsets = await admin.fetchTopicOffsets(topics.metering);
	const ends = new Map(offsets.map((o) => [o.partition, BigInt(o.high)]));
	const records: LoggedTrack[] = [];
	const unreadable: string[] = [];
	const otherRecords: Record<string, number> = {};
	const lastRecordNext = new Map<number, bigint>();
	const reachedEnd = new Map<number, boolean>(
		[...ends].map(([p, end]) => [p, end === 0n]),
	);
	const readerGroupId = `${deployment}-reconcile-${crypto.randomUUID().slice(0, 8)}`;
	const reader = instrumentConsumer({
		consumer: kafka.consumer({
			groupId: readerGroupId,
			readUncommitted: false,
			allowAutoTopicCreation: false,
			maxWaitTimeInMs: 250,
		}),
		owner: "reconcile",
		groupId: readerGroupId,
	});
	await reader.connect();
	await reader.subscribe({ topics: [topics.metering], fromBeginning: true });
	await reader.run({
		eachBatchAutoResolve: true,
		eachBatch: async ({ batch }) => {
			for (const message of batch.messages) {
				let record: ReturnType<typeof parseTrustedMeteringRecord>;
				try {
					record = parseTrustedMeteringRecord({
						key: message.key,
						value: message.value,
					});
				} catch (cause) {
					// Owner fences share the log with mutations; only a record of neither kind is unreadable.
					const type = (() => {
						try {
							return String(JSON.parse(String(message.value)).type);
						} catch {
							return "unparseable";
						}
					})();
					if (type === "mutation" || type === "unparseable")
						unreadable.push(`${batch.partition}@${message.offset}: ${cause}`);
					else otherRecords[type] = (otherRecords[type] ?? 0) + 1;
					continue;
				}
				const result = record.result as {
					type: string;
					status?: string;
					deltas?: { table: string; balanceDelta: number }[];
				};
				lastRecordNext.set(batch.partition, BigInt(message.offset) + 1n);
				if (result.type !== "track") continue;
				records.push({
					partition: batch.partition,
					offset: message.offset,
					commandId: String(record.id),
					customerId: record.identity.customerId,
					status: String(result.status),
					balanceDelta: (result.deltas ?? [])
						.filter((d) => d.table === "customerEntitlements")
						.reduce((sum, d) => sum + d.balanceDelta, 0),
				});
			}
		},
	});
	// A transactional log ends in a commit marker no batch carries; the runner reports passing it here.
	reader.on(reader.events.END_BATCH_PROCESS, ({ payload }) => {
		const next = BigInt(payload.lastOffset) + 1n;
		if (next >= (ends.get(payload.partition) ?? 0n))
			reachedEnd.set(payload.partition, true);
	});
	const deadline = Date.now() + 120_000;
	while ([...reachedEnd.values()].some((done) => !done)) {
		if (Date.now() > deadline) {
			console.error(
				`reconcile: log read incomplete ${JSON.stringify([...reachedEnd])}`,
			);
			break;
		}
		await Bun.sleep(200);
	}
	await reader.disconnect();
	if (unreadable.length)
		console.error(
			`reconcile: ${unreadable.length} unreadable records, e.g. ${unreadable.slice(0, 3).join(" | ")}`,
		);
	return {
		records,
		ends,
		lastRecordNext,
		unreadable: unreadable.length,
		otherRecords,
	};
}

async function reconcile() {
	const { records, ends, lastRecordNext, unreadable, otherRecords } =
		await readMeteringLog();
	// Postgres applies the log in offset order behind a bookmark: once it has passed the last record, every
	// record was applied exactly once and the balance must equal the start plus the logged deltas.
	const anyCustomer = [...customers.values()][0];
	const bookmarkLag: Record<number, string> = {};
	const bookmarkDeadline = Date.now() + 90_000;
	for (const [partition, next] of lastRecordNext) {
		for (;;) {
			const bookmark = await anyCustomer.readNextOffset({
				topic: topics.metering,
				partition,
			});
			if (bookmark !== null && bookmark >= next) break;
			if (Date.now() > bookmarkDeadline) {
				bookmarkLag[partition] = `${bookmark} < ${next}`;
				break;
			}
			await Bun.sleep(250);
		}
	}
	const clientOutcomes = [...warmupOutcomes, ...outcomes];
	const outcomeById = new Map(clientOutcomes.map((o) => [o.commandId, o]));
	const loggedById = new Map<string, LoggedTrack[]>();
	for (const record of records) {
		const list = loggedById.get(record.commandId) ?? [];
		list.push(record);
		loggedById.set(record.commandId, list);
	}
	const successes = clientOutcomes.filter((o) => o.outcome === "200");
	const successMissing = successes.filter(
		(o) => !loggedById.get(o.commandId)?.some((r) => r.status === "applied"),
	);
	const loggedTwice = [...loggedById].filter(([, list]) => list.length > 1);
	const appliedAfterFailure = countBy(
		[...loggedById].filter(
			([id, list]) =>
				list.some((r) => r.status === "applied") &&
				outcomeById.get(id)?.outcome !== "200",
		),
		([id]) => outcomeById.get(id)?.outcome ?? "unknown-command",
	);
	const rejected = records.filter((r) => r.status !== "applied").length;
	const balances: Record<
		string,
		{ start: number; logged: number; postgres: number; ok: boolean }
	> = {};
	for (const [partition, customer] of customers) {
		const logged = records
			.filter(
				(r) =>
					r.customerId === customer.identity.customerId &&
					r.status === "applied",
			)
			.reduce((sum, r) => sum + r.balanceDelta, 0);
		const postgres = await customer.readBalance();
		balances[partition] = {
			start: customer.balance,
			logged,
			postgres,
			ok: postgres === customer.balance + logged,
		};
	}
	const balanceMismatches = Object.entries(balances).filter(([, b]) => !b.ok);
	return {
		ok:
			successMissing.length === 0 &&
			loggedTwice.length === 0 &&
			balanceMismatches.length === 0 &&
			Object.keys(bookmarkLag).length === 0 &&
			unreadable === 0 &&
			records.length > 0,
		clientSuccesses: successes.length,
		unreadableRecords: unreadable,
		otherRecords,
		loggedTracks: records.length,
		loggedApplied: records.length - rejected,
		loggedRejected: rejected,
		successMissingFromLog: successMissing.length,
		successMissingSample: successMissing.slice(0, 5).map((o) => o.commandId),
		commandIdsLoggedTwice: loggedTwice.length,
		loggedTwiceSample: loggedTwice.slice(0, 5),
		appliedButClientFailed: appliedAfterFailure,
		postgresBookmarkLag: bookmarkLag,
		balanceMismatches: Object.fromEntries(balanceMismatches),
		totalDeducted: -Object.values(balances).reduce((s, b) => s + b.logged, 0),
		logEnds: Object.fromEntries([...ends].map(([p, e]) => [p, String(e)])),
		heraldCoverage: Object.fromEntries(
			[...ends.keys()].map((p) => [
				p,
				`${heraldSeen.get(p)?.size ?? 0}/${records.filter((r) => r.partition === p).length}`,
			]),
		),
	};
}
const reconciliation = await reconcile();
console.error(`reconciliation: ${JSON.stringify(reconciliation)}`);

const joins = workerEvents.filter((e) => e.event === "consumer.group_join");
const joinRounds = [...new Set(joins.map((e) => Math.floor(e.t / 250)))].length;
const fleetJoins = joins.filter((e) => /^[A-Z]$/.test(e.worker));
const latestAssignmentOf = (owner: string) =>
	joins.filter((e) => e.worker === owner).at(-1)?.assignment;
const newPartitionOwners: Record<number, string | null> = {};
for (
	let partition = PARTITION_COUNT;
	partition < topicPartitionCount;
	partition++
)
	newPartitionOwners[partition] =
		ownershipSamples.at(-1)?.unowned.includes(partition) === false
			? (routing.findOwner({ partition })?.endpoint ?? null)
			: null;
const summary = {
	config: {
		SCENARIO,
		WORKERS,
		PARTITION_COUNT,
		REPLICATION,
		WAVES,
		WAVE_GAP_MS,
		CHURN_TOPICS: process.env.CHURN_TOPICS ?? "all",
		...(SCENARIO === "partitions" && { GROW_TO, SPAWN_AFTER_GROW }),
	},
	groupIds,
	marks: marks.map((m) => ({ ...m, rel: m.t - churnStart })),
	outcomesByPhase: Object.fromEntries(
		["baseline", "churn", "after"].map((p) => [
			p,
			countBy(
				outcomes.filter((o) => phase(o.sentAt) === p),
				(o) => o.outcome,
			),
		]),
	),
	totals: {
		requests: outcomes.length,
		failed: outcomes.filter((o) => o.outcome !== "200").length,
		failedByOutcome: countBy(
			outcomes.filter((o) => o.outcome !== "200"),
			(o) => o.outcome,
		),
	},
	recovery: recoveryOf(),
	groupJoins: countBy(fleetJoins, (e) => phase(e.t)),
	groupJoinsByOwner: countBy(joins, (e) => `${e.worker}:${phase(e.t)}`),
	joinRoundsDuringChurn: [
		...new Set(
			fleetJoins
				.filter((e) => phase(e.t) === "churn")
				.map((e) => Math.floor(e.t / 250)),
		),
	].length,
	joinRoundsTotal: joinRounds,
	rebalancing: countBy(
		workerEvents.filter((e) => e.event === "consumer.rebalancing"),
		(e) => `${e.worker}:${phase(e.t)}`,
	),
	prepares: countBy(
		workerEvents.filter((e) => e.event === "runtime.prepare"),
		(e) => phase(e.t),
	),
	crashes: workerEvents.filter((e) => e.event === "consumer.crash").length,
	crashesByOwner: countBy(
		workerEvents.filter((e) => e.event === "consumer.crash"),
		(e) => `${e.worker}:restart=${e.restart}`,
	),
	routingFailures: workerEvents.filter((e) => e.event === "routing.failed")
		.length,
	routing: {
		samples: ownershipSamples.length,
		samplesWithError: ownershipSamples.filter((s) => s.error).length,
		samplesWithUnownedRoutedPartition: ownershipSamples.filter((s) =>
			s.unowned.some((p) => p < PARTITION_COUNT),
		).length,
		finalUnowned: ownershipSamples.at(-1)?.unowned ?? null,
		newPartitionOwners,
	},
	finalAssignments: Object.fromEntries(
		[...workers, ...lateWorkers, { name: "routing" }, { name: "herald" }].map(
			(w) => [w.name, latestAssignmentOf(w.name) ?? null],
		),
	),
	workerExitsDuringRun: workerEvents
		.filter((e) => e.event === "worker.exited" && e.duringRun)
		.map((e) => `${e.worker}:${e.exitCode}`),
	maxUnservedMsDuringChurn: Math.max(...Object.values(unservedDuringChurn)),
	unservedMsDuringChurn: unservedDuringChurn,
	leaderFetchErrors: countBy(
		workerEvents.filter((e) => e.event === "kafka.fetch_leader_error"),
		(e) => `${phase(e.t)}:${e.code}`,
	),
	leaderMigrations: countBy(
		workerEvents.filter((e) => e.event === "kafka.leader_migration"),
		(e) => phase(e.t),
	),
	kafkaWarnings: countBy(
		workerEvents.filter((e) => /^kafka\.(warn|error)$/.test(e.event)),
		(e) => `${phase(e.t)}:${String(e.message).slice(0, 80)}`,
	),
	workerErrors: countBy(
		workerEvents.filter((e) =>
			/^(log\.error|error|unhealthy|service\.stopped)$/.test(e.event),
		),
		(e) => `${phase(e.t)}:${e.event}`,
	),
	workerErrorSamples: [
		...new Set(
			workerEvents
				.filter((e) => /^(log\.error|error|unhealthy)$/.test(e.event))
				.map(
					(e) =>
						`${e.worker} ${e.event} ${JSON.stringify(e.args ?? e.cause).slice(0, 300)}`,
				),
		),
	].slice(0, 15),
	ownershipRecords: countBy(
		ownershipEvents.filter((e) => e.seenAt >= churnStart),
		(e) => `${phase(e.seenAt)}:${e.type}`,
	),
	reconciliation,
	perSecond,
};
// Out before teardown, so a teardown that hangs still leaves the run's report.
console.log(JSON.stringify(summary, null, 1));
const out = join(
	process.env.BENCH_OUT_DIR ?? tmpdir(),
	`leader-churn-${deployment}.json`,
);
await Bun.write(
	out,
	JSON.stringify(
		{ summary, outcomes, workerEvents, ownershipEvents, ownershipSamples },
		null,
		1,
	),
);
console.error(`raw data: ${out}`);
for (const worker of [...workers, ...lateWorkers]) {
	worker.child.kill("SIGTERM");
	await worker.child.exited;
	rmSync(worker.dir, { recursive: true, force: true });
}
await routing.stop();
await herald.disconnect();
await watcher.disconnect();
await admin.deleteTopics({ topics: Object.values(topics) });
await admin.disconnect();
for (const customer of [...customers.values(), ...extraCustomers])
	await customer.cleanup();
await postgres.close();
process.exit(0);
