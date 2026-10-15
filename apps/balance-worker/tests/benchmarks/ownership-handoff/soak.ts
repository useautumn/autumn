/**
 * Soak: real balance workers (benchWorker.ts subprocesses) under a steady prod-like track load for
 * hours, sampled every minute for per-process RSS, open fds, threads and JS heap, plus the cluster's
 * consumer-group count. Optional churn: every SOAK_CHURN_INTERVAL_MS one worker gets SIGTERM and a
 * replacement starts, and the client builds a fresh ownership consumer (what every server process
 * and every routing rebuild does) and swaps routing onto it. Ends with a data reconciliation: every
 * request the client saw succeed has exactly one deduction in the metering log, no command is
 * deducted twice, and each customer's Postgres balance equals its seed minus the log's deductions.
 *
 *   cd apps/balance-worker
 *   KAFKA_BROKERS=<3 brokers> KAFKA_BIN=<kafka>/bin DATABASE_URL=... NODE_ENV=test \
 *     SOAK_DURATION_MS=10800000 SOAK_OUT_DIR=~/.capy/work/soak/run1 bun run benchmark:soak
 */
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
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
	type OwnershipConsumer,
	ownershipTopic,
	parseTrustedMeteringRecord,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import { sql } from "drizzle-orm";
import { createStreamConsumer } from "../../../../herald/src/stream/createStreamConsumer.js";
import { createTestKafka } from "../../fixtures/testKafka.js";
import {
	openFixturePostgres,
	type SeededCustomer,
	seedCustomer,
} from "../../integration/postgres/postgresCustomerFixture.js";
import { reconcileSoak } from "./reconcileSoak.js";

const PARTITION_COUNT = Number(process.env.SOAK_PARTITIONS ?? 16);
const REPLICATION = Number(process.env.SOAK_RF ?? 2);
const WORKERS = Number(process.env.SOAK_WORKERS ?? 4);
const RATE_PER_PARTITION = Number(process.env.SOAK_RATE_PER_PARTITION ?? 20);
const DURATION_MS = Number(process.env.SOAK_DURATION_MS ?? 600_000);
const SAMPLE_MS = Number(process.env.SOAK_SAMPLE_MS ?? 60_000);
const GROUP_SAMPLE_MS = Number(process.env.SOAK_GROUP_SAMPLE_MS ?? 600_000);
const CHURN_INTERVAL_MS = Number(process.env.SOAK_CHURN_INTERVAL_MS ?? 0);
/** `main` runs src/main.ts (HTTP worker threads, the producer thread, the real SIGTERM path) instead of benchWorker.ts. */
const WORKER_ENTRY = process.env.SOAK_WORKER_ENTRY ?? "bench";
const HERALD_MEMBERS = Number(process.env.SOAK_HERALD_MEMBERS ?? 2);
const SEED_BALANCE = 1_000_000_000;
const outDir = process.env.SOAK_OUT_DIR ?? join(tmpdir(), "soak");
mkdirSync(outDir, { recursive: true });
const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
if (brokers.length === 0) throw new Error("KAFKA_BROKERS is required");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const kafkaBin = process.env.KAFKA_BIN;
if (!kafkaBin) throw new Error("KAFKA_BIN is required");

const log = (line: string) =>
	console.error(`${new Date().toISOString()} ${line}`);

// --- Event bookkeeping: counters and a small ring, never an unbounded array -----------------------
type Event = { t: number; source: string; event: string } & Record<
	string,
	unknown
>;
const eventCounts: Record<string, number> = {};
const recentEvents: Event[] = [];
const notableEvents: Event[] = [];
const NOTABLE =
	/^(consumer\.crash|log\.error|error|unhealthy|service\.stopped|worker\.exited|client\.|herald\.|churn\.|stop\.)/;
function record(event: Event): void {
	eventCounts[event.event] = (eventCounts[event.event] ?? 0) + 1;
	recentEvents.push(event);
	if (recentEvents.length > 2_000) recentEvents.shift();
	if (NOTABLE.test(event.event) && notableEvents.length < 5_000)
		notableEvents.push(event);
}
const eventTimes = new Map<string, number[]>();
function remember(event: string, t: number): void {
	const times = eventTimes.get(event) ?? [];
	times.push(t);
	eventTimes.set(event, times);
}

