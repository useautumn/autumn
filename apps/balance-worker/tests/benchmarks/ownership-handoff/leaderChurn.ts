/**
 * Replays a Confluent leader election against real balance workers: every few seconds every
 * partition led by one broker moves onto the other two, so a fetch to the old leader answers
 * NOT_LEADER. Workers run as subprocesses of benchWorker.ts; this process hammers the routing
 * client at 20 req/s per partition and reports outcomes, group joins and re-prepares per phase.
 *
 *   cd apps/balance-worker
 *   KAFKA_BROKERS=<3 brokers> DATABASE_URL=... NODE_ENV=test bun tests/benchmarks/ownership-handoff/leaderChurn.ts
 *
 * BENCH_FETCH_REJOIN=1 restores unpatched kafkajs (rejoin on a stale-leadership fetch) for an A/B.
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
	createOwnershipConsumer,
	meteringIdentityToPartition,
	ownershipTopic,
} from "@autumn/kafka";
import { Kafka, logLevel } from "kafkajs";
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
const kafka = new Kafka({
	clientId: deployment,
	brokers,
	logLevel: logLevel.NOTHING,
});
const admin = kafka.admin();
await admin.connect();
await admin.createTopics({
	waitForLeaders: false,
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
const watcher = kafka.consumer({
	groupId: `${deployment}-watch`,
	sessionTimeout: 60_000,
});
await watcher.connect();
await watcher.subscribe({ topic: topics.ownership, fromBeginning: true });
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

// The same client a server uses, with production budgets, plus a tap on the raw HTTP layer.
const routing = createOwnershipConsumer({
	ctx: { kafka },
	config: { topic: topics.ownership },
});
await routing.start();
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
			BALANCE_WORKER_HOST: "127.0.0.1",
			BALANCE_WORKER_PORT: String(port),
			BALANCE_WORKER_SQLITE_PATH: join(dir, "state.sqlite"),
			BALANCE_WORKER_DEPLOYMENT: deployment,
			BALANCE_WORKER_PARTITION_COUNT: String(PARTITION_COUNT),
		}),
		BENCH_NAME: name,
		BENCH_BACKEND: BACKEND,
		BENCH_LOAD_AWARE: process.env.CHURN_LOAD_AWARE ?? "1",
	};
	const { AUTUMN_EDGE_CONFIG_OVERRIDE_B64: _, ...inherited } = process.env;
	const child = Bun.spawn(
		["bun", new URL("./benchWorker.ts", import.meta.url).pathname],
		{
			env: {
				...inherited,
				NODE_ENV: "test",
				AUTUMN_EDGE_CONFIG_OVERRIDE_B64: edgeConfigOverride,
				BENCH_WORKER_ENV: JSON.stringify(env),
			},
			stdout: "pipe",
			stderr: "inherit",
		},
	);
	const spawnedAt = Date.now();
	children.push(child);
	workersByEndpoint.set(env.BALANCE_WORKER_ENDPOINT, name);
	void (async () => {
		let buffered = "";
		for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
			buffered += new TextDecoder().decode(chunk);
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) {
				if (!line) continue;
				const parsed = JSON.parse(line);
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

// --- Leader churn: what a Confluent leadership election does to the fleet ---------------------------
// Each wave moves every partition led by one broker onto the other two, so the old leader stops
// hosting it and a fetch to it answers NOT_LEADER: the response Confluent gives during an election.
const WORKERS = Number(process.env.CHURN_WORKERS ?? 4);
const WAVES = Number(process.env.CHURN_WAVES ?? 6);
const WAVE_GAP_MS = Number(process.env.CHURN_WAVE_GAP_MS ?? 6_000);
const BASELINE_MS = Number(process.env.CHURN_BASELINE_MS ?? 10_000);
const SETTLE_MS = Number(process.env.CHURN_SETTLE_MS ?? 30_000);
const BROKER_IDS = [1, 2, 3];
const marks: { t: number; label: string }[] = [];

async function moveLeadersOff({ broker }: { broker: number }): Promise<number> {
	const metadata = await admin.fetchTopicMetadata({
		topics: Object.values(topics),
	});
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
	if (reassign.length)
		await admin.alterPartitionReassignments({ topics: reassign });
	return moved;
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
await Bun.sleep(5_000);
outcomes.length = 0;
console.error(`fleet of ${WORKERS} settled; hammering`);
startHammer();
await Bun.sleep(BASELINE_MS);
const churnStart = Date.now();
marks.push({ t: churnStart, label: "churn.start" });
for (let wave = 0; wave < WAVES; wave++) {
	const broker = BROKER_IDS[wave % BROKER_IDS.length];
	const moved = await moveLeadersOff({ broker });
	marks.push({
		t: Date.now(),
		label: `wave ${wave}: moved ${moved} leaders off broker ${broker}`,
	});
	console.error(`wave ${wave}: moved ${moved} leaders off broker ${broker}`);
	await Bun.sleep(WAVE_GAP_MS);
}
const churnEnd = Date.now();
marks.push({ t: churnEnd, label: "churn.end" });
await Bun.sleep(SETTLE_MS);
hammering = false;
await Bun.sleep(1_500);

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
const joins = workerEvents.filter((e) => e.event === "consumer.group_join");
const joinRounds = [...new Set(joins.map((e) => Math.floor(e.t / 250)))].length;
const summary = {
	config: {
		WORKERS,
		PARTITION_COUNT,
		REPLICATION,
		WAVES,
		WAVE_GAP_MS,
		loadAware: process.env.CHURN_LOAD_AWARE ?? "1",
	},
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
	groupJoins: countBy(joins, (e) => phase(e.t)),
	joinRoundsDuringChurn: [
		...new Set(
			joins
				.filter((e) => phase(e.t) === "churn")
				.map((e) => Math.floor(e.t / 250)),
		),
	].length,
	joinRoundsTotal: joinRounds,
	rebalancing: countBy(
		workerEvents.filter((e) => e.event === "consumer.rebalancing"),
		(e) => phase(e.t),
	),
	prepares: countBy(
		workerEvents.filter((e) => e.event === "runtime.prepare"),
		(e) => phase(e.t),
	),
	crashes: workerEvents.filter((e) => e.event === "consumer.crash").length,
	ownershipRecords: countBy(
		ownershipEvents.filter((e) => e.seenAt >= churnStart),
		(e) => `${phase(e.seenAt)}:${e.type}`,
	),
	perSecond,
};
for (const worker of workers) {
	worker.child.kill("SIGTERM");
	await worker.child.exited;
	rmSync(worker.dir, { recursive: true, force: true });
}
await routing.stop();
await watcher.disconnect();
await admin.deleteTopics({ topics: Object.values(topics) });
await admin.disconnect();
for (const customer of [...customers.values(), ...extraCustomers])
	await customer.cleanup();
await postgres.close();
const out = join(
	process.env.BENCH_OUT_DIR ?? tmpdir(),
	`leader-churn-${deployment}.json`,
);
await Bun.write(
	out,
	JSON.stringify({ summary, outcomes, workerEvents, ownershipEvents }, null, 1),
);
console.error(`raw data: ${out}`);
console.log(JSON.stringify(summary, null, 1));
process.exit(0);
