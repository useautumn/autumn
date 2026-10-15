/**
 * Breaks one broker under the leader-churn harness's steady load (20 req/s per partition, real worker
 * subprocesses, the server's routing client) and reports what clients saw and whether the money adds
 * up afterwards. One fault per run, chosen by CHAOS_FAULT:
 *
 *   kill   CHAOS_SIGNAL=TERM|KILL, broker down for CHAOS_DOWN_MS (20s), then restarted
 *   stall  CHAOS_STALL_MS held CHAOS_STALL_COUNT times, CHAOS_STALL_GAP_MS apart, through stallProxy.ts
 *   cut    CHAOS_CUT_MODE=clients|brokers|full: iptables drops the broker's traffic for CHAOS_DOWN_MS (60s)
 *   none   the control
 *
 * CHAOS_TARGET=coord picks the broker coordinating the workers' consumer group, noncoord (default) the
 * one leading the most metering partitions among the rest, or a node id. The cluster is chaosCluster.sh;
 * a stall run must bootstrap through the proxies (KAFKA_BROKERS=$(chaosCluster.sh proxied)).
 *
 *   tests/benchmarks/ownership-handoff/chaosCluster.sh start
 *   cd apps/balance-worker
 *   CHAOS_LABEL=kill-term KAFKA_BROKERS=$(tests/benchmarks/ownership-handoff/chaosCluster.sh direct) \
 *     DATABASE_URL=... NODE_ENV=test CHAOS_FAULT=kill bun tests/benchmarks/ownership-handoff/brokerChaos.ts
 *
 * After the run quiesces it reconciles: every track the client saw succeed has exactly one record in the
 * metering log (read_committed, from the beginning), no command id appears twice, and each seeded
 * customer's Postgres balance equals the seeded balance minus what the log deducted.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTrackCommand } from "@autumn/balance-engine";
import {
	BalanceWorkerClientError,
	createBalanceWorkerClient,
	createBalanceWorkerKafka,
	createOwnersFromKafka,
} from "@autumn/balance-worker-client";
import {
	BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY,
	defaultSubjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS,
	BALANCE_WORKER_REQUEST_TIMEOUT_MS,
	BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import {
	meteringIdentityToPartition,
	meteringTopic,
	ownershipTopic,
} from "@autumn/kafka";
import { createTestKafka } from "../../fixtures/testKafka.js";
import {
	openFixturePostgres,
	type SeededCustomer,
	seedCustomer,
} from "../../integration/postgres/postgresCustomerFixture.js";

const BACKEND = "postgres" as const;
const LABEL = process.env.CHAOS_LABEL ?? "chaos";
const PARTITION_COUNT = Number(process.env.CHURN_PARTITIONS ?? 16);
const REPLICATION = Number(process.env.CHAOS_RF ?? 3);
const WORKERS = Number(process.env.CHURN_WORKERS ?? 4);
const HAMMER_INTERVAL_MS = 50;
const SEED_BALANCE = 1_000_000_000;
const FAULT = process.env.CHAOS_FAULT ?? "none";
const TARGET = process.env.CHAOS_TARGET ?? "noncoord";
const SIGNAL = process.env.CHAOS_SIGNAL ?? "TERM";
const DOWN_MS = Number(
	process.env.CHAOS_DOWN_MS ?? (FAULT === "cut" ? 60_000 : 20_000),
);
const CUT_MODE = process.env.CHAOS_CUT_MODE ?? "clients";
const STALL_MS = Number(process.env.CHAOS_STALL_MS ?? 1_500);
const STALL_COUNT = Number(process.env.CHAOS_STALL_COUNT ?? 10);
const STALL_GAP_MS = Number(process.env.CHAOS_STALL_GAP_MS ?? 6_000);
const BASELINE_MS = Number(process.env.CHAOS_BASELINE_MS ?? 15_000);
const SETTLE_MS = Number(process.env.CHAOS_SETTLE_MS ?? 60_000);
const OUT_DIR = process.env.BENCH_OUT_DIR ?? tmpdir();
const BROKER_IDS = [1, 2, 3];
const PROXY_CONTROL_PORT = 29_999;
const clusterScript = new URL("./chaosCluster.sh", import.meta.url).pathname;

const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
if (brokers.length === 0) throw new Error("KAFKA_BROKERS is required");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
	throw new Error("DATABASE_URL is required (a migrated Postgres)");
if (FAULT === "stall" && !brokers[0].startsWith("127.0.0.1:29"))
	throw new Error("a stall run must bootstrap through the proxies");

type WorkerEvent = { t: number; worker: string; event: string } & Record<
	string,
	unknown
>;
type OwnershipEvent = {
	seenAt: number;
	partition: number;
	type: "claimed" | "unowned" | "released" | "ready" | "draining" | "preparing";
	endpoint?: string;
};
type ClientOutcome = {
	commandId: string;
	partition: number;
	sentAt: number;
	doneAt: number;
	outcome: string;
};

const workerEvents: WorkerEvent[] = [];
const ownershipEvents: OwnershipEvent[] = [];
/** Every track this run sent, settle traffic included: the ledger the reconciliation checks. */
const ledger: ClientOutcome[] = [];
const marks: { t: number; label: string }[] = [];
function mark(label: string): number {
	const t = Date.now();
	marks.push({ t, label });
	console.error(`[${new Date(t).toISOString()}] ${label}`);
	return t;
}

