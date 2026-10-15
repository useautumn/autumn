/**
 * Chaos against a real balance-worker fleet under steady load, with a balance reconciliation at the end.
 * Workers run as subprocesses of benchWorker.ts (SIGKILL is a real hard kill); this process hammers the
 * routing client (the server's createOwnersFromKafka) at CHAOS_RATE req/s per partition, watches the
 * ownership log, and after the run quiesces reconciles every reported outcome against the metering log
 * (read_committed, from the beginning) and the seeded customers' balances in Postgres.
 *
 *   cd apps/balance-worker
 *   KAFKA_BROKERS=<3 brokers> KAFKA_BIN=<kafka>/bin DATABASE_URL=... NODE_ENV=test \
 *     CHAOS_SCENARIO=kill|bluegreen|auth bun tests/benchmarks/ownership-handoff/chaosWorkers.ts
 *
 * kill       a handoff (a worker joins or one leaves gracefully), then SIGKILL of the predecessor or the
 *            successor at a random handoff phase (preparing / ready / draining / claimed) plus jitter.
 * bluegreen  fleet blue → green through the slot record: green prepares and holds at the gate, flip,
 *            rollback to blue, flip again, blue drains and leaves.
 * auth       workers and the routing client authenticate with SCRAM (CHAOS_SCRAM_BROKERS); mid-run the
 *            user's SCRAM credential is deleted and later restored, then the group ACL is removed and
 *            restored. The harness's own admin, watcher and reconciliation stay on KAFKA_BROKERS.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTrackCommand } from "@autumn/balance-engine";
import {
	BalanceWorkerClientError,
	createBalanceWorkerClient,
	createOwnersFromKafka,
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
	createKafka,
	createKafkaClient,
	createKafkaTransport,
	type Kafka,
	meteringIdentityToPartition,
	ownershipTopic,
	parseTrustedMeteringRecord,
} from "@autumn/kafka";
import { fleetIdOf } from "../../../src/blueGreen/fleetIdOf.js";
import { BALANCE_WORKER_ACTIVE_SLOT_KEY } from "../../../src/edgeConfig/activeSlotEdgeConfig.js";
import { createTestKafka } from "../../fixtures/testKafka.js";
import {
	openFixturePostgres,
	type SeededCustomer,
	seedCustomer,
} from "../../integration/postgres/postgresCustomerFixture.js";

const SCENARIO = process.env.CHAOS_SCENARIO ?? "kill";
const PARTITION_COUNT = Number(process.env.CHAOS_PARTITIONS ?? 16);
const REPLICATION = Number(process.env.CHAOS_RF ?? 2);
const FLEET_SIZE = Number(process.env.CHAOS_WORKERS ?? 4);
const ITERATIONS = Number(process.env.CHAOS_ITERATIONS ?? 20);
const RATE = Number(process.env.CHAOS_RATE ?? 20);
const HAMMER_INTERVAL_MS = 1_000 / RATE;
const STARTING_BALANCE = 1_000_000_000;
const RECOVERY_TIMEOUT_MS = Number(
	process.env.CHAOS_RECOVERY_TIMEOUT_MS ?? 240_000,
);
const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
if (brokers.length === 0) throw new Error("KAFKA_BROKERS is required");
const scramBrokers = (process.env.CHAOS_SCRAM_BROKERS ?? "")
	.split(",")
	.filter(Boolean);
const SCRAM_USER = process.env.CHAOS_SCRAM_USER ?? "bench";
const SCRAM_PASSWORD = process.env.CHAOS_SCRAM_PASSWORD ?? "bench-secret";
if (SCENARIO === "auth" && scramBrokers.length === 0)
	throw new Error("CHAOS_SCENARIO=auth needs CHAOS_SCRAM_BROKERS");
const useScram = scramBrokers.length > 0;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
	throw new Error("DATABASE_URL is required (a migrated Postgres)");
const kafkaBin = process.env.KAFKA_BIN;
if (!kafkaBin)
	throw new Error("KAFKA_BIN is required (Kafka's bin/ directory)");
let seed = Number(process.env.CHAOS_SEED ?? Date.now() % 1_000_000);
const initialSeed = seed;
function random(): number {
	seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
	return seed / 2_147_483_648;
}
function pick<T>(items: readonly T[]): T {
	return items[Math.floor(random() * items.length)] as T;
}

type WorkerEvent = { t: number; worker: string; event: string } & Record<
	string,
	unknown
>;
type OwnershipType =
	| "claimed"
	| "unowned"
	| "released"
	| "ready"
	| "draining"
	| "preparing";
type OwnershipEvent = {
	seenAt: number;
	partition: number;
	offset: string;
	type: OwnershipType;
	endpoint?: string;
	successor?: string;
	at: number;
};
type ClientOutcome = {
	partition: number;
	commandId: string;
	sentAt: number;
	doneAt: number;
	outcome: string;
	/** not_submitted: the client knows it never reached a worker; unknown: it may have been applied. */
	certainty: "ok" | "not_submitted" | "unknown";
	step: string;
};

const workerEvents: WorkerEvent[] = [];
const ownershipEvents: OwnershipEvent[] = [];
const outcomes: ClientOutcome[] = [];
const routingEvents: { t: number; level: string; message: string }[] = [];
const marks: { t: number; label: string }[] = [];
let step = "setup";
function mark(label: string): number {
	const t = Date.now();
	marks.push({ t, label });
	console.error(`[${new Date(t).toISOString()}] ${label}`);
	return t;
}

