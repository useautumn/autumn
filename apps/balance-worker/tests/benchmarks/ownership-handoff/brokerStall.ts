/**
 * Replays a Confluent broker stall against real balance workers: every request on every open
 * connection to one broker hangs for STALL_MS, then lands at once, a few times a minute. Workers
 * run as createBalanceWorker subprocesses (stallWorker.ts, the prod wiring) and reach the brokers
 * through stallProxy.ts; this process hammers the routing client with deducting tracks and plain
 * checks at production budgets and reports outcomes per phase and per stall as JSON.
 *
 *   tests/benchmarks/ownership-handoff/stallCluster.sh start
 *   cd apps/balance-worker
 *   DATABASE_URL=... NODE_ENV=test bun tests/benchmarks/ownership-handoff/brokerStall.ts
 *
 * STALL_MS=0 keeps the proxies but never stalls (the control); STALL_MODE=delay adds STALL_MS to
 * every chunk for STALL_FOR_MS instead of holding.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCheckCommand, parseTrackCommand } from "@autumn/balance-engine";
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
	BALANCE_WORKER_TRACK_REQUEST_TIMEOUT_MS,
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

const PARTITION_COUNT = Number(process.env.STALL_PARTITIONS ?? 16);
const REPLICATION = Number(process.env.STALL_RF ?? 3);
const WORKERS = Number(process.env.STALL_WORKERS ?? 3);
const TRACK_INTERVAL_MS = Number(process.env.STALL_TRACK_INTERVAL_MS ?? 100);
const CHECK_INTERVAL_MS = Number(process.env.STALL_CHECK_INTERVAL_MS ?? 500);
/** Broker n is reached on proxy port 29n92 and listens itself on 39n92 (stallCluster.sh). */
const BROKER_IDS = [1, 2, 3];
const proxyPortOf = (broker: number) => 29_092 + broker * 100;
const STALL_BROKERS = (process.env.STALL_BROKERS ?? "1").split(",").map(Number);
const STALL_MS = Number(process.env.STALL_MS ?? 2_100);
const STALL_MODE = process.env.STALL_MODE ?? "hold";
const STALL_COUNT = Number(process.env.STALL_COUNT ?? 6);
const STALL_GAP_MS = Number(process.env.STALL_GAP_MS ?? 10_000);
const STALL_FOR_MS = Number(process.env.STALL_FOR_MS ?? 60_000);
const BASELINE_MS = Number(process.env.STALL_BASELINE_MS ?? 15_000);
const SETTLE_MS = Number(process.env.STALL_SETTLE_MS ?? 15_000);
const CLIENT_TIMEOUT_MS = Number(
	process.env.STALL_CLIENT_TIMEOUT_MS ?? BALANCE_WORKER_REQUEST_TIMEOUT_MS,
);
/** STALL_TRACK_TIMEOUT_MS=1000 is the client before tracks had their own budget. */
const TRACK_TIMEOUT_MS = Number(
	process.env.STALL_TRACK_TIMEOUT_MS ?? BALANCE_WORKER_TRACK_REQUEST_TIMEOUT_MS,
);
const CONTROL_PORT = 29_999;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
	throw new Error("DATABASE_URL is required (a migrated Postgres)");

type WorkerEvent = { t: number; worker: string; event: string } & Record<
	string,
	unknown
>;
type Lane = "track" | "check";
type ClientOutcome = {
	lane: Lane;
	partition: number;
	sentAt: number;
	doneAt: number;
	outcome: string;
};

const workerEvents: WorkerEvent[] = [];
const outcomes: ClientOutcome[] = [];
const children: Bun.Subprocess[] = [];
process.on("exit", () => {
	for (const child of children) child.kill("SIGKILL");
});

/** Prints the child's JSON lines into `sink` and its errors to stderr. */
function collectLines({
	child,
	sink,
}: {
	child: Bun.Subprocess;
	sink: (parsed: Record<string, unknown>) => void;
}): void {
	void (async () => {
		let buffered = "";
		for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
			buffered += new TextDecoder().decode(chunk);
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.startsWith("{")) continue;
				// A line that does not parse must not stop the reader: an unread pipe blocks the child.
				try {
					sink(JSON.parse(line));
				} catch {
					console.error(`unparsed child line: ${line.slice(0, 300)}`);
				}
			}
		}
	})();
}

const proxy = Bun.spawn(
	["bun", new URL("./stallProxy.ts", import.meta.url).pathname],
	{
		env: {
			...process.env,
			STALL_PROXY_MAP: BROKER_IDS.map(
				(b) => `${proxyPortOf(b)}=${proxyPortOf(b) + 10_000}`,
			).join(","),
			STALL_PROXY_CONTROL_PORT: String(CONTROL_PORT),
		},
		stdout: "pipe",
		stderr: "inherit",
	},
);
children.push(proxy);
const proxyReady = Promise.withResolvers<void>();
collectLines({ child: proxy, sink: () => proxyReady.resolve() });
await proxyReady.promise;
const brokers = BROKER_IDS.map((b) => `127.0.0.1:${proxyPortOf(b)}`);