/** Async so the hammer keeps its pace while a broker restarts: a broker takes ~20s to listen again. */
async function cluster(...args: string[]): Promise<string> {
	const child = Bun.spawn(["bash", clusterScript, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (exitCode !== 0)
		throw new Error(`chaosCluster.sh ${args.join(" ")}: ${stderr}`);
	return stdout.trim();
}
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

const children: Bun.Subprocess[] = [];
process.on("exit", () => {
	for (const child of children) child.kill("SIGKILL");
	if (FAULT === "cut") Bun.spawnSync(["bash", clusterScript, "heal"]);
});

// The stall proxies: transparent until told to hold a broker.
if (FAULT === "stall") {
	const proxy = Bun.spawn(
		["bun", new URL("./stallProxy.ts", import.meta.url).pathname],
		{
			env: {
				...process.env,
				STALL_PROXY_MAP: BROKER_IDS.map(
					(b) => `${29_092 + b * 100}=10.77.${b}.2:9093`,
				).join(","),
				STALL_PROXY_CONTROL_PORT: String(PROXY_CONTROL_PORT),
			},
			stdout: "pipe",
			stderr: "inherit",
		},
	);
	children.push(proxy);
	const reader = (proxy.stdout as ReadableStream<Uint8Array>).getReader();
	const { value } = await reader.read();
	if (!new TextDecoder().decode(value).includes("proxy.ready"))
		throw new Error("stall proxy failed to start");
	reader.releaseLock();
}

const deployment = `chaos-${crypto.randomUUID().slice(0, 8)}`;
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
			type: record.type,
			endpoint: record.endpoint,
		});
	},
});

// The server's routing client as getBalanceWorkerClient builds it: its Kafka limits, owners that rebuild a
// failed ownership consumer, the production budgets; plus a log tap so a rebuild shows up in the summary.
function routingLog(level: string) {
	return (first: unknown, second?: unknown) => {
		const fields =
			typeof first === "object" && first !== null
				? (first as Record<string, unknown>)
				: {};
		const message = typeof first === "string" ? first : String(second ?? "");
		workerEvents.push({
			t: Date.now(),
			worker: "routing",
			event: `routing.${level}`,
			type: fields.type,
			message,
			error: String(fields.error ?? ""),
		});
	};
}
const routingKafka = createBalanceWorkerKafka({
	clientId: `${deployment}-server`,
	brokers,
	authMode: "none",
});
const owners = createOwnersFromKafka({
	ctx: {
		kafka: routingKafka,
		logger: {
			info: routingLog("info"),
			warn: routingLog("warn"),
			error: routingLog("error"),
		},
	},
	config: {
		topic: topics.ownership,
		groupIdPrefix: `${deployment}-server-ownership`,
		catchUpTimeoutMs: BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS,
	},
});
await owners.start();
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

