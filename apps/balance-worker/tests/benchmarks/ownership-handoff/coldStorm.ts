/**
 * Replays a top-of-the-hour cold-customer storm against a real balance worker: hundreds of customers no
 * worker has loaded arrive at once while Postgres answers each transaction in ~0.5s instead of
 * milliseconds. Workers run as subprocesses of benchWorker.ts; this process routes checks through the
 * production client and reports outcomes per phase, per attempt and per second, plus the worker's
 * subject-load gate and query timings each second.
 *
 *   cd apps/balance-worker
 *   KAFKA_BROKERS=127.0.0.1:19092 DATABASE_URL=... NODE_ENV=test STORM_RF=1 bun tests/benchmarks/ownership-handoff/coldStorm.ts
 *
 * STORM_PG_DELAY_MS=0 turns the injected latency off; STORM_RATE and STORM_SECONDS shape the burst.
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
} from "@autumn/env/balanceWorkerConstants";
import {
	createOwnershipConsumer,
	meteringIdentityToPartition,
	ownershipTopic,
} from "@autumn/kafka";
import { schemas } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { createTestKafka } from "../../fixtures/testKafka.js";
import {
	openFixturePostgres,
	type SeededCustomer,
	seedCustomer,
} from "../../integration/postgres/postgresCustomerFixture.js";

const PARTITION_COUNT = Number(process.env.STORM_PARTITIONS ?? 16);
const REPLICATION = Number(process.env.STORM_RF ?? 1);
const WORKERS = Number(process.env.STORM_WORKERS ?? 1);
/** Distinct cold customers arriving per second, each new to the worker. */
const RATE = Number(process.env.STORM_RATE ?? 40);
const SECONDS = Number(process.env.STORM_SECONDS ?? 20);
/** Each cold customer calls this many times, this far apart, as a customer's API traffic does. */
const REPEATS = Number(process.env.STORM_REPEATS ?? 3);
const REPEAT_GAP_MS = Number(process.env.STORM_REPEAT_GAP_MS ?? 1_000);
/** Median per-transaction Postgres latency while the storm runs; prod's subject_rows p50 was 513ms. */
const PG_DELAY_MS = Number(process.env.STORM_PG_DELAY_MS ?? 513);
const PG_DELAY_SIGMA = Number(process.env.STORM_PG_DELAY_SIGMA ?? 0.58);
const HOT_INTERVAL_MS = Number(process.env.STORM_HOT_INTERVAL_MS ?? 200);
const BASELINE_MS = Number(process.env.STORM_BASELINE_MS ?? 10_000);
const AFTER_MS = Number(process.env.STORM_AFTER_MS ?? 15_000);
const COLD_COUNT = RATE * SECONDS;
const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
if (brokers.length === 0) throw new Error("KAFKA_BROKERS is required");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
	throw new Error("DATABASE_URL is required (a migrated Postgres)");

type WorkerEvent = { t: number; worker: string; event: string } & Record<
	string,
	unknown
>;
type Outcome = {
	lane: "hot" | "cold";
	attempt: number;
	sentAt: number;
	doneAt: number;
	outcome: string;
};

const workerEvents: WorkerEvent[] = [];
const outcomes: Outcome[] = [];
const claims = new Map<number, number>();

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
await Bun.sleep(2_000);

// Hot customers, one per partition, each its own org as the integration fixture seeds them.
const postgres = openFixturePostgres({ databaseUrl });
const hot = new Map<number, SeededCustomer>();
const extraHot: SeededCustomer[] = [];
while (hot.size < PARTITION_COUNT) {
	const customer = await seedCustomer({ postgres, balance: 1_000_000_000 });
	const partition = meteringIdentityToPartition({
		identity: customer.identity,
		partitionCount: PARTITION_COUNT,
	});
	if (hot.has(partition)) extraHot.push(customer);
	else hot.set(partition, customer);
}