const deployment = `stall-${crypto.randomUUID().slice(0, 8)}`;
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

const claimed = new Set<number>();
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
		if (record.type === "claimed") claimed.add(partition);
	},
});

// The same client a server uses, with production budgets.
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
				const response = await fetch(url, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
					signal,
				});
				return { status: response.status, body: await response.json() };
			},
		},
	},
	config: {
		partitionCount: PARTITION_COUNT,
		timeoutMs: CLIENT_TIMEOUT_MS,
		trackTimeoutMs: TRACK_TIMEOUT_MS,
		routeRefreshTimeoutMs: BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
	},
});

const ORG = {
	config: {
		reverse_deduction_order: false,
		block_overdue_entitlements: false,
		include_past_due: true,
	},
};

/** The fail-open line's fields: client code, worker code, outcome and sends. */
function outcomeOf({ cause }: { cause: unknown }): string {
	if (!(cause instanceof BalanceWorkerClientError))
		return `THROW:${(cause as Error).name}`;
	return [
		cause.code,
		cause.workerCode ?? "-",
		cause.outcome,
		`sends=${cause.routing?.sends ?? "?"}`,
	].join(":");
}

async function requestOnce({
	partition,
	lane,
}: {
	partition: number;
	lane: Lane;
}): Promise<string> {
	const customer = customers.get(partition);
	if (!customer) throw new Error(`No customer for partition ${partition}`);
	const id = `${lane}-${crypto.randomUUID()}`;
	const base = {
		schemaVersion: 1,
		org: ORG,
		commandId: id,
		requestId: id,
		identity: customer.identity,
		featureId: customer.featureId,
		internalFeatureId: customer.internalFeatureId,
		properties: null,
		occurredAt: Date.now(),
	};
	const sentAt = Date.now();
	let outcome = "200";
	try {
		if (lane === "track")
			await client.track({
				command: parseTrackCommand({
					input: {
						...base,
						type: "track",
						value: 1,
						overageBehavior: "reject",
						usageEvent: {
							name: customer.featureId,
							idempotencyKey: null,
							id: null,
						},
					},
				}),
			});
		else
			await client.check({
				command: parseCheckCommand({
					input: { ...base, type: "check", requiredBalance: 1 },
				}),
			});
	} catch (cause) {
		outcome = outcomeOf({ cause });
		if (process.env.BENCH_DEBUG)
			console.error(`${lane} ${outcome} on partition ${partition}`);
	}
	outcomes.push({ lane, partition, sentAt, doneAt: Date.now(), outcome });
	return outcome;
}

let hammering = false;
function startLane({ lane, intervalMs }: { lane: Lane; intervalMs: number }) {
	for (const partition of customers.keys()) {
		void (async () => {
			let next = Date.now();
			while (hammering) {
				void requestOnce({ partition, lane });
				next += intervalMs;
				await Bun.sleep(Math.max(0, next - Date.now()));
			}
		})();
	}
}

type Worker = { child: Bun.Subprocess; dir: string };
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
	const dir = mkdtempSync(join(tmpdir(), `stall-${name}-`));
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
	};
	// Nothing the worker reads may point it at a deployed system: no secrets manager, no log shipping.
	const {
		AUTUMN_EDGE_CONFIG_OVERRIDE_B64: _,
		INFISICAL_CLIENT_ID: _id,
		INFISICAL_CLIENT_SECRET: _secret,
		AXIOM_TOKEN: _axiom,
		...inherited
	} = process.env;
	const child = Bun.spawn(
		["bun", new URL("./stallWorker.ts", import.meta.url).pathname],
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
	children.push(child);
	collectLines({
		child,
		sink: (parsed) => {
			if (!("event" in parsed)) return;
			const event = parsed as WorkerEvent;
			workerEvents.push(event);
			if (/^(log\.error|error|service\.stopped)/.test(event.event))
				console.error(
					`[${event.worker}] ${JSON.stringify(event).slice(0, 1500)}`,
				);
		},
	});
	return { child, dir };
}

async function waitFor({
	condition,
	timeoutMs,
	what,
}: {
	condition: () => boolean;
	timeoutMs: number;
	what: string;
}): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
		await Bun.sleep(50);
	}
}

async function leadersOf({
	brokerIds,
}: {
	brokerIds: number[];
}): Promise<number[]> {
	const metadata = await admin.fetchTopicMetadata({
		topics: [topics.metering],
	});
	return metadata.topics[0].partitions
		.filter((p) => brokerIds.includes(p.leader))
		.map((p) => p.partitionId);
}