const deployment = `bench-${crypto.randomUUID().slice(0, 8)}`;
const topics = {
	metering: `${deployment}-events`,
	ownership: `${deployment}-ownership`,
	commands: `${deployment}-commands`,
	catalog: `${deployment}-catalog-invalidations`,
};
const limits = {
	connectionTimeoutMs: 3_000,
	requestTimeoutMs: 10_000,
	retryCount: 2,
	initialRetryTimeMs: 100,
	maxRetryTimeMs: 1_000,
};
/** The harness's own eyes (admin, ownership watcher, reconciliation): plaintext, outside any fault. */
const kafka = createTestKafka({ clientId: deployment, brokers });
/** What the server's routing client uses: SCRAM when the run authenticates. */
const clientKafka: Kafka = useScram
	? createKafka(
			createKafkaClient({
				clientId: `${deployment}-server`,
				brokers: scramBrokers,
				transport: createKafkaTransport({
					authMode: "scram",
					sasl: {
						mechanism: "scram-sha-512",
						username: SCRAM_USER,
						password: SCRAM_PASSWORD,
					},
				}),
				limits,
			}),
		)
	: kafka;
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
	const customer = await seedCustomer({ postgres, balance: STARTING_BALANCE });
	const partition = meteringIdentityToPartition({
		identity: customer.identity,
		partitionCount: PARTITION_COUNT,
	});
	if (customers.has(partition)) extraCustomers.push(customer);
	else customers.set(partition, customer);
}

function recordTimestamp(record: ReturnType<typeof ownershipTopic.parse>) {
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
			successor: record.type === "draining" ? record.successor : undefined,
			at: recordTimestamp(record),
		});
	},
});

/** The server's routing stack: owners rebuilt on failure, production budgets. */
const routingLogger = {
	debug: () => {},
	info: (...args: unknown[]) => logRouting("info", args),
	warn: (...args: unknown[]) => logRouting("warn", args),
	error: (...args: unknown[]) => logRouting("error", args),
};
function logRouting(level: string, args: unknown[]): void {
	const message = args
		.map((a) =>
			typeof a === "string"
				? a
				: JSON.stringify(a, (_, v) =>
						v instanceof Error ? `${v.name}: ${v.message}` : v,
					),
		)
		.join(" ")
		.slice(0, 600);
	routingEvents.push({ t: Date.now(), level, message });
	if (level !== "info") console.error(`[routing ${level}] ${message}`);
}
const routing = createOwnersFromKafka({
	ctx: { kafka: clientKafka, logger: routingLogger },
	config: { topic: topics.ownership, groupIdPrefix: `${deployment}-server` },
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
		timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
		routeRefreshTimeoutMs: BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
	},
});