// --- Topics, customers, Kafka clients -------------------------------------------------------------
const deployment = `soak-${crypto.randomUUID().slice(0, 8)}`;
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
	const customer = await seedCustomer({ postgres, balance: SEED_BALANCE });
	const partition = meteringIdentityToPartition({
		identity: customer.identity,
		partitionCount: PARTITION_COUNT,
	});
	if (customers.has(partition)) extraCustomers.push(customer);
	else customers.set(partition, customer);
}

// The ownership log as written: who claimed what, when we saw it.
type Claim = { seenAt: number; endpoint?: string; type: string };
const latestByPartition = new Map<number, Claim>();
const claimTimes: number[] = [];
const watcher = kafka.consumer({ groupId: `${deployment}-watch` });
await watcher.connect();
await watcher.subscribe({ topics: [topics.ownership], fromBeginning: true });
await watcher.run({
	eachMessage: async ({ partition, message }) => {
		const parsed = ownershipTopic.parse({
			key: message.key,
			value: message.value,
		});
		const seenAt = Date.now();
		if (
			parsed.type === "claimed" ||
			parsed.type === "unowned" ||
			parsed.type === "released"
		) {
			latestByPartition.set(partition, {
				seenAt,
				endpoint: parsed.endpoint,
				type: parsed.type,
			});
			if (parsed.type === "claimed") claimTimes.push(seenAt);
		}
	},
});
function ownedCount(): number {
	const live = new Set(workers.map((w) => w.endpoint));
	let owned = 0;
	for (const claim of latestByPartition.values())
		if (claim.type === "claimed" && claim.endpoint && live.has(claim.endpoint))
			owned++;
	return owned;
}

// --- Routing: a swappable ownership consumer, the way a server process builds one ------------------
let ownersBuilt = 0;
let ownersFailed = 0;
function buildOwners(): OwnershipConsumer {
	ownersBuilt++;
	const built = createOwnershipConsumer({
		ctx: {
			kafka,
			onFailed: ({ cause }) => {
				ownersFailed++;
				record({
					t: Date.now(),
					source: "client",
					event: "client.ownership_failed",
					cause: String(cause),
				});
			},
		},
		config: { topic: topics.ownership },
	});
	return built;
}
let routing = buildOwners();
await routing.start();
const owners = {
	findOwner: (params: { partition: number }) => routing.findOwner(params),
	refresh: () => routing.refresh(),
};
const client = createBalanceWorkerClient({
	ctx: {
		owners,
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
		timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
		routeRefreshTimeoutMs: BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
	},
});

// --- Herald-style job group: KIP-848 uniform members that commit their places ---------------------
let heraldRecords = 0;
const heraldLogger = {
	debug() {},
	info() {},
	warn: (...args: unknown[]) =>
		record({
			t: Date.now(),
			source: "herald",
			event: "herald.warn",
			args: String(args[1] ?? args[0]),
		}),
	error: (...args: unknown[]) =>
		record({
			t: Date.now(),
			source: "herald",
			event: "herald.error",
			args: String(args[1] ?? args[0]),
		}),
} as unknown as AutumnLogger;
const heralds = Array.from({ length: HERALD_MEMBERS }, () =>
	createStreamConsumer({
		ctx: {
			kafka,
			logger: heraldLogger,
			onCrashed: ({ cause }) =>
				record({
					t: Date.now(),
					source: "herald",
					event: "herald.crashed",
					cause: String(cause),
				}),
		},
		config: { topic: topics.metering, groupIdPrefix: `${deployment}-herald` },
		streamConsumer: {
			name: "soak-job",
			async handle({ records }) {
				heraldRecords += records.length;
			},
		},
	}),
);
for (const herald of heralds) await herald.start();