// Cold customers share one large org's catalog, as the storm's two orgs did.
const anchor = await seedCustomer({ postgres, balance: 1_000_000 });
const coldPrefix = `storm_${deployment.slice(6)}`;
const coldIds = Array.from(
	{ length: COLD_COUNT },
	(_, i) => `${coldPrefix}_${i}`,
);
async function seedColdCustomers(): Promise<void> {
	const now = Date.now();
	for (let start = 0; start < coldIds.length; start += 500) {
		const chunk = coldIds.slice(start, start + 500);
		await postgres.db.insert(schemas.customers).values(
			chunk.map((id) => ({
				internal_id: `cus_int_${id}`,
				id,
				org_id: anchor.orgId,
				env: anchor.env,
				created_at: now,
				name: id,
			})),
		);
		await postgres.db.insert(schemas.customerProducts).values(
			chunk.map((id) => ({
				id: `cp_${id}`,
				internal_customer_id: `cus_int_${id}`,
				internal_product_id: anchor.internalProductId,
				product_id: "pro",
				created_at: now,
				starts_at: now,
				status: "active" as const,
				options: [],
				billing_version: "v2" as const,
			})),
		);
		await postgres.db.insert(schemas.customerEntitlements).values(
			chunk.map((id) => ({
				id: `ce_${id}`,
				internal_customer_id: `cus_int_${id}`,
				customer_id: id,
				customer_product_id: `cp_${id}`,
				entitlement_id: anchor.entitlementId,
				internal_feature_id: anchor.internalFeatureId,
				feature_id: anchor.featureId,
				created_at: now,
				balance: 1_000_000,
				adjustment: 0,
				next_reset_at: null,
			})),
		);
	}
}
async function cleanupColdCustomers(): Promise<void> {
	const pattern = `${coldPrefix}_%`;
	await postgres.db.execute(
		sql`DELETE FROM customer_entitlements WHERE id LIKE ${`ce_${pattern}`}`,
	);
	await postgres.db.execute(
		sql`DELETE FROM customer_products WHERE id LIKE ${`cp_${pattern}`}`,
	);
	await postgres.db.execute(
		sql`DELETE FROM customers WHERE org_id = ${anchor.orgId} AND id LIKE ${pattern}`,
	);
}
const seedStart = Date.now();
await seedColdCustomers();
console.error(
	`seeded ${COLD_COUNT} cold customers in ${Date.now() - seedStart}ms`,
);

const watcher = kafka.consumer({ groupId: `${deployment}-watch` });
await watcher.connect();
await watcher.subscribe({ topics: [topics.ownership], fromBeginning: true });
await watcher.run({
	eachMessage: async ({ partition, message }) => {
		const record = ownershipTopic.parse({
			key: message.key,
			value: message.value,
		});
		if (record.type === "claimed" && !claims.has(partition))
			claims.set(partition, Date.now());
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
			async postJson({ url, body, headers, signal }) {
				const response = await fetch(url, {
					method: "POST",
					headers: { ...headers, "content-type": "application/json" },
					body: JSON.stringify(body),
					signal,
				});
				return { status: response.status, body: await response.json() };
			},
		},
	},
	config: {
		partitionCount: PARTITION_COUNT,
		timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
		routeRefreshTimeoutMs: BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
	},
});

const org = {
	config: {
		reverse_deduction_order: false,
		block_overdue_entitlements: false,
		include_past_due: true,
	},
};
function outcomeOf({ cause }: { cause: unknown }): string {
	if (!(cause instanceof BalanceWorkerClientError))
		return `THROW:${(cause as Error).name}`;
	return cause.workerCode ? `${cause.code}:${cause.workerCode}` : cause.code;
}
async function record({
	lane,
	attempt,
	run,
}: {
	lane: Outcome["lane"];
	attempt: number;
	run: () => Promise<unknown>;
}): Promise<string> {
	const sentAt = Date.now();
	let outcome = "200";
	try {
		await run();
	} catch (cause) {
		outcome = outcomeOf({ cause });
	}
	outcomes.push({ lane, attempt, sentAt, doneAt: Date.now(), outcome });
	return outcome;
}
function trackHot({ customer }: { customer: SeededCustomer }) {
	const id = `hot-${crypto.randomUUID()}`;
	const command = parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			org,
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
	return record({
		lane: "hot",
		attempt: 0,
		run: () => client.track({ command }),
	});
}
function checkCold({
	customerId,
	attempt,
}: {
	customerId: string;
	attempt: number;
}) {
	const command = parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org,
			requestId: `cold-${crypto.randomUUID()}`,
			identity: { ...anchor.identity, customerId },
			featureId: anchor.featureId,
			internalFeatureId: anchor.internalFeatureId,
			requiredBalance: 1,
			properties: null,
			occurredAt: Date.now(),
		},
	});
	return record({
		lane: "cold",
		attempt,
		run: () => client.check({ command }),
	});
}