async function stallBrokers(): Promise<void> {
	await Promise.all(
		STALL_BROKERS.map((broker) =>
			fetch(`http://127.0.0.1:${CONTROL_PORT}`, {
				method: "POST",
				body: JSON.stringify(
					STALL_MODE === "delay"
						? {
								listen: proxyPortOf(broker),
								delayMs: STALL_MS,
								forMs: STALL_FOR_MS,
							}
						: { listen: proxyPortOf(broker), holdMs: STALL_MS },
				),
			}),
		),
	);
}

const workers: Worker[] = [];
for (let i = 0; i < WORKERS; i++)
	workers.push(await spawnWorker(String.fromCharCode(65 + i)));
await waitFor({
	condition: () => claimed.size === PARTITION_COUNT,
	timeoutMs: 180_000,
	what: "every partition claimed",
});
const settleDeadline = Date.now() + 180_000;
for (const partition of customers.keys()) {
	while ((await requestOnce({ partition, lane: "track" })) !== "200") {
		if (Date.now() > settleDeadline)
			throw new Error(`partition ${partition} never served`);
		await Bun.sleep(250);
	}
	await requestOnce({ partition, lane: "check" });
}
await Bun.sleep(3_000);
outcomes.length = 0;
console.error(`fleet of ${WORKERS} settled; hammering`);
hammering = true;
const hammerStart = Date.now();
startLane({ lane: "track", intervalMs: TRACK_INTERVAL_MS });
startLane({ lane: "check", intervalMs: CHECK_INTERVAL_MS });
await Bun.sleep(BASELINE_MS);

const stalledPartitions = new Set(
	await leadersOf({ brokerIds: STALL_BROKERS }),
);
const stalls: number[] = [];
const stallStart = Date.now();
const stallRounds = STALL_MODE === "delay" ? 1 : STALL_COUNT;
for (let i = 0; i < stallRounds; i++) {
	stalls.push(Date.now());
	if (STALL_MS > 0) await stallBrokers();
	console.error(
		`stall ${i}: ${STALL_MODE} ${STALL_MS}ms on broker ${STALL_BROKERS}`,
	);
	await Bun.sleep(STALL_MODE === "delay" ? STALL_FOR_MS : STALL_GAP_MS);
}
const stallEnd = Date.now();
await Bun.sleep(SETTLE_MS);
const hammerEnd = Date.now();
hammering = false;
await Bun.sleep(TRACK_TIMEOUT_MS + 1_000);

function countBy<T>(
	items: T[],
	key: (item: T) => string,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
	return out;
}
function percentile(values: number[], fraction: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ??
		0
	);
}
// A request sent within one budget of the first stall can still be caught by it.
const phaseOf = (t: number) =>
	t < stallStart - TRACK_TIMEOUT_MS
		? "baseline"
		: t <= stallEnd
			? "stall"
			: "after";
const groupOf = (o: ClientOutcome) =>
	`${o.lane}:${stalledPartitions.has(o.partition) ? "stalled" : "other"}`;
const isFailOpen = (o: ClientOutcome) => o.outcome !== "200";

const baselineTracks = outcomes.filter(
	(o) =>
		o.lane === "track" &&
		stalledPartitions.has(o.partition) &&
		phaseOf(o.sentAt) === "baseline",
);
const stalledTrackRatePerMs =
	baselineTracks.length /
	Math.max(1, stallStart - TRACK_TIMEOUT_MS - (baselineTracks[0]?.sentAt ?? 0));