const inFlight = new Set<Promise<string>>();
async function sendTrack(partition: number): Promise<string> {
	const customer = customers.get(partition);
	if (!customer) throw new Error(`No customer for partition ${partition}`);
	const id = `chaos-${crypto.randomUUID()}`;
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
	}
	ledger.push({
		commandId: id,
		partition,
		sentAt,
		doneAt: Date.now(),
		outcome,
	});
	return outcome;
}
function trackOnce(partition: number): Promise<string> {
	const sent = sendTrack(partition);
	inFlight.add(sent);
	void sent.finally(() => inFlight.delete(sent));
	return sent;
}

let hammering = false;
let hammerStart = 0;
function startHammer(): void {
	hammering = true;
	hammerStart = Date.now();
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

type Worker = {
	name: string;
	endpoint: string;
	child: Bun.Subprocess;
	spawnedAt: number;
	dir: string;
	exitedAt?: number;
};
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
let workerGroupId: string | undefined;
async function spawnWorker(name: string): Promise<Worker> {
	const port = await reservePort();
	const dir = mkdtempSync(join(tmpdir(), `chaos-${name}-`));
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
	};
	const { AUTUMN_EDGE_CONFIG_OVERRIDE_B64: _, ...inherited } = process.env;
	const child = Bun.spawn(
		["bun", new URL("./benchWorker.ts", import.meta.url).pathname],
		{
			env: {
				...inherited,
				NODE_ENV: "test",
				BENCH_EMIT_REQUEST_TIMINGS: "1",
				AUTUMN_EDGE_CONFIG_OVERRIDE_B64: edgeConfigOverride,
				BENCH_WORKER_ENV: JSON.stringify(env),
			},
			stdout: "pipe",
			stderr: "inherit",
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
		worker.exitedAt = Date.now();
		workerEvents.push({
			t: Date.now(),
			worker: name,
			event: "worker.exited",
			exitCode,
			duringRun: hammering,
		});
	});
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
					continue;
				}
				if (typeof parsed.message === "string") {
					if (parsed.level === "WARN" || parsed.level === "ERROR")
						workerEvents.push({
							t: Date.now(),
							worker: name,
							event: `kafka.${parsed.level.toLowerCase()}`,
							message: parsed.message,
						});
					continue;
				}
				if (!("event" in parsed)) continue;
				workerEvents.push(parsed);
				if (parsed.event === "worker.starting") workerGroupId = parsed.groupId;
				if (
					/^(log\.error|error|unhealthy|consumer\.crash|service\.stopped)/.test(
						parsed.event,
					)
				)
					console.error(`[${parsed.worker}] ${line.slice(0, 1500)}`);
			}
		}
	})();
	return worker;
}

async function waitFor(
	condition: () => boolean,
	timeoutMs: number,
	what: string,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
		await Bun.sleep(25);
	}
}

/** Kafka's GroupCoordinator placement: Utils.abs(groupId.hashCode()) % offsets partitions. */
function offsetsPartitionOf(groupId: string, partitions: number): number {
	let hash = 0;
	for (let i = 0; i < groupId.length; i++)
		hash = (Math.imul(hash, 31) + groupId.charCodeAt(i)) | 0;
	return (hash & 0x7fffffff) % partitions;
}
async function coordinatorOf(groupId: string): Promise<number> {
	const metadata = await admin.fetchTopicMetadata({
		topics: ["__consumer_offsets"],
	});
	const offsets = metadata.topics[0].partitions;
	const partition = offsetsPartitionOf(groupId, offsets.length);
	const leader = offsets.find((p) => p.partitionId === partition)?.leader;
	if (leader === undefined) throw new Error("no __consumer_offsets leader");
	return leader;
}
async function meteringLeaders(): Promise<Map<number, number>> {
	const metadata = await admin.fetchTopicMetadata({
		topics: [topics.metering],
	});
	return new Map(
		metadata.topics[0].partitions.map((p) => [p.partitionId, p.leader]),
	);
}