let hammering = false;
function startHotHammer(): void {
	hammering = true;
	for (const customer of hot.values()) {
		void (async () => {
			let next = Date.now();
			while (hammering) {
				void trackHot({ customer });
				next += HOT_INTERVAL_MS;
				await Bun.sleep(Math.max(0, next - Date.now()));
			}
		})();
	}
}

/** RATE new customers a second for SECONDS, each calling REPEATS times REPEAT_GAP_MS apart. */
async function runColdStorm(): Promise<void> {
	const callers: Promise<void>[] = [];
	const startedAt = Date.now();
	for (let i = 0; i < coldIds.length; i++) {
		await Bun.sleep(Math.max(0, startedAt + (i * 1000) / RATE - Date.now()));
		const customerId = coldIds[i];
		callers.push(
			(async () => {
				for (let attempt = 1; attempt <= REPEATS; attempt++) {
					const sentAt = Date.now();
					await checkCold({ customerId, attempt });
					if (attempt < REPEATS)
						await Bun.sleep(Math.max(0, sentAt + REPEAT_GAP_MS - Date.now()));
				}
			})(),
		);
	}
	await Promise.all(callers);
}

type Worker = { name: string; child: Bun.Subprocess; dir: string };
const children: Bun.Subprocess[] = [];
process.on("exit", () => {
	for (const child of children) child.kill("SIGKILL");
});
const edgeConfigOverride = Buffer.from(
	JSON.stringify({
		[BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY]: {
			...defaultSubjectSnapshotsEdgeConfig(),
			mode: "off",
		},
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
		BENCH_BACKEND: "postgres" as const,
		BENCH_LOAD_AWARE: "1",
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
				BENCH_DB_REPORT: "1",
				...(PG_DELAY_MS > 0 && {
					BENCH_PG_DELAY_MS: String(PG_DELAY_MS),
					BENCH_PG_DELAY_SIGMA: String(PG_DELAY_SIGMA),
				}),
			},
			stdout: "pipe",
			stderr: "inherit",
		},
	);
	children.push(child);
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
				if (/^(log\.error|error|unhealthy|consumer\.crash)/.test(parsed.event))
					console.error(`[${parsed.worker}] ${line.slice(0, 1000)}`);
			}
		}
	})();
	return { name, child, dir };
}
function togglePgLatency(): void {
	if (PG_DELAY_MS <= 0) return;
	for (const worker of workers) worker.child.kill("SIGUSR2");
}

const workers: Worker[] = [];
for (let i = 0; i < WORKERS; i++)
	workers.push(await spawnWorker(String.fromCharCode(65 + i)));
const claimDeadline = Date.now() + 180_000;
while (claims.size < PARTITION_COUNT) {
	if (Date.now() > claimDeadline)
		throw new Error("Timed out waiting for every partition claimed");
	await Bun.sleep(50);
}
for (const customer of hot.values()) {
	while ((await trackHot({ customer })) !== "200") {
		if (Date.now() > claimDeadline)
			throw new Error("A hot partition never served");
		await Bun.sleep(250);
	}
}
await Bun.sleep(3_000);
outcomes.length = 0;
console.error(`fleet of ${WORKERS} settled; baseline`);
startHotHammer();
await Bun.sleep(BASELINE_MS);
const stormStart = Date.now();
togglePgLatency();
console.error(
	`storm: ${COLD_COUNT} cold customers at ${RATE}/s, pg delay ${PG_DELAY_MS}ms`,
);
await runColdStorm();
const stormEnd = Date.now();
togglePgLatency();
await Bun.sleep(AFTER_MS);
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
function percentile({
	values,
	fraction,
}: {
	values: number[];
	fraction: number;
}): number {
	const sorted = [...values].sort((a, b) => a - b);
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ??
		0
	);
}
const phase = (t: number) =>
	t < stormStart ? "baseline" : t <= stormEnd ? "storm" : "after";