/** Requests to stalled partitions sent while the stall held, and what became of them. */
const perStall = stalls.map((at, index) => {
	const holdEnd = at + (STALL_MODE === "delay" ? STALL_FOR_MS : STALL_MS);
	const sent = outcomes.filter(
		(o) =>
			o.lane === "track" &&
			stalledPartitions.has(o.partition) &&
			o.sentAt >= at - TRACK_TIMEOUT_MS &&
			o.sentAt <= holdEnd,
	);
	const failed = sent.filter(isFailOpen);
	const holdMs = holdEnd - at;
	return {
		stall: index,
		tracksSent: sent.length,
		failOpens: failed.length,
		// A request fails when it would wait out more than the budget: those sent in the stall's first holdMs - budget.
		failOpensIfEveryLateRequestFails: Math.round(
			Math.max(0, holdMs - TRACK_TIMEOUT_MS) * stalledTrackRatePerMs,
		),
		outcomes: countBy(failed, (o) => o.outcome),
		failSentFromMs: failed.length
			? Math.min(...failed.map((o) => o.sentAt - at))
			: null,
		failSentToMs: failed.length
			? Math.max(...failed.map((o) => o.sentAt - at))
			: null,
		// Prod logs a fail-open when it fails, so this span is the one to read against Axiom's.
		failSpanMs: failed.length
			? Math.max(...failed.map((o) => o.doneAt)) -
				Math.min(...failed.map((o) => o.doneAt))
			: null,
		maxLatencyMs: Math.max(0, ...sent.map((o) => o.doneAt - o.sentAt)),
	};
});
const windows = workerEvents.filter((e) => e.event === "window");
const slowRequests = workerEvents.filter(
	(e) => e.event === "kafka.slow_request",
);
const summary = {
	config: {
		WORKERS,
		PARTITION_COUNT,
		REPLICATION,
		STALL_BROKERS,
		STALL_MS,
		STALL_MODE,
		STALL_COUNT: stallRounds,
		CLIENT_TIMEOUT_MS,
		TRACK_TIMEOUT_MS,
		stalledPartitions: [...stalledPartitions].sort((a, b) => a - b),
	},
	outcomesByPhase: Object.fromEntries(
		["baseline", "stall", "after"].map((phase) => [
			phase,
			Object.fromEntries(
				["track:stalled", "track:other", "check:stalled", "check:other"].map(
					(group) => [
						group,
						countBy(
							outcomes.filter(
								(o) => phaseOf(o.sentAt) === phase && groupOf(o) === group,
							),
							(o) => o.outcome,
						),
					],
				),
			),
		]),
	),
	latencyMs: Object.fromEntries(
		["baseline", "stall"].flatMap((phase) =>
			["track:stalled", "track:other", "check:stalled", "check:other"].map(
				(group) => {
					const ms = outcomes
						.filter(
							(o) =>
								phaseOf(o.sentAt) === phase &&
								groupOf(o) === group &&
								o.outcome === "200",
						)
						.map((o) => o.doneAt - o.sentAt);
					return [
						`${phase}:${group}`,
						{
							p50: percentile(ms, 0.5),
							p99: percentile(ms, 0.99),
							max: Math.max(0, ...ms),
						},
					];
				},
			),
		),
	),
	perStall,
	workerProduceMaxMs: Object.fromEntries(
		["baseline", "stall", "after"].map((phase) => [
			phase,
			Object.fromEntries(
				workers.map((_, i) => {
					const worker = String.fromCharCode(65 + i);
					const mine = windows.filter(
						(w) => w.worker === worker && phaseOf(w.t) === phase,
					);
					return [
						worker,
						Math.max(0, ...mine.map((w) => Number(w.produceMaxMs))),
					];
				}),
			),
		]),
	),
	workersWithProduceOver800ms: [
		...new Set(
			windows.filter((w) => Number(w.produceMaxMs) >= 800).map((w) => w.worker),
		),
	].length,
	slowRequestsByApi: countBy(
		slowRequests.filter((e) => Number(e.durationMs) >= 800),
		(e) => `${e.api}@${e.broker}`,
	),
	// A worker that went quiet stopped serving for unrelated reasons; its run is not evidence either way.
	workerSilenceMaxMs: Object.fromEntries(
		workers.map((_, i) => {
			const worker = String.fromCharCode(65 + i);
			const times = [
				hammerStart,
				...windows.filter((w) => w.worker === worker).map((w) => w.t),
				hammerEnd,
			].filter((t) => t >= hammerStart && t <= hammerEnd);
			let gap = 0;
			for (let k = 1; k < times.length; k++)
				gap = Math.max(gap, times[k] - times[k - 1]);
			return [worker, gap];
		}),
	),
	commitsNotLanded: windows.reduce((sum, w) => sum + Number(w.unknown), 0),
	workerErrors: countBy(
		workerEvents.filter((e) =>
			/^(log\.error|error|service\.stopped)/.test(e.event),
		),
		(e) => e.event,
	),
};

for (const worker of workers) {
	worker.child.kill("SIGTERM");
	await Promise.race([worker.child.exited, Bun.sleep(20_000)]);
	worker.child.kill("SIGKILL");
	rmSync(worker.dir, { recursive: true, force: true });
}
await routing.stop();
await watcher.disconnect();
await admin.deleteTopics({ topics: Object.values(topics) });
await admin.disconnect();
proxy.kill("SIGTERM");
for (const customer of [...customers.values(), ...extraCustomers])
	await customer.cleanup();
await postgres.close();
const out = join(
	process.env.BENCH_OUT_DIR ?? tmpdir(),
	`broker-stall-${deployment}.json`,
);
await Bun.write(
	out,
	JSON.stringify({ summary, stalls, outcomes, workerEvents }, null, 1),
);
console.error(`raw data: ${out}`);
console.log(JSON.stringify(summary, null, 1));
process.exit(0);