// --- Load ------------------------------------------------------------------------------------------
const outcomesFile = Bun.file(join(outDir, "outcomes.log")).writer({
	highWaterMark: 1 << 20,
});
const outcomeCounts: Record<string, number> = {};
const perSecond = new Map<number, { total: number; failed: number }>();
let inFlight = 0;
let measuring = false;
async function trackOnce(partition: number): Promise<string> {
	const customer = customers.get(partition);
	if (!customer) throw new Error(`No customer for partition ${partition}`);
	const id = `soak-${crypto.randomUUID()}`;
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
	inFlight++;
	try {
		await client.track({ command });
	} catch (cause) {
		outcome =
			cause instanceof BalanceWorkerClientError
				? cause.workerCode
					? `${cause.code}:${cause.workerCode}`
					: cause.code
				: `THROW:${(cause as Error).name}`;
	} finally {
		inFlight--;
	}
	// Every request is reconciled, warm-up included; only measured ones count toward the outcome table.
	outcomesFile.write(`${id} ${outcome} ${partition} ${sentAt}\n`);
	if (measuring) {
		outcomeCounts[outcome] = (outcomeCounts[outcome] ?? 0) + 1;
		const second = Math.floor(sentAt / 1000);
		const bucket = perSecond.get(second) ?? { total: 0, failed: 0 };
		bucket.total++;
		if (outcome !== "200") bucket.failed++;
		perSecond.set(second, bucket);
	}
	return outcome;
}
let hammering = false;
const intervalMs = 1000 / RATE_PER_PARTITION;
function startHammer(): void {
	hammering = true;
	for (const partition of customers.keys()) {
		void (async () => {
			let next = Date.now();
			while (hammering) {
				void trackOnce(partition);
				next += intervalMs;
				await Bun.sleep(Math.max(0, next - Date.now()));
			}
		})();
	}
}

// --- Workers ---------------------------------------------------------------------------------------
type Worker = {
	name: string;
	endpoint: string;
	child: Bun.Subprocess;
	spawnedAt: number;
	dir: string;
	stats?: Record<string, number>;
	startedAt?: number;
};
const workers: Worker[] = [];
const children: Bun.Subprocess[] = [];
process.on("exit", () => {
	for (const child of children) child.kill("SIGKILL");
});
const edgeConfigOverride = Buffer.from(
	JSON.stringify({
		[BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY]: {
			...defaultSubjectSnapshotsEdgeConfig(),
			mode: "off" as const,
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
	const dir = mkdtempSync(join(tmpdir(), `soak-${name}-`));
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
	};
	const {
		AUTUMN_EDGE_CONFIG_OVERRIDE_B64: _,
		LIBRDKAFKA_DEBUG: __,
		...inherited
	} = process.env;
	const inheritedEnv = Object.fromEntries(
		Object.entries(inherited).filter(([key]) => !key.startsWith("INFISICAL_")),
	);
	const child =
		WORKER_ENTRY === "main"
			? Bun.spawn(["bun", "--config=./bunfig.toml", "src/main.ts"], {
					cwd: new URL("../../../", import.meta.url).pathname,
					env: {
						...inheritedEnv,
						...Object.fromEntries(
							Object.entries(env).map(([key, value]) => [key, String(value)]),
						),
						NODE_ENV: "test",
						AUTUMN_EDGE_CONFIG_OVERRIDE_B64: edgeConfigOverride,
					},
					stdout: "pipe",
					stderr: "pipe",
				})
			: Bun.spawn(
					["bun", new URL("./benchWorker.ts", import.meta.url).pathname],
					{
						env: {
							...inheritedEnv,
							NODE_ENV: "test",
							BENCH_STATS_INTERVAL_MS: String(SAMPLE_MS),
							AUTUMN_EDGE_CONFIG_OVERRIDE_B64: edgeConfigOverride,
							BENCH_WORKER_ENV: JSON.stringify(env),
						},
						stdout: "pipe",
						stderr: "pipe",
					},
				);
	const worker: Worker = {
		name,
		endpoint: env.BALANCE_WORKER_ENDPOINT,
		child,
		spawnedAt: Date.now(),
		dir,
	};
	children.push(child);
	void child.exited.then((exitCode) => {
		record({
			t: Date.now(),
			source: name,
			event: "worker.exited",
			exitCode,
			signalCode: child.signalCode,
			duringRun: hammering,
		});
	});
	const stderrLog = Bun.file(join(outDir, `worker-${name}.stderr`)).writer();
	const stdoutLog =
		WORKER_ENTRY === "main"
			? Bun.file(join(outDir, `worker-${name}.stdout`)).writer()
			: undefined;
	void (async () => {
		for await (const chunk of child.stderr as ReadableStream<Uint8Array>)
			stderrLog.write(chunk);
		await stderrLog.end();
	})();
	void (async () => {
		let buffered = "";
		for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
			buffered += new TextDecoder().decode(chunk);
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) {
				if (!line) continue;
				stdoutLog?.write(`${line}\n`);
				stdoutLog?.flush();
				// biome-ignore lint/suspicious/noExplicitAny: worker lines are events or kafka log lines
				let parsed: any;
				try {
					parsed = JSON.parse(line);
				} catch {
					record({
						t: Date.now(),
						source: name,
						event: "worker.stdout",
						line: line.slice(0, 300),
					});
					continue;
				}
				if (WORKER_ENTRY === "main" && typeof parsed.msg === "string") {
					const level = String(parsed.level ?? "").toLowerCase();
					if (level === "error" || level === "warn" || level === "fatal") {
						record({
							t: Date.now(),
							source: name,
							event: `main.${level}`,
							message: parsed.msg.slice(0, 300),
						});
						if (level !== "warn") log(`[${name}] ${line.slice(0, 1000)}`);
					}
					continue;
				}
				if (typeof parsed.message === "string") {
					record({
						t: Date.now(),
						source: name,
						event: `kafka.${String(parsed.level ?? "log").toLowerCase()}`,
						message: String(parsed.message).slice(0, 300),
					});
					continue;
				}
				if (!("event" in parsed)) continue;
				if (parsed.event === "stats") {
					worker.stats = parsed;
					continue;
				}
				if (parsed.event === "runtime.status") continue;
				if (parsed.event === "worker.started") worker.startedAt = parsed.t;
				remember(parsed.event, parsed.t);
				record({ ...parsed, source: name });
				if (
					/^(log\.error|error|unhealthy|consumer\.crash|service\.stopped)/.test(
						parsed.event,
					)
				)
					log(`[${name}] ${line.slice(0, 1000)}`);
			}
		}
	})();
	return worker;
}