let inFlight = 0;
async function trackOnce(partition: number): Promise<string> {
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
	const at = step;
	let outcome = "200";
	let certainty: ClientOutcome["certainty"] = "ok";
	inFlight++;
	try {
		await client.track({ command });
	} catch (cause) {
		if (cause instanceof BalanceWorkerClientError) {
			outcome = cause.workerCode
				? `${cause.code}:${cause.workerCode}`
				: cause.code;
			certainty = cause.outcome;
		} else {
			outcome = `THROW:${(cause as Error).name}`;
			certainty = "unknown";
		}
	} finally {
		inFlight--;
	}
	outcomes.push({
		partition,
		commandId: id,
		sentAt,
		doneAt: Date.now(),
		outcome,
		certainty,
		step: at,
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

// --- Workers ------------------------------------------------------------------------------------
type Fleet = { name: string; serviceArn: string; fleetId: string };
function fleetNamed(name: string): Fleet {
	const serviceArn = `arn:aws:ecs:local:0:service/${deployment}/balance-workers-${name}`;
	return { name, serviceArn, fleetId: fleetIdOf({ serviceArn }) };
}
type Worker = {
	name: string;
	endpoint: string;
	child: Bun.Subprocess;
	spawnedAt: number;
	dir: string;
	fleet?: Fleet;
	alive: boolean;
	/** When the harness signalled it or saw it exit. */
	endedAt?: number;
	killedBy?: "SIGKILL" | "SIGTERM";
};
const workers: Worker[] = [];
const workerByEndpoint = new Map<string, Worker>();
const children: Bun.Subprocess[] = [];
process.on("exit", () => {
	for (const child of children) child.kill("SIGKILL");
});
const subjectSnapshotsConfig = {
	...defaultSubjectSnapshotsEdgeConfig(),
	mode: "off" as const,
};
const edgeConfigOverride = Buffer.from(
	JSON.stringify({
		[BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY]: subjectSnapshotsConfig,
	}),
).toString("base64");
const edgeConfigDir =
	SCENARIO === "bluegreen"
		? mkdtempSync(join(tmpdir(), `bench-edge-${deployment}-`))
		: undefined;
if (edgeConfigDir) {
	const path = join(edgeConfigDir, BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY);
	mkdirSync(join(path, ".."), { recursive: true });
	await Bun.write(path, JSON.stringify(subjectSnapshotsConfig));
}
async function writeSlotRecord(fleet: Fleet, reason: string): Promise<number> {
	if (!edgeConfigDir) throw new Error("Slot records need bluegreen");
	const path = join(edgeConfigDir, BALANCE_WORKER_ACTIVE_SLOT_KEY);
	mkdirSync(join(path, ".."), { recursive: true });
	const writtenAt = Date.now();
	await Bun.write(
		path,
		JSON.stringify({
			activeTaskDefinitionArn: null,
			activeImageSha: null,
			flightcontrolBlueArn: fleet.serviceArn,
			updatedAt: new Date(writtenAt).toISOString(),
			updatedBy: "chaos benchmark",
			reason,
		}),
	);
	return writtenAt;
}
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
let workerSerial = 0;
async function spawnWorker(fleet?: Fleet): Promise<Worker> {
	const name = `${fleet ? `${fleet.name}-` : "W"}${++workerSerial}`;
	const port = await reservePort();
	const dir = mkdtempSync(join(tmpdir(), `bench-${name}-`));
	const env = {
		...createBalanceWorkerEnv({
			DATABASE_URL: databaseUrl,
			KAFKA_BROKERS: (useScram ? scramBrokers : brokers).join(","),
			KAFKA_AUTH_MODE: useScram ? "scram" : "none",
			...(useScram && {
				KAFKA_SASL_MECHANISM: "scram-sha-512",
				KAFKA_SASL_USERNAME_BALANCE_WORKER: SCRAM_USER,
				KAFKA_SASL_PASSWORD_BALANCE_WORKER: SCRAM_PASSWORD,
			}),
			BALANCE_WORKER_HOST: "127.0.0.1",
			BALANCE_WORKER_PORT: String(port),
			BALANCE_WORKER_SQLITE_PATH: join(dir, "state.sqlite"),
			BALANCE_WORKER_DEPLOYMENT: deployment,
			BALANCE_WORKER_PARTITION_COUNT: String(PARTITION_COUNT),
		}),
		BENCH_NAME: name,
		BENCH_BACKEND: "postgres",
		...(fleet && {
			BENCH_SERVICE_ARN: fleet.serviceArn,
			BENCH_EDGE_CONFIG_DIR: edgeConfigDir,
		}),
	};
	const {
		AUTUMN_EDGE_CONFIG_OVERRIDE_B64: _,
		LIBRDKAFKA_DEBUG: __,
		...inherited
	} = process.env;
	const child = Bun.spawn(
		["bun", new URL("./benchWorker.ts", import.meta.url).pathname],
		{
			env: {
				...inherited,
				NODE_ENV: "test",
				...(fleet
					? {}
					: { AUTUMN_EDGE_CONFIG_OVERRIDE_B64: edgeConfigOverride }),
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
		fleet,
		alive: true,
	};
	children.push(child);
	workers.push(worker);
	workerByEndpoint.set(worker.endpoint, worker);
	void child.exited.then((exitCode) => {
		worker.alive = false;
		worker.endedAt ??= Date.now();
		workerEvents.push({
			t: Date.now(),
			worker: name,
			event: "worker.exited",
			exitCode,
			signalCode: child.signalCode,
			step,
		});
	});
	void pumpLines(child.stdout as ReadableStream<Uint8Array>, (line) =>
		onWorkerLine(worker, line),
	);
	void pumpLines(child.stderr as ReadableStream<Uint8Array>, (line) => {
		if (/panic|Segmentation|SIGSEGV|uncaught|Unhandled/i.test(line))
			workerEvents.push({
				t: Date.now(),
				worker: name,
				event: "worker.stderr",
				line: line.slice(0, 500),
			});
	});
	mark(`spawned ${name}${fleet ? ` (fleet ${fleet.name})` : ""}`);
	return worker;
}
async function pumpLines(
	stream: ReadableStream<Uint8Array>,
	onLine: (line: string) => void,
): Promise<void> {
	let buffered = "";
	const decoder = new TextDecoder();
	for await (const chunk of stream) {
		buffered += decoder.decode(chunk, { stream: true });
		const lines = buffered.split("\n");
		buffered = lines.pop() ?? "";
		for (const line of lines) if (line) onLine(line);
	}
}
function onWorkerLine(worker: Worker, line: string): void {
	// biome-ignore lint/suspicious/noExplicitAny: worker lines are either events or kafka log lines
	let parsed: any;
	try {
		parsed = JSON.parse(line);
	} catch {
		return;
	}
	if (typeof parsed.message === "string") {
		if (parsed.level === "WARN" || parsed.level === "ERROR")
			workerEvents.push({
				t: Date.now(),
				worker: worker.name,
				event: `kafka.${parsed.level.toLowerCase()}`,
				message: String(parsed.message).slice(0, 400),
			});
		return;
	}
	if (!("event" in parsed)) return;
	workerEvents.push({ ...parsed, step });
	if (
		/^(log\.error|error|unhealthy|consumer\.crash|service\.stopped)/.test(
			parsed.event,
		)
	)
		console.error(`[${worker.name}] ${line.slice(0, 700)}`);
	// main.ts exits once the partition service stops, and ECS replaces the task: do the same.
	if (parsed.event === "service.stopped" && worker.alive) {
		mark(
			`${worker.name} stopped its partition service; exiting it like main.ts`,
		);
		void stopWorker(worker, "SIGKILL");
	}
}
async function stopWorker(
	worker: Worker,
	signal: "SIGKILL" | "SIGTERM",
): Promise<void> {
	if (!worker.alive) return;
	worker.killedBy ??= signal;
	if (signal === "SIGKILL") {
		worker.alive = false;
		worker.endedAt = Date.now();
	}
	worker.child.kill(signal);
	await worker.child.exited;
	rmSync(worker.dir, { recursive: true, force: true });
}
function liveWorkers(fleet?: Fleet): Worker[] {
	return workers.filter(
		(w) => w.alive && !w.killedBy && (!fleet || w.fleet?.name === fleet.name),
	);
}

async function waitFor(
	condition: () => boolean,
	timeoutMs: number,
	what: string,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) {
			mark(`TIMEOUT waiting for ${what}`);
			return false;
		}
		await Bun.sleep(25);
	}
	return true;
}

// --- Ownership views --------------------------------------------------------------------------------
/** The owner table the routing client would build from the log, as of now. */
function currentOwners(): Map<number, string | undefined> {
	const owners = new Map<number, string | undefined>();
	for (const e of ownershipEvents) {
		if (e.type === "claimed") owners.set(e.partition, e.endpoint);
		else if (e.type === "unowned" || e.type === "released") {
			if (!e.endpoint || owners.get(e.partition) === e.endpoint)
				owners.set(e.partition, undefined);
		}
	}
	return owners;
}
function lastClaimSeenAt(partition: number): number {
	for (let i = ownershipEvents.length - 1; i >= 0; i--) {
		const e = ownershipEvents[i];
		if (e?.partition === partition && e.type === "claimed") return e.seenAt;
	}
	return 0;
}
/** Every partition's latest claim names a worker that is alive (and, if given, one of these). */
function everyPartitionOwned(by?: Worker[]): boolean {
	const owners = currentOwners();
	for (const partition of customers.keys()) {
		const endpoint = owners.get(partition);
		const worker = endpoint ? workerByEndpoint.get(endpoint) : undefined;
		if (!worker?.alive || worker.killedBy) return false;
		if (by && !by.includes(worker)) return false;
	}
	return true;
}
/** Fault over: every partition owned by a live worker, and every partition's last few requests served. */
function recovered(since: number, by?: Worker[]): boolean {
	if (!everyPartitionOwned(by)) return false;
	const now = Date.now();
	for (const partition of customers.keys()) {
		const recent = outcomes.filter(
			(o) => o.partition === partition && o.sentAt >= since,
		);
		const lastFive = recent.slice(-5);
		if (lastFive.length < 5 || lastFive.some((o) => o.outcome !== "200"))
			return false;
		if (now - (lastFive[0]?.sentAt ?? 0) > 3_000) return false;
	}
	return true;
}
type StepReport = {
	step: string;
	t0: number;
	tEnd: number;
	faultClearedAt: number;
	recovered: boolean;
	recoveryMs: number | null;
	allOwnedAfterMs: number | null;
	lastFailureAfterMs: number | null;
	requests: number;
	failed: number;
	outcomes: Record<string, number>;
	crashes: { worker: string; restart: unknown; error: string }[];
	groupJoins: number;
	rebalances: number;
	prepares: number;
	routingRebuilds: number;
	notes: Record<string, unknown>;
};
const stepReports: StepReport[] = [];
function countBy<T>(items: T[], key: (item: T) => string) {
	const out: Record<string, number> = {};
	for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
	return out;
}
function closeStep({
	t0,
	faultClearedAt,
	isRecovered,
	notes = {},
}: {
	t0: number;
	faultClearedAt: number;
	isRecovered: boolean;
	notes?: Record<string, unknown>;
}): StepReport {
	const tEnd = Date.now();
	const mine = outcomes.filter((o) => o.step === step);
	const failures = mine.filter((o) => o.outcome !== "200");
	const lastFailure = failures
		.filter((o) => o.doneAt >= faultClearedAt)
		.reduce((max, o) => Math.max(max, o.doneAt), 0);
	const allOwnedAt = Math.max(
		faultClearedAt,
		...[...customers.keys()].map(lastClaimSeenAt),
	);
	const events = workerEvents.filter((e) => e.t >= t0 && e.t <= tEnd);
	const report: StepReport = {
		step,
		t0,
		tEnd,
		faultClearedAt,
		recovered: isRecovered,
		recoveryMs: isRecovered
			? Math.max(lastFailure, allOwnedAt) - faultClearedAt
			: null,
		allOwnedAfterMs: isRecovered ? allOwnedAt - faultClearedAt : null,
		lastFailureAfterMs: lastFailure ? lastFailure - faultClearedAt : null,
		requests: mine.length,
		failed: failures.length,
		outcomes: countBy(mine, (o) => o.outcome),
		crashes: events
			.filter((e) => e.event === "consumer.crash")
			.map((e) => ({
				worker: e.worker,
				restart: e.restart,
				error: JSON.stringify(e.error).slice(0, 200),
			})),
		groupJoins: events.filter((e) => e.event === "consumer.group_join").length,
		rebalances: events.filter((e) => e.event === "consumer.rebalancing").length,
		prepares: events.filter((e) => e.event === "runtime.prepare").length,
		routingRebuilds: routingEvents.filter(
			(e) => e.t >= t0 && e.t <= tEnd && /rebuilding/.test(e.message),
		).length,
		notes,
	};
	stepReports.push(report);
	console.error(
		`[${step}] ${report.failed}/${report.requests} failed ${JSON.stringify(report.outcomes)} recovered=${report.recovered} recoveryMs=${report.recoveryMs} crashes=${report.crashes.length} joins=${report.groupJoins} prepares=${report.prepares}`,
	);
	return report;
}

// --- Scenarios --------------------------------------------------------------------------------------
async function bootFleet(count: number, fleet?: Fleet): Promise<void> {
	for (let i = 0; i < count; i++) await spawnWorker(fleet);
	const ok = await waitFor(
		() =>
			everyPartitionOwned(liveWorkers(fleet)) &&
			Date.now() - Math.max(0, ...ownershipEvents.map((e) => e.seenAt)) > 6_000,
		240_000,
		"fleet to own everything",
	);
	if (!ok) throw new Error("fleet never owned every partition");
	for (const partition of customers.keys()) {
		let outcome = "";
		for (let attempt = 0; attempt < 40 && outcome !== "200"; attempt++) {
			outcome = await trackOnce(partition);
			if (outcome !== "200") await Bun.sleep(250);
		}
		if (outcome !== "200")
			throw new Error(`partition ${partition} never served: ${outcome}`);
	}
}

/** Waits for the fleet to settle back to FLEET_SIZE live workers owning everything and serving. */
async function restoreFleet(): Promise<void> {
	step = "restore";
	while (liveWorkers().length < FLEET_SIZE) await spawnWorker();
	const t0 = Date.now();
	await waitFor(
		() =>
			recovered(t0, liveWorkers()) &&
			workerEvents
				.filter((e) => e.event === "consumer.group_join")
				.every((e) => Date.now() - e.t > 6_000) &&
			Date.now() - Math.max(0, ...ownershipEvents.map((e) => e.seenAt)) > 6_000,
		RECOVERY_TIMEOUT_MS,
		"fleet to settle",
	);
}

type KillPhase = "preparing" | "ready" | "draining" | "claimed";
async function runKillScenario(): Promise<void> {
	step = "boot";
	await bootFleet(FLEET_SIZE);
	step = "baseline";
	startHammer();
	await Bun.sleep(10_000);
	for (let iteration = 1; iteration <= ITERATIONS; iteration++) {
		const mode = pick(["join", "leave"] as const);
		const phase = pick([
			"preparing",
			"ready",
			"draining",
			"claimed",
		] as const satisfies readonly KillPhase[]);
		const victimRole = pick(["predecessor", "successor"] as const);
		const jitterMs = Math.floor(random() * 300);
		step = `kill#${iteration}`;
		const t0 = mark(
			`${step}: ${mode}, SIGKILL ${victimRole} at ${phase}+${jitterMs}ms`,
		);
		const ownersBefore = currentOwners();
		const before = ownershipEvents.length;
		let leaver: Worker | undefined;
		let joiner: Worker | undefined;
		if (mode === "join") joiner = await spawnWorker();
		else {
			leaver = pick(liveWorkers());
			leaver.killedBy = "SIGTERM";
			leaver.child.kill("SIGTERM");
			mark(`SIGTERM ${leaver.name}`);
		}
		// The handoff record that marks the phase, for a partition this handoff moves.
		let hit: OwnershipEvent | undefined;
		const observed = await waitFor(
			() => {
				for (let i = before; i < ownershipEvents.length; i++) {
					const e = ownershipEvents[i];
					if (!e || e.type !== phase) continue;
					const successorEndpoint =
						e.type === "draining" ? e.successor : e.endpoint;
					const predecessorEndpoint = ownersBefore.get(e.partition);
					if (joiner && successorEndpoint !== joiner.endpoint) continue;
					if (leaver && predecessorEndpoint !== leaver.endpoint) continue;
					hit = e;
					return true;
				}
				return false;
			},
			60_000,
			`${phase} record`,
		);
		if (jitterMs) await Bun.sleep(jitterMs);
		let victim: Worker | undefined;
		if (hit) {
			const successorEndpoint =
				hit.type === "draining" ? hit.successor : hit.endpoint;
			const predecessorEndpoint = ownersBefore.get(hit.partition);
			victim = workerByEndpoint.get(
				(victimRole === "successor"
					? successorEndpoint
					: predecessorEndpoint) ?? "",
			);
		} else victim = victimRole === "successor" ? joiner : leaver;
		if (!victim) victim = joiner ?? leaver ?? pick(liveWorkers());
		const victimWasAlive = victim.alive;
		const killedAt = mark(
			`SIGKILL ${victim.name} (${victimRole}, p${hit?.partition ?? "?"} ${phase} ${hit ? "observed" : "NOT observed"}, alive=${victimWasAlive})`,
		);
		victim.killedBy = "SIGKILL";
		victim.alive = false;
		victim.endedAt = killedAt;
		victim.child.kill("SIGKILL");
		const isRecovered = await waitFor(
			() => recovered(killedAt, liveWorkers()),
			RECOVERY_TIMEOUT_MS,
			`${step} recovery`,
		);
		closeStep({
			t0,
			faultClearedAt: killedAt,
			isRecovered,
			notes: {
				mode,
				phase,
				victimRole,
				jitterMs,
				phaseObserved: observed,
				partition: hit?.partition,
				victim: victim.name,
				victimWasAlive,
				leaver: leaver?.name,
				joiner: joiner?.name,
				live: liveWorkers().map((w) => w.name),
			},
		});
		if (!isRecovered) {
			mark(
				`${step} did not recover; owners ${JSON.stringify([...currentOwners()])}`,
			);
			break;
		}
		await restoreFleet();
	}
}

async function runBlueGreenScenario(): Promise<void> {
	const blue = fleetNamed("blue");
	const green = fleetNamed("green");
	await writeSlotRecord(blue, "blue is live");
	step = "boot";
	await bootFleet(FLEET_SIZE, blue);
	step = "baseline";
	startHammer();
	await Bun.sleep(10_000);
	const blueWorkers = liveWorkers(blue);

	step = "green-prepares";
	let t0 = mark("spawning green; it prepares and holds at the slot gate");
	for (let i = 0; i < FLEET_SIZE; i++) await spawnWorker(green);
	const greenWorkers = liveWorkers(green);
	const prepared = await waitFor(
		() => {
			const held = new Set(
				workerEvents
					.filter(
						(e) =>
							e.event === "slot.hold" &&
							greenWorkers.some((w) => w.name === e.worker),
					)
					.map((e) => e.partition),
			);
			return held.size === PARTITION_COUNT;
		},
		180_000,
		"green to hold every partition at the gate",
	);
	await Bun.sleep(10_000);
	closeStep({
		t0,
		faultClearedAt: t0,
		isRecovered: prepared && everyPartitionOwned(blueWorkers),
		notes: {
			greenHolds: workerEvents.filter((e) => e.event === "slot.hold").length,
			ownedByBlue: everyPartitionOwned(blueWorkers),
		},
	});

	for (const [label, to, by] of [
		["flip-to-green", green, greenWorkers],
		["rollback-to-blue", blue, blueWorkers],
		["flip-to-green-again", green, greenWorkers],
	] as const) {
		step = label;
		t0 = await writeSlotRecord(to, label);
		mark(`slot record -> ${to.name}`);
		const ok = await waitFor(
			() =>
				recovered(t0, [...by]) &&
				Date.now() - Math.max(0, ...ownershipEvents.map((e) => e.seenAt)) >
					5_000,
			RECOVERY_TIMEOUT_MS,
			`${label} to finish`,
		);
		closeStep({ t0, faultClearedAt: t0, isRecovered: ok });
		await Bun.sleep(5_000);
	}

	step = "blue-leaves";
	t0 = mark("SIGTERM every blue worker");
	for (const worker of blueWorkers) {
		worker.killedBy = "SIGTERM";
		worker.child.kill("SIGTERM");
	}
	await Promise.all(blueWorkers.map((w) => w.child.exited));
	const ok = await waitFor(
		() => recovered(t0, greenWorkers),
		60_000,
		"green to keep serving",
	);
	await Bun.sleep(10_000);
	closeStep({ t0, faultClearedAt: t0, isRecovered: ok });
}

function kafkaCli(tool: string, args: string[]): string {
	const result = Bun.spawnSync(
		[
			join(kafkaBin as string, tool),
			"--bootstrap-server",
			brokers[0] as string,
			...args,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const out = `${result.stdout.toString()}${result.stderr.toString()}`.trim();
	if (result.exitCode !== 0) throw new Error(`${tool} failed: ${out}`);
	return out;
}
function setScramCredential(present: boolean): void {
	kafkaCli("kafka-configs.sh", [
		"--alter",
		...(present
			? [
					"--add-config",
					`SCRAM-SHA-512=[iterations=4096,password=${SCRAM_PASSWORD}]`,
				]
			: ["--delete-config", "SCRAM-SHA-512"]),
		"--entity-type",
		"users",
		"--entity-name",
		SCRAM_USER,
	]);
}
function setGroupAcl(present: boolean): void {
	kafkaCli("kafka-acls.sh", [
		present ? "--add" : "--remove",
		...(present ? [] : ["--force"]),
		"--allow-principal",
		`User:${SCRAM_USER}`,
		"--operation",
		"All",
		"--group",
		"*",
	]);
}

async function runAuthScenario(): Promise<void> {
	const HOLD_MS = Number(process.env.CHAOS_AUTH_HOLD_MS ?? 60_000);
	step = "boot";
	await bootFleet(FLEET_SIZE);
	step = "baseline";
	startHammer();
	let t0 = Date.now();
	await Bun.sleep(15_000);
	closeStep({ t0, faultClearedAt: t0, isRecovered: recovered(t0) });

	const faults = (process.env.CHAOS_AUTH_FAULTS ?? "scram,acl").split(",");
	for (const fault of faults) {
		step = `${fault}-revoked`;
		t0 = mark(`${fault}: revoking`);
		if (fault === "scram") setScramCredential(false);
		else setGroupAcl(false);
		await Bun.sleep(HOLD_MS);
		const workersDuring = liveWorkers().map((w) => w.name);
		closeStep({
			t0,
			faultClearedAt: Date.now(),
			isRecovered: false,
			notes: { workersAlive: workersDuring },
		});
		step = `${fault}-restored`;
		const restoredAt = mark(`${fault}: restoring`);
		if (fault === "scram") setScramCredential(true);
		else setGroupAcl(true);
		// ECS keeps the fleet at size: a worker that exited is replaced.
		const replacing = setInterval(() => {
			if (liveWorkers().length < FLEET_SIZE) void spawnWorker();
		}, 5_000);
		const ok = await waitFor(
			() =>
				recovered(restoredAt, liveWorkers()) &&
				liveWorkers().every((w) =>
					[...currentOwners().values()].includes(w.endpoint),
				),
			RECOVERY_TIMEOUT_MS,
			`${fault} recovery`,
		);
		clearInterval(replacing);
		const owners = currentOwners();
		closeStep({
			t0: restoredAt,
			faultClearedAt: restoredAt,
			isRecovered: ok,
			notes: {
				workersOwningNothing: liveWorkers()
					.filter((w) => ![...owners.values()].includes(w.endpoint))
					.map((w) => w.name),
				refusals: workerEvents.filter(
					(e) =>
						e.t >= t0 &&
						e.event === "log.warn" &&
						JSON.stringify(e.args).includes("consumer_refused"),
				).length,
				exits: workerEvents.filter(
					(e) => e.t >= t0 && e.event === "worker.exited",
				).length,
			},
		});
		await Bun.sleep(10_000);
	}
}

// --- Reconciliation -------------------------------------------------------------------------------
type LogDeduction = {
	partition: number;
	offset: string;
	commandId: string;
	customerId: string;
	before: number;
	after: number;
	deducted: number;
};
let meteringReadComplete = false;
let meteringParseFailures = 0;
let meteringFenceRecords = 0;
async function readMeteringLog(): Promise<LogDeduction[]> {
	const records: LogDeduction[] = [];
	const reader = kafka.consumer({
		groupId: `${deployment}-reconcile`,
		readUncommitted: false,
	});
	reader.on(reader.events.CRASH, (event) =>
		console.error(`reconcile reader crashed: ${event.payload.error}`),
	);
	await reader.connect();
	await reader.subscribe({ topics: [topics.metering], fromBeginning: true });
	let lastAt = Date.now();
	meteringReadComplete = false;
	await reader.run({
		eachMessage: async ({ partition, message }) => {
			lastAt = Date.now();
			let record: ReturnType<typeof parseTrustedMeteringRecord>;
			try {
				record = parseTrustedMeteringRecord({
					key: message.key,
					value: message.value,
				});
			} catch (cause) {
				if (message.value?.toString().includes('"type":"owner_fence"')) {
					meteringFenceRecords++;
					return;
				}
				meteringParseFailures++;
				if (meteringParseFailures <= 3)
					console.error(
						`unparseable metering record ${partition}@${message.offset}: ${cause} ${message.value?.toString().slice(0, 300)}`,
					);
				return;
			}
			const command = record.command as { commandId?: string; type?: string };
			const result = record.result as {
				type: string;
				deltas?: { balanceDelta: number }[];
			};
			records.push({
				partition,
				offset: message.offset,
				commandId: command.commandId ?? record.id,
				customerId: record.identity.customerId,
				before: record.revision.before,
				after: record.revision.after,
				deducted:
					result.type === "track"
						? -(result.deltas ?? []).reduce((s, d) => s + d.balanceDelta, 0)
						: 0,
			});
		},
	});
	// Done once every partition's records reach its end (the last offset may be a commit marker), or the
	// log has been quiet for 20s after the first record; a reader that never reached the end is reported.
	const ends = await admin.fetchTopicOffsets(topics.metering);
	const deadline = Date.now() + 300_000;
	while (Date.now() < deadline) {
		await Bun.sleep(1_000);
		const atEnd = ends.every((end) => {
			const high = Number(end.high);
			const seen = records
				.filter((r) => r.partition === end.partition)
				.reduce((max, r) => Math.max(max, Number(r.offset)), -1);
			return high === 0 || seen >= high - 2;
		});
		meteringReadComplete = atEnd;
		if (atEnd) break;
		if (records.length > 0 && Date.now() - lastAt > 20_000) break;
	}
	await reader.disconnect();
	return records.sort((a, b) =>
		a.partition === b.partition
			? Number(a.offset) - Number(b.offset)
			: a.partition - b.partition,
	);
}

async function reconcile() {
	const log = await readMeteringLog();
	const byCommand = new Map<string, LogDeduction[]>();
	for (const r of log)
		byCommand.set(r.commandId, [...(byCommand.get(r.commandId) ?? []), r]);
	const duplicated = [...byCommand.entries()]
		.filter(([, rs]) => rs.length > 1)
		.map(([id, rs]) => ({
			id,
			offsets: rs.map((r) => `${r.partition}@${r.offset}`),
		}));
	const okMissing = outcomes.filter(
		(o) => o.outcome === "200" && !byCommand.has(o.commandId),
	);
	const rejectedButApplied = outcomes.filter(
		(o) => o.certainty === "not_submitted" && byCommand.has(o.commandId),
	);
	const unknownApplied = outcomes.filter(
		(o) => o.certainty === "unknown" && byCommand.has(o.commandId),
	).length;
	const known = new Set(outcomes.map((o) => o.commandId));
	const unattributed = log.filter((r) => !known.has(r.commandId)).length;
	const perCustomer: {
		partition: number;
		logDeducted: number;
		postgresDeducted: number;
		ok200: number;
		revisionBreaks: number;
		postgresNextOffset: string | null;
	}[] = [];
	const offsets = await admin.fetchTopicOffsets(topics.metering);
	for (const [partition, customer] of customers) {
		const mine = log.filter(
			(r) => r.customerId === customer.identity.customerId,
		);
		let revisionBreaks = 0;
		for (let i = 1; i < mine.length; i++)
			if (mine[i]?.before !== mine[i - 1]?.after) revisionBreaks++;
		perCustomer.push({
			partition,
			logDeducted: mine.reduce((s, r) => s + r.deducted, 0),
			postgresDeducted: STARTING_BALANCE - (await customer.readBalance()),
			ok200: outcomes.filter(
				(o) => o.partition === partition && o.outcome === "200",
			).length,
			revisionBreaks,
			postgresNextOffset: String(
				await customer.readNextOffset({ topic: topics.metering, partition }),
			),
		});
	}
	const logTotal = perCustomer.reduce((s, c) => s + c.logDeducted, 0);
	const pgTotal = perCustomer.reduce((s, c) => s + c.postgresDeducted, 0);
	return {
		logRecords: log.length,
		meteringReadComplete,
		meteringParseFailures,
		meteringFenceRecords,
		distinctCommands: byCommand.size,
		duplicatedCommandIds: duplicated.length,
		duplicatedSample: duplicated.slice(0, 5),
		ok200: outcomes.filter((o) => o.outcome === "200").length,
		ok200MissingFromLog: okMissing.length,
		ok200MissingSample: okMissing.slice(0, 5),
		notSubmittedButApplied: rejectedButApplied.length,
		notSubmittedButAppliedSample: rejectedButApplied.slice(0, 5),
		unknownOutcomeApplied: unknownApplied,
		unknownOutcomeTotal: outcomes.filter((o) => o.certainty === "unknown")
			.length,
		logRecordsWithoutClientOutcome: unattributed,
		logDeductedTotal: logTotal,
		postgresDeductedTotal: pgTotal,
		balanceMatches: perCustomer.every(
			(c) => c.logDeducted === c.postgresDeducted,
		),
		revisionBreaks: perCustomer.reduce((s, c) => s + c.revisionBreaks, 0),
		logEnd: offsets.map((o) => `${o.partition}:${o.high}`),
		perCustomer,
	};
}

/** Admitted owners per partition from the workers' own events: activated → withdrawn or dead. */
function ownershipOverlaps() {
	type Interval = { worker: string; from: number; to: number };
	const intervals = new Map<number, Interval[]>();
	const open = new Map<string, number>();
	for (const e of workerEvents) {
		const partition = e.partition as number | undefined;
		if (partition === undefined) continue;
		const key = `${e.worker}:${partition}`;
		if (e.event === "runtime.started" && e.status === "ready")
			open.set(key, e.t);
		if (e.event === "withdraw" && open.has(key)) {
			intervals.set(partition, [
				...(intervals.get(partition) ?? []),
				{ worker: e.worker, from: open.get(key) as number, to: e.t },
			]);
			open.delete(key);
		}
	}
	for (const [key, from] of open) {
		const [name, partition] = key.split(":");
		const worker = workers.find((w) => w.name === name);
		intervals.set(Number(partition), [
			...(intervals.get(Number(partition)) ?? []),
			{ worker: name as string, from, to: worker?.endedAt ?? Date.now() },
		]);
	}
	const overlaps: {
		partition: number;
		a: Interval;
		b: Interval;
		ms: number;
	}[] = [];
	for (const [partition, list] of intervals) {
		list.sort((x, y) => x.from - y.from);
		for (let i = 0; i < list.length; i++)
			for (let j = i + 1; j < list.length; j++) {
				const a = list[i] as Interval;
				const b = list[j] as Interval;
				if (a.worker === b.worker) continue;
				const ms = Math.min(a.to, b.to) - Math.max(a.from, b.from);
				if (ms > 0) overlaps.push({ partition, a, b, ms });
			}
	}
	return overlaps;
}

/** Every change of owner on the log must be a handoff (draining{old→new}), a release, or a takeover from a
 *  worker that was already dead; a claim by a worker after it died is a zombie. */
function claimAudit() {
	const byPartition = new Map<number, OwnershipEvent[]>();
	for (const e of ownershipEvents)
		byPartition.set(e.partition, [...(byPartition.get(e.partition) ?? []), e]);
	const counts = {
		handoff: 0,
		afterRelease: 0,
		takeoverFromDead: 0,
		first: 0,
		same: 0,
	};
	const violations: unknown[] = [];
	for (const [partition, list] of byPartition) {
		list.sort((a, b) => Number(a.offset) - Number(b.offset));
		let owner: string | undefined;
		let released = false;
		const drainingTo = new Set<string>();
		for (const e of list) {
			const author = e.endpoint ? workerByEndpoint.get(e.endpoint) : undefined;
			if (
				author?.endedAt &&
				e.at > author.endedAt + 50 &&
				author.killedBy === "SIGKILL"
			)
				violations.push({
					kind: "record-after-death",
					partition,
					record: e,
					worker: author.name,
				});
			if (e.type === "draining" && e.endpoint === owner && e.successor)
				drainingTo.add(e.successor);
			if (
				(e.type === "released" || e.type === "unowned") &&
				(!e.endpoint || e.endpoint === owner)
			)
				released = true;
			if (e.type !== "claimed") continue;
			if (!owner) counts.first++;
			else if (owner === e.endpoint) counts.same++;
			else if (e.endpoint && drainingTo.has(e.endpoint)) counts.handoff++;
			else if (released) counts.afterRelease++;
			else {
				const previous = workerByEndpoint.get(owner);
				if (previous?.endedAt && previous.endedAt <= e.at)
					counts.takeoverFromDead++;
				else
					violations.push({
						kind: "claim-over-live-owner",
						partition,
						record: e,
						previous: previous?.name,
						claimant: author?.name,
					});
			}
			owner = e.endpoint;
			released = false;
			drainingTo.clear();
		}
	}
	return {
		counts,
		violations: violations.length,
		sample: violations.slice(0, 10),
	};
}

// --- Run --------------------------------------------------------------------------------------------
let scenarioError: unknown;
try {
	if (SCENARIO === "kill") await runKillScenario();
	else if (SCENARIO === "bluegreen") await runBlueGreenScenario();
	else if (SCENARIO === "auth") await runAuthScenario();
	else throw new Error(`Unknown CHAOS_SCENARIO ${SCENARIO}`);
} catch (cause) {
	scenarioError = cause;
	mark(`scenario failed: ${(cause as Error).stack ?? cause}`);
}
step = "quiesce";
hammering = false;
await waitFor(() => inFlight === 0, 30_000, "requests in flight");
mark("quiescing: SIGTERM the fleet so committers flush");
const live = workers.filter((w) => w.alive);
for (const worker of live) {
	worker.killedBy ??= "SIGTERM";
	worker.child.kill("SIGTERM");
}
await Promise.race([
	Promise.all(live.map((w) => w.child.exited)),
	Bun.sleep(90_000),
]);
for (const worker of workers) if (worker.alive) worker.child.kill("SIGKILL");
// A hard-killed owner's last rows reach Postgres only through a successor's replay: one more worker
// owning everything replays the log tail, then stops gracefully.
mark("catch-up worker replays the log tail into Postgres");
step = "catch-up";
if (edgeConfigDir) rmSync(edgeConfigDir, { recursive: true, force: true });
const catchUp = await spawnWorker();
await waitFor(
	() => everyPartitionOwned([catchUp]),
	180_000,
	"catch-up worker to own everything",
);
await Bun.sleep(5_000);
catchUp.killedBy = "SIGTERM";
catchUp.child.kill("SIGTERM");
await Promise.race([catchUp.child.exited, Bun.sleep(60_000)]);
mark("reconciling");
const reconciliation = await reconcile();
const overlaps = ownershipOverlaps();
const allOutcomes = outcomes.filter((o) => o.step !== "boot");
const summary = {
	scenario: SCENARIO,
	seed: initialSeed,
	deployment,
	config: {
		PARTITION_COUNT,
		REPLICATION,
		FLEET_SIZE,
		RATE,
		ITERATIONS,
		useScram,
	},
	error: scenarioError
		? String((scenarioError as Error).stack ?? scenarioError)
		: null,
	totals: {
		requests: allOutcomes.length,
		failed: allOutcomes.filter((o) => o.outcome !== "200").length,
		outcomes: countBy(allOutcomes, (o) => o.outcome),
		crashes: workerEvents
			.filter((e) => e.event === "consumer.crash")
			.map((e) => ({
				worker: e.worker,
				step: e.step,
				restart: e.restart,
				error: JSON.stringify(e.error).slice(0, 300),
			})),
		groupJoins: workerEvents.filter((e) => e.event === "consumer.group_join")
			.length,
		rebalances: workerEvents.filter((e) => e.event === "consumer.rebalancing")
			.length,
		prepares: workerEvents.filter((e) => e.event === "runtime.prepare").length,
		serviceStops: workerEvents.filter((e) => e.event === "service.stopped")
			.length,
		unexpectedExits: workerEvents.filter(
			(e) =>
				e.event === "worker.exited" &&
				!workers.find((w) => w.name === e.worker)?.killedBy,
		).length,
		routingRebuilds: routingEvents.filter((e) => /rebuilding/.test(e.message))
			.length,
		routingErrors: countBy(
			routingEvents.filter((e) => e.level !== "info"),
			(e) => e.message.slice(0, 120),
		),
		workerErrors: countBy(
			workerEvents.filter((e) =>
				/^(log\.error|error|unhealthy|worker\.stderr)$/.test(e.event),
			),
			(e) =>
				`${e.event}:${JSON.stringify(e.cause ?? e.args ?? e.line).slice(0, 160)}`,
		),
	},
	ownershipOverlaps: { count: overlaps.length, sample: overlaps.slice(0, 10) },
	claimAudit: claimAudit(),
	steps: stepReports,
	reconciliation,
	marks: marks.map((m) => ({ ...m, iso: new Date(m.t).toISOString() })),
};
const out = join(
	process.env.BENCH_OUT_DIR ?? tmpdir(),
	`chaos-${SCENARIO}-${deployment}.json`,
);
await Bun.write(
	out,
	JSON.stringify(
		{ summary, workerEvents, ownershipEvents, routingEvents },
		null,
		1,
	),
);
console.error(`raw data: ${out}`);
console.log(JSON.stringify(summary, null, 1));
await routing.stop();
await watcher.disconnect();
await admin.deleteTopics({ topics: Object.values(topics) });
await admin.disconnect();
for (const customer of [...customers.values(), ...extraCustomers])
	await customer.cleanup();
await postgres.close();
process.exit(0);