const cold = outcomes.filter((o) => o.lane === "cold");
const coldNotReady = cold.filter((o) => o.outcome === "WORKER_ERROR:NOT_READY");
const perSecond: Record<string, Record<string, number>> = {};
for (const o of outcomes) {
	const s = String(Math.floor((o.sentAt - stormStart) / 1000));
	perSecond[s] ??= {};
	const key = `${o.lane}:${o.outcome}`;
	perSecond[s][key] = (perSecond[s][key] ?? 0) + 1;
}
type DbWindow = WorkerEvent & {
	subjectLoads: { running: number; queued: number };
	subjectLoadWait: { count: number; p50: number; p99: number; max: number };
	inFlightMax: number;
	queries: Record<string, { count: number; p50: number; p99: number }>;
};
const dbWindows = (
	workerEvents.filter((e) => e.event === "db.window") as DbWindow[]
).filter((e) => e.t >= stormStart - 2_000 && e.t <= stormEnd + AFTER_MS);
const maxOf = (values: number[]) => Math.max(0, ...values);
const summary = {
	config: {
		WORKERS,
		PARTITION_COUNT,
		RATE,
		SECONDS,
		REPEATS,
		REPEAT_GAP_MS,
		PG_DELAY_MS,
		PG_DELAY_SIGMA,
		COLD_COUNT,
		HOT_INTERVAL_MS,
	},
	stormMs: stormEnd - stormStart,
	outcomesByPhase: Object.fromEntries(
		["baseline", "storm", "after"].map((p) => [
			p,
			countBy(
				outcomes.filter((o) => phase(o.sentAt) === p),
				(o) => `${o.lane}:${o.outcome}`,
			),
		]),
	),
	cold: {
		requests: cold.length,
		notReady: coldNotReady.length,
		notReadyPct: Math.round((1000 * coldNotReady.length) / cold.length) / 10,
		byAttempt: countBy(cold, (o) => `${o.attempt}:${o.outcome}`),
		notReadyLatencyMs: {
			p50: percentile({
				values: coldNotReady.map((o) => o.doneAt - o.sentAt),
				fraction: 0.5,
			}),
			p99: percentile({
				values: coldNotReady.map((o) => o.doneAt - o.sentAt),
				fraction: 0.99,
			}),
		},
		okLatencyMs: {
			p50: percentile({
				values: cold
					.filter((o) => o.outcome === "200")
					.map((o) => o.doneAt - o.sentAt),
				fraction: 0.5,
			}),
			p99: percentile({
				values: cold
					.filter((o) => o.outcome === "200")
					.map((o) => o.doneAt - o.sentAt),
				fraction: 0.99,
			}),
		},
	},
	gate: {
		queuedMax: maxOf(dbWindows.map((w) => w.subjectLoads.queued)),
		runningMax: maxOf(dbWindows.map((w) => w.subjectLoads.running)),
		waitP99Max: maxOf(dbWindows.map((w) => w.subjectLoadWait.p99)),
		inFlightMax: maxOf(dbWindows.map((w) => w.inFlightMax)),
		subjectRowsP50Max: maxOf(
			dbWindows.map((w) => w.queries.subject_rows?.p50 ?? 0),
		),
		subjectRowsP99Max: maxOf(
			dbWindows.map((w) => w.queries.subject_rows?.p99 ?? 0),
		),
		subjectRowsCount: dbWindows.reduce(
			(sum, w) => sum + (w.queries.subject_rows?.count ?? 0),
			0,
		),
	},
	gateBySecond: dbWindows.map((w) => ({
		s: Math.floor((w.t - stormStart) / 1000),
		queued: w.subjectLoads.queued,
		running: w.subjectLoads.running,
		waitP99: w.subjectLoadWait.p99,
		loads: w.queries.subject_rows?.count ?? 0,
		rowsP50: w.queries.subject_rows?.p50 ?? 0,
		inFlightMax: w.inFlightMax,
	})),
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
await cleanupColdCustomers();
for (const customer of [anchor, ...hot.values(), ...extraHot])
	await customer.cleanup();
await postgres.close();
const out = join(
	process.env.BENCH_OUT_DIR ?? tmpdir(),
	`cold-storm-${deployment}.json`,
);
await Bun.write(
	out,
	JSON.stringify({ summary, outcomes, workerEvents }, null, 1),
);
console.error(`raw data: ${out}`);
console.log(JSON.stringify(summary, null, 1));
process.exit(0);