// --- Sampling --------------------------------------------------------------------------------------
type ProcSample = { rssMb: number; threads: number; fds: number };
function readProc(pid: number): ProcSample | null {
	try {
		const status = readFileSync(`/proc/${pid}/status`, "utf8");
		const rssKb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
		const threads = Number(/Threads:\s+(\d+)/.exec(status)?.[1] ?? 0);
		const fds = readdirSync(`/proc/${pid}/fd`).length;
		return { rssMb: rssKb / 1024, threads, fds };
	} catch {
		return null;
	}
}
const UUID = /-?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function listGroups(): Promise<{
	total: number;
	byPrefix: Record<string, number>;
	groups: string[];
}> {
	const proc = Bun.spawn(
		[
			`${kafkaBin}/kafka-consumer-groups.sh`,
			"--bootstrap-server",
			brokers[0],
			"--list",
		],
		{
			stdout: "pipe",
			stderr: "ignore",
			env: { ...process.env, KAFKA_HEAP_OPTS: "-Xmx128m" },
		},
	);
	const text = await new Response(proc.stdout).text();
	await proc.exited;
	const groups = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	const byPrefix: Record<string, number> = {};
	for (const group of groups) {
		const prefix = group
			.replace(UUID, "-<uuid>")
			.replace(deployment, "<deployment>");
		byPrefix[prefix] = (byPrefix[prefix] ?? 0) + 1;
	}
	return { total: groups.length, byPrefix, groups };
}
const samplesFile = Bun.file(join(outDir, "samples.jsonl")).writer();
const groupSamples: {
	t: number;
	total: number;
	byPrefix: Record<string, number>;
}[] = [];
let lastSampleAt = Date.now();
let lastSampleCounts = { total: 0, failed: 0 };
let latestGroups:
	| { t: number; total: number; byPrefix: Record<string, number> }
	| undefined;