const workers: Worker[] = [];
for (let i = 0; i < WORKERS; i++)
	workers.push(await spawnWorker(String.fromCharCode(65 + i)));
function claimedPartitions(since: number): Set<number> {
	return new Set(
		ownershipEvents
			.filter((e) => e.type === "claimed" && e.seenAt >= since)
			.map((e) => e.partition),
	);
}
await waitFor(
	() => claimedPartitions(workers[0].spawnedAt).size === PARTITION_COUNT,
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

// Pick the broker to break, now that the workers' group exists and leadership has settled.
if (!workerGroupId) throw new Error("no worker reported its group id");
const workerCoordinator = await coordinatorOf(workerGroupId);
const leadersBefore = await meteringLeaders();
const ledCount = (broker: number) =>
	[...leadersBefore.values()].filter((leader) => leader === broker).length;
const target =
	TARGET === "coord"
		? workerCoordinator
		: TARGET === "noncoord"
			? BROKER_IDS.filter((b) => b !== workerCoordinator).sort(
					(a, b) => ledCount(b) - ledCount(a),
				)[0]
			: Number(TARGET);
const affectedPartitions = new Set(
	[...leadersBefore].filter(([, leader]) => leader === target).map(([p]) => p),
);
const targetInfo = {
	fault: FAULT,
	target,
	workerGroupId,
	workerCoordinator,
	targetIsWorkerCoordinator: target === workerCoordinator,
	meteringLeadersBefore: Object.fromEntries(leadersBefore),
	affectedPartitions: [...affectedPartitions].sort((a, b) => a - b),
};
console.error(`target: ${JSON.stringify(targetInfo)}`);

console.error(`fleet of ${WORKERS} settled; hammering`);
startHammer();
await Bun.sleep(BASELINE_MS);

async function holdBroker(broker: number, holdMs: number): Promise<void> {
	const response = await fetch(`http://127.0.0.1:${PROXY_CONTROL_PORT}/`, {
		method: "POST",
		body: JSON.stringify({ listen: 29_092 + broker * 100, holdMs }),
	});
	if (!response.ok) throw new Error(`proxy refused: ${await response.text()}`);
}

const faultStart = mark(`fault.start ${FAULT} broker ${target}`);
let faultCleared = faultStart;
let brokerListeningAt: number | undefined;
if (FAULT === "kill") {
	const pid = await cluster("kill", String(target), SIGNAL);
	mark(`sent SIG${SIGNAL} to broker ${target} (pid ${pid})`);
	await waitFor(() => !isAlive(Number(pid)), 60_000, "broker exit");
	mark(`broker ${target} exited`);
	await Bun.sleep(Math.max(0, faultStart + DOWN_MS - Date.now()));
	await cluster("start-node", String(target));
	faultCleared = mark(`broker ${target} restarting`);
	await cluster("wait-node", String(target));
	brokerListeningAt = mark(`broker ${target} listening`);
} else if (FAULT === "stall") {
	for (let i = 0; i < STALL_COUNT; i++) {
		const at = Date.now();
		await holdBroker(target, STALL_MS);
		mark(`stall ${i}: hold ${STALL_MS}ms on broker ${target}`);
		faultCleared = at + STALL_MS;
		if (i < STALL_COUNT - 1)
			await Bun.sleep(Math.max(0, at + STALL_GAP_MS - Date.now()));
	}
	await Bun.sleep(Math.max(0, faultCleared - Date.now()));
	mark("stall.last_hold_ended");
} else if (FAULT === "cut") {
	await cluster("cut", String(target), CUT_MODE);
	mark(`cut ${CUT_MODE} on broker ${target}`);
	await Bun.sleep(DOWN_MS);
	await cluster("heal");
	faultCleared = mark(`healed broker ${target}`);
} else if (FAULT !== "none") {
	throw new Error(`unknown CHAOS_FAULT ${FAULT}`);
}
await Bun.sleep(SETTLE_MS);
hammering = false;
const hammerEnd = mark("hammer.stop");
await Promise.allSettled([...inFlight]);
const leadersAfter = await meteringLeaders();

// --- What clients saw ------------------------------------------------------------------------------
function countBy<T>(
	items: T[],
	key: (item: T) => string,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
	return out;
}
const phase = (t: number) =>
	t < faultStart ? "baseline" : t <= faultCleared ? "fault" : "after";
const hammered = ledger.filter((o) => o.sentAt >= hammerStart);
const failed = hammered.filter((o) => o.outcome !== "200");
const perSecond: Record<string, Record<string, number>> = {};
for (const o of hammered) {
	const s = String(Math.floor((o.sentAt - faultStart) / 1000));
	perSecond[s] ??= {};
	perSecond[s][o.outcome] = (perSecond[s][o.outcome] ?? 0) + 1;
}

/** From the fault clearing until the failure rate is zero for good and every partition is claimed by a live worker. */
function recovery() {
	const lastFailure = failed.reduce<ClientOutcome | undefined>(
		(last, o) => (!last || o.sentAt > last.sentAt ? o : last),
		undefined,
	);
	const exitedEndpoints = (t: number) =>
		new Set(
			workers
				.filter((w) => w.exitedAt !== undefined && w.exitedAt <= t)
				.map((w) => w.endpoint),
		);
	const state = new Map<number, OwnershipEvent>();
	let allOwnedSince: number | null = null;
	const owned = (t: number) =>
		state.size === PARTITION_COUNT &&
		[...state.values()].every(
			(e) =>
				e.type === "claimed" &&
				e.endpoint !== undefined &&
				!exitedEndpoints(t).has(e.endpoint),
		);
	for (const event of [...ownershipEvents].sort(
		(a, b) => a.seenAt - b.seenAt,
	)) {
		const was = owned(event.seenAt);
		state.set(event.partition, event);
		const is = owned(event.seenAt);
		if (is && !was) allOwnedSince = event.seenAt;
		if (!is) allOwnedSince = null;
	}
	const failuresSinceMs = lastFailure
		? Math.max(0, lastFailure.sentAt - faultCleared)
		: 0;
	const ownedSinceMs =
		allOwnedSince === null ? null : Math.max(0, allOwnedSince - faultCleared);
	const lastTen = hammered.filter((o) => o.sentAt >= hammerEnd - 10_000);
	return {
		lastFailureRelToClearMs: lastFailure
			? lastFailure.sentAt - faultCleared
			: null,
		lastFailureOutcome: lastFailure?.outcome ?? null,
		allPartitionsOwnedRelToClearMs: ownedSinceMs,
		recoveryMs:
			ownedSinceMs === null ? null : Math.max(failuresSinceMs, ownedSinceMs),
		recovered:
			ownedSinceMs !== null && lastTen.every((o) => o.outcome === "200"),
	};
}

const joins = workerEvents.filter((e) => e.event === "consumer.group_join");
const timings = workerEvents.filter((e) => e.event === "kafka.request_timing");
function timingsBy(
	items: WorkerEvent[],
): Record<string, { n: number; rttMaxMs: number; outbufMaxMs: number }> {
	const out: Record<
		string,
		{ n: number; rttMaxMs: number; outbufMaxMs: number }
	> = {};
	for (const e of items) {
		const key = `${phase(e.t)}:${e.broker}`;
		out[key] ??= { n: 0, rttMaxMs: 0, outbufMaxMs: 0 };
		const row = out[key];
		row.n += 1;
		row.rttMaxMs = Math.max(row.rttMaxMs, Math.round(Number(e.durationMs)));
		row.outbufMaxMs = Math.max(
			row.outbufMaxMs,
			Math.round(Number(e.pendingMs)),
		);
	}
	return out;
}

const clientSummary = {
	totalRequests: hammered.length,
	failedRequests: failed.length,
	outcomes: countBy(hammered, (o) => o.outcome),
	outcomesByPhase: Object.fromEntries(
		["baseline", "fault", "after"].map((p) => [
			p,
			countBy(
				hammered.filter((o) => phase(o.sentAt) === p),
				(o) => o.outcome,
			),
		]),
	),
	failedByPartitionGroup: countBy(failed, (o) =>
		affectedPartitions.has(o.partition) ? "led-by-target" : "other",
	),
	crashes: workerEvents
		.filter((e) => e.event === "consumer.crash")
		.map((e) => ({
			rel: e.t - faultStart,
			worker: e.worker,
			restart: e.restart,
			error: String(
				(e.error as { message?: string })?.message ?? e.error,
			).slice(0, 200),
		})),
	groupJoins: countBy(joins, (e) => phase(e.t)),
	rebalancing: countBy(
		workerEvents.filter((e) => e.event === "consumer.rebalancing"),
		(e) => phase(e.t),
	),
	prepares: countBy(
		workerEvents.filter((e) => e.event === "runtime.prepare"),
		(e) => phase(e.t),
	),
	routingConsumerRebuilds: workerEvents.filter(
		(e) =>
			e.event === "routing.error" &&
			e.type === "balance_worker_ownership_failed",
	).length,
	routingEvents: countBy(
		workerEvents.filter(
			(e) => e.worker === "routing" && e.event !== "routing.info",
		),
		(e) => `${phase(e.t)}:${e.event}:${e.type ?? ""}`,
	),
	workerExitsDuringRun: workerEvents.filter(
		(e) => e.event === "worker.exited" && e.duringRun,
	).length,
	workerErrors: countBy(
		workerEvents.filter((e) =>
			/^(log\.error|error|unhealthy|service\.stopped)$/.test(e.event),
		),
		(e) => `${phase(e.t)}:${e.event}`,
	),
	kafkaWarnings: countBy(
		workerEvents.filter((e) => /^kafka\.(warn|error)$/.test(e.event)),
		(e) =>
			`${phase(e.t)}:${String(e.message).replace(/\d+/g, "N").slice(0, 90)}`,
	),
	ownershipRecords: countBy(
		ownershipEvents.filter((e) => e.seenAt >= faultStart),
		(e) => `${phase(e.seenAt)}:${e.type}`,
	),
	recovery: recovery(),
	producerStatsByBroker: timingsBy(timings),
	producerStatsTimeline: timings
		.filter((e) => e.t >= faultStart - 15_000 && e.t <= faultCleared + 30_000)
		.map((e) => ({
			rel: e.t - faultStart,
			worker: e.worker,
			broker: e.broker,
			rttMs: Math.round(Number(e.durationMs)),
			outbufMs: Math.round(Number(e.pendingMs)),
		})),
	perSecond,
};

// --- Does the money add up -------------------------------------------------------------------------
type LogRecord = {
	id: string;
	partition: number;
	offset: string;
	/** Per customer entitlement, the balance this record took off it. */
	deducted: Map<string, number>;
};
async function readMeteringLog(): Promise<{
	records: LogRecord[];
	complete: boolean;
	parseErrors: string[];
}> {
	const targets = new Map(
		(await admin.fetchTopicOffsets(topics.metering)).map((p) => [
			p.partition,
			Number(p.high),
		]),
	);
	const reached = new Map<number, number>();
	const records: LogRecord[] = [];
	const parseErrors: string[] = [];
	const reader = kafka.consumer({
		groupId: `${deployment}-reconcile`,
		readUncommitted: false,
	});
	await reader.connect();
	await reader.subscribe({ topics: [topics.metering], fromBeginning: true });
	let lastMessageAt = Date.now();
	await reader.run({
		eachMessage: async ({ partition, message }) => {
			lastMessageAt = Date.now();
			reached.set(partition, Number(message.offset) + 1);
			let record: ReturnType<typeof meteringTopic.parse>;
			try {
				record = meteringTopic.parse({
					key: message.key,
					value: message.value,
				});
			} catch (cause) {
				parseErrors.push(
					`${partition}@${message.offset}: ${String(cause)} <- ${String((cause as Error).cause)}`.slice(
						0,
						400,
					),
				);
				return;
			}
			if (record.command.type !== "track" || record.result.type !== "track")
				return;
			const deducted = new Map<string, number>();
			for (const delta of record.result.deltas)
				if (delta.table === "customerEntitlements")
					deducted.set(
						delta.id,
						(deducted.get(delta.id) ?? 0) - delta.balanceDelta,
					);
			records.push({
				id: record.id,
				partition,
				offset: message.offset,
				deducted,
			});
		},
	});
	// The last data record of a partition sits below the stable offset by its transaction marker.
	const done = () =>
		[...targets].every(
			([p, high]) => high === 0 || (reached.get(p) ?? 0) >= high - 1,
		);
	const deadline = Date.now() + 90_000;
	while (
		Date.now() < deadline &&
		!(done() && Date.now() - lastMessageAt > 3_000)
	)
		await Bun.sleep(250);
	const complete = done();
	await reader.disconnect();
	return { records, complete, parseErrors };
}

async function reconcile() {
	const { records, complete, parseErrors } = await readMeteringLog();
	const byId = new Map<string, LogRecord[]>();
	for (const r of records) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
	const outcomeById = new Map(ledger.map((o) => [o.commandId, o.outcome]));
	const succeeded = ledger.filter((o) => o.outcome === "200");
	const duplicated = [...byId].filter(([, rs]) => rs.length > 1);
	const missing = succeeded.filter((o) => !byId.has(o.commandId));
	const unitsOf = (r: LogRecord) =>
		[...r.deducted.values()].reduce((s, v) => s + v, 0);
	const noDeduction = succeeded.filter(
		(o) =>
			(byId.get(o.commandId) ?? []).reduce((s, r) => s + unitsOf(r), 0) !== 1,
	);
	const failedButLogged = ledger.filter(
		(o) => o.outcome !== "200" && byId.has(o.commandId),
	);
	const unknown = [...byId.keys()].filter((id) => !outcomeById.has(id));
	const logDeductedByCe = new Map<string, number>();
	for (const r of records)
		for (const [ce, units] of r.deducted)
			logDeductedByCe.set(ce, (logDeductedByCe.get(ce) ?? 0) + units);

	// The committer lands the log in Postgres in the background; give it time to catch up.
	const all = [...customers.values()];
	let balances = new Map<string, number>();
	const pgDeadline = Date.now() + 120_000;
	for (;;) {
		balances = new Map(
			await Promise.all(
				all.map(
					async (c) =>
						[c.customerEntitlementId, await c.readBalance()] as const,
				),
			),
		);
		const settled = all.every(
			(c) =>
				SEED_BALANCE - (balances.get(c.customerEntitlementId) ?? 0) ===
				(logDeductedByCe.get(c.customerEntitlementId) ?? 0),
		);
		if (settled || Date.now() > pgDeadline) break;
		await Bun.sleep(2_000);
	}
	const perCustomer = all.map((c) => {
		const pgDeducted =
			SEED_BALANCE - (balances.get(c.customerEntitlementId) ?? 0);
		const logDeducted = logDeductedByCe.get(c.customerEntitlementId) ?? 0;
		const clientSucceeded = succeeded.filter(
			(o) => customers.get(o.partition) === c,
		).length;
		return {
			ce: c.customerEntitlementId,
			clientSucceeded,
			logDeducted,
			pgDeducted,
		};
	});
	const logTotal = perCustomer.reduce((s, c) => s + c.logDeducted, 0);
	const pgTotal = perCustomer.reduce((s, c) => s + c.pgDeducted, 0);
	const mismatched = perCustomer.filter((c) => c.logDeducted !== c.pgDeducted);
	const result = {
		logReadComplete: complete,
		logParseErrors: parseErrors.length,
		logParseErrorSamples: parseErrors.slice(0, 3),
		clientSucceeded: succeeded.length,
		clientFailed: ledger.length - succeeded.length,
		logTrackRecords: records.length,
		logCommandIds: byId.size,
		succeededMissingFromLog: missing.length,
		succeededWithoutExactlyOneUnit: noDeduction.length,
		duplicatedCommandIds: duplicated.length,
		failedButDeducted: failedButLogged.length,
		failedButDeductedByOutcome: countBy(failedButLogged, (o) => o.outcome),
		unknownCommandIdsInLog: unknown.length,
		logDeductedTotal: logTotal,
		pgDeductedTotal: pgTotal,
		finalBalanceEqualsStartMinusDeducted: mismatched.length === 0,
		customersMismatched: mismatched,
		samples: {
			missing: missing.slice(0, 5),
			duplicated: duplicated.slice(0, 5),
			unknown: unknown.slice(0, 5),
		},
	};
	const ok =
		complete &&
		missing.length === 0 &&
		noDeduction.length === 0 &&
		duplicated.length === 0 &&
		unknown.length === 0 &&
		mismatched.length === 0 &&
		logTotal === succeeded.length + failedButLogged.length;
	return { ok, ...result };
}

const reconciliation = await reconcile();
mark(`reconciled: ${reconciliation.ok ? "OK" : "MISMATCH"}`);

const summary = {
	label: LABEL,
	config: {
		WORKERS,
		PARTITION_COUNT,
		REPLICATION,
		FAULT,
		TARGET,
		SIGNAL: FAULT === "kill" ? SIGNAL : undefined,
		DOWN_MS: FAULT === "kill" || FAULT === "cut" ? DOWN_MS : undefined,
		CUT_MODE: FAULT === "cut" ? CUT_MODE : undefined,
		STALL:
			FAULT === "stall" ? { STALL_MS, STALL_COUNT, STALL_GAP_MS } : undefined,
		brokers,
	},
	target: targetInfo,
	leadersAfter: Object.fromEntries(leadersAfter),
	marks: marks.map((m) => ({ rel: m.t - faultStart, label: m.label })),
	faultDurationMs: faultCleared - faultStart,
	brokerListeningRelToClearMs:
		brokerListeningAt === undefined
			? undefined
			: brokerListeningAt - faultCleared,
	...clientSummary,
	reconciliation,
};

for (const worker of workers) {
	worker.child.kill("SIGTERM");
	await Promise.race([worker.child.exited, Bun.sleep(30_000)]);
	rmSync(worker.dir, { recursive: true, force: true });
}
await owners.stop();
await watcher.disconnect();
await admin.deleteTopics({ topics: Object.values(topics) });
await admin.disconnect();
for (const customer of [...customers.values(), ...extraCustomers])
	await customer.cleanup();
await postgres.close();
await Bun.write(
	join(OUT_DIR, `${LABEL}.json`),
	JSON.stringify(summary, null, 1),
);
await Bun.write(
	join(OUT_DIR, `${LABEL}.raw.json`),
	JSON.stringify({ summary, ledger, workerEvents, ownershipEvents }),
);
console.error(`summary: ${join(OUT_DIR, `${LABEL}.json`)}`);
process.exit(0);