async function sampleGroups(): Promise<void> {
	const t = Date.now();
	const groups = await listGroups();
	latestGroups = { t, total: groups.total, byPrefix: groups.byPrefix };
	groupSamples.push(latestGroups);
	log(`groups=${groups.total} ${JSON.stringify(groups.byPrefix)}`);
}
async function sample(): Promise<void> {
	const now = Date.now();
	const totals = { total: 0, failed: 0 };
	for (const [second, bucket] of perSecond)
		if (second * 1000 >= lastSampleAt && second * 1000 < now) {
			totals.total += bucket.total;
			totals.failed += bucket.failed;
		}
	lastSampleCounts = totals;
	lastSampleAt = now;
	const memory = process.memoryUsage();
	const row: Record<string, unknown> = {
		t: now,
		elapsedMin: Number(((now - hammerStartedAt) / 60_000).toFixed(2)),
		requests: totals,
		inFlight,
		owned: ownedCount(),
		heraldRecords,
		ownersBuilt,
		client: {
			...readProc(process.pid),
			heapUsedMb: memory.heapUsed / 2 ** 20,
			heapTotalMb: memory.heapTotal / 2 ** 20,
			externalMb: memory.external / 2 ** 20,
		},
		workers: Object.fromEntries(
			workers.map((w) => [
				w.name,
				{
					pid: w.child.pid,
					...readProc(w.child.pid),
					heapUsedMb: w.stats ? w.stats.heapUsed / 2 ** 20 : null,
					externalMb: w.stats ? w.stats.external / 2 ** 20 : null,
				},
			]),
		),
	};
	if (latestGroups) row.groups = latestGroups;
	samplesFile.write(`${JSON.stringify(row)}\n`);
	samplesFile.flush();
	const w = row.workers as Record<string, ProcSample>;
	log(
		`sample t+${row.elapsedMin}m req=${totals.total} failed=${totals.failed} owned=${row.owned} client rss=${(row.client as ProcSample).rssMb?.toFixed(0)} thr=${(row.client as ProcSample).threads} fds=${(row.client as ProcSample).fds} | ${Object.entries(
			w,
		)
			.map(([n, s]) => `${n}:${s.rssMb?.toFixed(0)}/${s.threads}/${s.fds}`)
			.join(
				" ",
			)}${row.groups ? ` groups=${(row.groups as { total: number }).total}` : ""}`,
	);
}

// --- Run -------------------------------------------------------------------------------------------
const groupsBefore = await listGroups();
const startedAt = Date.now();
for (let i = 0; i < WORKERS; i++)
	workers.push(await spawnWorker(String.fromCharCode(65 + i)));
const settleDeadline = Date.now() + 240_000;
while (ownedCount() < PARTITION_COUNT) {
	if (Date.now() > settleDeadline)
		throw new Error("partitions never all claimed");
	await Bun.sleep(100);
}
for (const partition of customers.keys()) {
	while ((await trackOnce(partition)) !== "200") {
		if (Date.now() > settleDeadline)
			throw new Error(`partition ${partition} never served`);
		await Bun.sleep(250);
	}
}
await Bun.sleep(5_000);
log(
	`fleet of ${WORKERS} settled in ${Date.now() - startedAt}ms; hammering ${RATE_PER_PARTITION}/s x ${PARTITION_COUNT}`,
);
const hammerStartedAt = Date.now();
measuring = true;
startHammer();
const sampler = setInterval(() => void sample(), SAMPLE_MS);
void sampleGroups();
const groupSampler = setInterval(() => void sampleGroups(), GROUP_SAMPLE_MS);

type Cycle = {
	index: number;
	worker: string;
	replacement: string;
	stopBeganAt: number;
	exitedAt?: number;
	exitCode?: number | null;
	replacementStartedAt?: number;
	ownersSwappedAt?: number;
	ownersCatchUpMs?: number;
	failed: number;
	total: number;
	lastFailureAt?: number;
	lastClaimAt?: number;
	recoveredFromStopMs?: number;
	recoveredFromReplacementMs?: number;
	groupsAfter?: number;
	ownershipGroupsAfter?: number;
	client?: ProcSample | null;
	replacementProc?: ProcSample | null;
};
const cycles: Cycle[] = [];
async function churnOnce(index: number): Promise<void> {
	const victim = workers[index % workers.length];
	const generation = Math.floor(index / workers.length) + 1;
	const replacementName = `${victim.name[0]}${generation}`;
	const cycle: Cycle = {
		index,
		worker: victim.name,
		replacement: replacementName,
		stopBeganAt: Date.now(),
		failed: 0,
		total: 0,
	};
	cycles.push(cycle);
	record({
		t: cycle.stopBeganAt,
		source: "harness",
		event: "churn.stop",
		worker: victim.name,
	});
	victim.child.kill("SIGTERM");
	const exitCode = await Promise.race([
		victim.child.exited,
		Bun.sleep(120_000).then(() => "timeout" as const),
	]);
	if (exitCode === "timeout") {
		const dump = Bun.spawn(
			[
				"gdb",
				"-p",
				String(victim.child.pid),
				"-batch",
				"-ex",
				"thread apply all bt 12",
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		await Bun.write(
			join(outDir, `stop-hang-${victim.name}.gdb.txt`),
			await new Response(dump.stdout).text(),
		);
		record({
			t: Date.now(),
			source: "harness",
			event: "churn.stop_timeout",
			worker: victim.name,
		});
		victim.child.kill("SIGKILL");
		await victim.child.exited;
	}
	cycle.exitedAt = Date.now();
	cycle.exitCode = victim.child.exitCode;
	rmSync(victim.dir, { recursive: true, force: true });
	const replacement = await spawnWorker(replacementName);
	workers[workers.indexOf(victim)] = replacement;
	const replacementReady = (async () => {
		const deadline = Date.now() + 180_000;
		while (
			!replacement.startedAt &&
			replacement.child.exitCode === null &&
			Date.now() < deadline
		) {
			if (WORKER_ENTRY === "main") {
				const healthy = await fetch(`${replacement.endpoint}/health`, {
					signal: AbortSignal.timeout(1_000),
				}).then(
					(response) => response.ok,
					() => false,
				);
				if (healthy) replacement.startedAt = Date.now();
			}
			await Bun.sleep(200);
		}
		cycle.replacementStartedAt = replacement.startedAt;
	})();
	// The server side of the same churn: a fresh ownership consumer, caught up, then routing swaps onto it.
	const swapStartedAt = Date.now();
	const fresh = buildOwners();
	try {
		await fresh.start();
		const previous = routing;
		routing = fresh;
		cycle.ownersSwappedAt = Date.now();
		cycle.ownersCatchUpMs = cycle.ownersSwappedAt - swapStartedAt;
		await previous.stop();
	} catch (cause) {
		record({
			t: Date.now(),
			source: "client",
			event: "client.owners_swap_failed",
			cause: String(cause),
		});
		await fresh.stop().catch(() => {});
	}
	await replacementReady;
	const groups = await listGroups();
	cycle.groupsAfter = groups.total;
	cycle.ownershipGroupsAfter = groups.groups.filter((g) =>
		/^autumn-ownership-[0-9a-f]{8}-/.test(g),
	).length;
	cycle.client = readProc(process.pid);
	cycle.replacementProc = readProc(replacement.child.pid);
	log(
		`churn ${index}: ${victim.name}->${replacementName} exit=${cycle.exitCode} stop=${(cycle.exitedAt ?? 0) - cycle.stopBeganAt}ms owners=${cycle.ownersCatchUpMs}ms groups=${groups.total} ownershipGroups=${cycle.ownershipGroupsAfter} client=${JSON.stringify(cycle.client)}`,
	);
}
let churnIndex = 0;
const runEndsAt = hammerStartedAt + DURATION_MS;
if (CHURN_INTERVAL_MS > 0) {
	while (Date.now() + CHURN_INTERVAL_MS <= runEndsAt) {
		await Bun.sleep(CHURN_INTERVAL_MS);
		await churnOnce(churnIndex++);
	}
}
await Bun.sleep(Math.max(0, runEndsAt - Date.now()));
measuring = false;
hammering = false;
clearInterval(sampler);
clearInterval(groupSampler);
await sample();
const hammerEndedAt = Date.now();
log(`hammer stopped; ${inFlight} in flight`);
while (inFlight > 0 && Date.now() - hammerEndedAt < 30_000)
	await Bun.sleep(100);
await outcomesFile.flush();

// Per-cycle recovery: failures and claims between this stop and the next one.
for (let i = 0; i < cycles.length; i++) {
	const cycle = cycles[i];
	const windowEnd = cycles[i + 1]?.stopBeganAt ?? hammerEndedAt;
	for (const [second, bucket] of perSecond) {
		const t = second * 1000;
		if (t < cycle.stopBeganAt - 1000 || t >= windowEnd) continue;
		cycle.total += bucket.total;
		cycle.failed += bucket.failed;
		if (bucket.failed > 0)
			cycle.lastFailureAt = Math.max(cycle.lastFailureAt ?? 0, t + 1000);
	}
	cycle.lastClaimAt = claimTimes
		.filter((t) => t >= cycle.stopBeganAt && t < windowEnd)
		.at(-1);
	const recoveredAt = Math.max(
		cycle.lastFailureAt ?? 0,
		cycle.lastClaimAt ?? 0,
		cycle.stopBeganAt,
	);
	cycle.recoveredFromStopMs = recoveredAt - cycle.stopBeganAt;
	if (cycle.replacementStartedAt)
		cycle.recoveredFromReplacementMs = Math.max(
			0,
			recoveredAt - cycle.replacementStartedAt,
		);
}

// --- Reconciliation --------------------------------------------------------------------------------
log(
	"reconciling: waiting for workers to flush every logged record to Postgres",
);
const ends = await admin.fetchTopicOffsets(topics.metering);
const flushDeadline = Date.now() + 180_000;
const progressLag: Record<number, string> = {};
for (const { partition, high } of ends) {
	const customer = customers.get(partition);
	if (!customer) continue;
	for (;;) {
		const next = await customer.readNextOffset({
			topic: topics.metering,
			partition,
		});
		if (next !== null && next >= BigInt(high)) break;
		if (Date.now() > flushDeadline) {
			progressLag[partition] = `${next} < ${high}`;
			break;
		}
		await Bun.sleep(500);
	}
}
const groupsAtEnd = await listGroups();
const describeProc = Bun.spawn(
	[
		`${kafkaBin}/kafka-consumer-groups.sh`,
		"--bootstrap-server",
		brokers[0],
		"--describe",
		"--all-groups",
		"--state",
	],
	{
		stdout: "pipe",
		stderr: "ignore",
		env: { ...process.env, KAFKA_HEAP_OPTS: "-Xmx128m" },
	},
);
await Bun.write(
	join(outDir, "groups-state-end.txt"),
	await new Response(describeProc.stdout).text(),
);
const describeOffsets = Bun.spawn(
	[
		`${kafkaBin}/kafka-consumer-groups.sh`,
		"--bootstrap-server",
		brokers[0],
		"--describe",
		"--all-groups",
		"--offsets",
	],
	{
		stdout: "pipe",
		stderr: "ignore",
		env: { ...process.env, KAFKA_HEAP_OPTS: "-Xmx128m" },
	},
);
await Bun.write(
	join(outDir, "groups-offsets-end.txt"),
	await new Response(describeOffsets.stdout).text(),
);

const finalSamples = workers.map((w) => ({
	name: w.name,
	...readProc(w.child.pid),
}));
const shutdowns: { worker: string; exitCode: number | null; stopMs: number }[] =
	[];
for (const worker of workers) {
	const began = Date.now();
	worker.child.kill("SIGTERM");
	await Promise.race([worker.child.exited, Bun.sleep(60_000)]);
	shutdowns.push({
		worker: worker.name,
		exitCode: worker.child.exitCode,
		stopMs: Date.now() - began,
	});
	rmSync(worker.dir, { recursive: true, force: true });
}
await Promise.all(heralds.map((h) => h.stop()));
await routing.stop();
await watcher.disconnect();

log(
	"reconciling: reading the metering log from the beginning (read_committed)",
);
await outcomesFile.end();
const reconciliation = await reconcileSoak({
	kafka,
	postgres,
	outDir,
	topic: topics.metering,
	seedBalance: SEED_BALANCE,
});

await admin.deleteTopics({ topics: Object.values(topics) });
await admin.disconnect();
for (const customer of [...customers.values(), ...extraCustomers])
	await customer.cleanup();
await postgres.close();

// --- Summary ---------------------------------------------------------------------------------------
const failedTotal = Object.entries(outcomeCounts)
	.filter(([outcome]) => outcome !== "200")
	.reduce((sum, [, n]) => sum + n, 0);
const summary = {
	config: {
		deployment,
		WORKERS,
		PARTITION_COUNT,
		REPLICATION,
		RATE_PER_PARTITION,
		DURATION_MS,
		CHURN_INTERVAL_MS,
		HERALD_MEMBERS,
	},
	requests: {
		total: Object.values(outcomeCounts).reduce((a, b) => a + b, 0),
		failed: failedTotal,
		byOutcome: outcomeCounts,
	},
	events: {
		crashes: notableEvents
			.filter((e) => e.event === "consumer.crash")
			.map((e) => ({
				t: e.t,
				worker: e.source,
				restart: e.restart,
				error: e.error,
			})),
		crashCount: eventCounts["consumer.crash"] ?? 0,
		groupJoins: eventCounts["consumer.group_join"] ?? 0,
		rebalancing: eventCounts["consumer.rebalancing"] ?? 0,
		prepares: eventCounts["runtime.prepare"] ?? 0,
		claims: eventCounts["claim.done"] ?? 0,
		workerErrors: Object.fromEntries(
			Object.entries(eventCounts).filter(([e]) =>
				/^(log\.error|log\.warn|error|unhealthy|service\.stopped|kafka\.(warn|error))$/.test(
					e,
				),
			),
		),
		clientOwnershipFailures: ownersFailed,
		ownershipConsumersBuilt: ownersBuilt,
		heraldRecords,
		heraldErrors:
			(eventCounts["herald.error"] ?? 0) + (eventCounts["herald.crashed"] ?? 0),
		unexpectedWorkerExits: notableEvents.filter(
			(e) =>
				e.event === "worker.exited" &&
				e.duringRun === true &&
				!cycles.some((c) => c.worker === e.source),
		).length,
	},
	churn: {
		cycles: cycles.length,
		failedDuringCycles: cycles.reduce((s, c) => s + c.failed, 0),
		maxRecoveredFromStopMs: Math.max(
			0,
			...cycles.map((c) => c.recoveredFromStopMs ?? 0),
		),
		maxRecoveredFromReplacementMs: Math.max(
			0,
			...cycles.map((c) => c.recoveredFromReplacementMs ?? 0),
		),
		stopExitCodes: cycles.reduce<Record<string, number>>((acc, c) => {
			acc[String(c.exitCode)] = (acc[String(c.exitCode)] ?? 0) + 1;
			return acc;
		}, {}),
		maxStopMs: Math.max(
			0,
			...cycles.map((c) => (c.exitedAt ?? 0) - c.stopBeganAt),
		),
		maxOwnersCatchUpMs: Math.max(
			0,
			...cycles.map((c) => c.ownersCatchUpMs ?? 0),
		),
		detail: cycles,
	},
	groups: {
		before: { total: groupsBefore.total, byPrefix: groupsBefore.byPrefix },
		end: { total: groupsAtEnd.total, byPrefix: groupsAtEnd.byPrefix },
		samples: groupSamples,
	},
	reconciliation: {
		...reconciliation,
		postgresFlushLag: progressLag,
		ok: reconciliation.ok && Object.keys(progressLag).length === 0,
	},
	shutdowns,
	finalWorkerProcs: finalSamples,
	eventCounts,
};
await Bun.write(join(outDir, "summary.json"), JSON.stringify(summary, null, 1));
await Bun.write(
	join(outDir, "events.json"),
	JSON.stringify({ notableEvents, recentEvents }, null, 1),
);
console.log(
	JSON.stringify(
		{ ...summary, churn: { ...summary.churn, detail: undefined } },
		null,
		1,
	),
);
process.exit(0);
