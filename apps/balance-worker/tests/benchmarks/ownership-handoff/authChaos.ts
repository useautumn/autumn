/**
 * Takes a broker's verdict on the fleet's identity away mid-run and gives it back: a deleted SCRAM
 * credential, a removed ACL. Four real workers run as subprocesses of benchWorker.ts, the server's
 * routing client (createOwnersFromKafka) runs here, and every partition is hammered at 20 req/s.
 * The report covers failures by code per phase, consumer crashes with their restart flag, group
 * joins, re-prepares, how long after the fault cleared every partition served again, and a
 * reconciliation of every command id against the metering log and Postgres.
 *
 *   cd apps/balance-worker
 *   KAFKA_BROKERS=<SASL_SSL brokers> DATABASE_URL=... NODE_ENV=test \
 *   CHAOS_ADMIN_USER=admin CHAOS_ADMIN_PASSWORD=... CHAOS_APP_USER=app CHAOS_APP_PASSWORD=... \
 *   CHAOS_STEPS='[{"atMs":0,"label":"fault","cmd":"..."},{"atMs":60000,"label":"clear","cmd":"..."}]' \
 *   bun tests/benchmarks/ownership-handoff/authChaos.ts
 *
 * The admin principal (a super user) creates topics, watches the ownership log and reconciles; the
 * app principal is the one every worker and the routing client authenticate as, and the one the
 * fault steps revoke. CHAOS_STEPS run in order from the fault start; the step labelled "clear" marks
 * the moment the fault is lifted.
 */
import { mkdtempSync, rmSync } from "node:fs";
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
	createPartitionReader,
	meteringIdentityToPartition,
	ownershipTopic,
	parseTrustedMeteringRecord,
} from "@autumn/kafka";
import {
	openFixturePostgres,
	type SeededCustomer,
	seedCustomer,
} from "../../integration/postgres/postgresCustomerFixture.js";

const PARTITION_COUNT = Number(process.env.CHURN_PARTITIONS ?? 16);
const REPLICATION = Number(process.env.CHURN_RF ?? 3);
const WORKERS = Number(process.env.CHURN_WORKERS ?? 4);
const BASELINE_MS = Number(process.env.CHAOS_BASELINE_MS ?? 15_000);
const AFTER_CLEAR_MS = Number(process.env.CHAOS_AFTER_CLEAR_MS ?? 150_000);
const HAMMER_INTERVAL_MS = 50;
const INITIAL_BALANCE = 1_000_000_000;
const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
if (brokers.length === 0) throw new Error("KAFKA_BROKERS is required");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}
const adminUser = {
	username: required("CHAOS_ADMIN_USER"),
	password: required("CHAOS_ADMIN_PASSWORD"),
};
const appUser = {
	username: required("CHAOS_APP_USER"),
	password: required("CHAOS_APP_PASSWORD"),
};
type Step = { atMs: number; label: string; cmd: string };
const steps = JSON.parse(process.env.CHAOS_STEPS ?? "[]") as Step[];

function kafkaAs({
	clientId,
	user,
}: {
	clientId: string;
	user: { username: string; password: string };
}) {
	return createKafka(
		createKafkaClient({
			clientId,
			brokers,
			transport: { ssl: true, sasl: { mechanism: "scram-sha-512", ...user } },
			limits: {
				connectionTimeoutMs: 3_000,
				requestTimeoutMs: 10_000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		}),
	);
}

type WorkerEvent = { t: number; worker: string; event: string } & Record<
	string,
	unknown
>;
type OwnershipEvent = {
	seenAt: number;
	partition: number;
	type: string;
	endpoint?: string;
};
type ClientOutcome = {
	id: string;
	partition: number;
	sentAt: number;
	doneAt: number;
	outcome: string;
};
type RoutingLog = {
	t: number;
	level: string;
	type?: string;
	message?: string;
	error?: string;
};

const workerEvents: WorkerEvent[] = [];
const ownershipEvents: OwnershipEvent[] = [];
const outcomes: ClientOutcome[] = [];
const routingLogs: RoutingLog[] = [];
const marks: { t: number; label: string; output?: string }[] = [];

const deployment = `bench-${crypto.randomUUID().slice(0, 8)}`;
const topics = {
	metering: `${deployment}-events`,
	ownership: `${deployment}-ownership`,
	commands: `${deployment}-commands`,
	catalog: `${deployment}-catalog-invalidations`,
};
const adminKafka = kafkaAs({
	clientId: `${deployment}-harness`,
	user: adminUser,
});
const admin = adminKafka.admin();
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
	const customer = await seedCustomer({ postgres, balance: INITIAL_BALANCE });
	const partition = meteringIdentityToPartition({
		identity: customer.identity,
		partitionCount: PARTITION_COUNT,
	});
	if (customers.has(partition)) extraCustomers.push(customer);
	else customers.set(partition, customer);
}

const watcher = adminKafka.consumer({ groupId: `${deployment}-watch` });
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

// The server's routing client: owners from Kafka (rebuilt when they fail), as the app principal.
function routingLog(level: string) {
	return (payload: object | string, message?: string) => {
		const fields = typeof payload === "string" ? { message: payload } : payload;
		const error = (fields as { error?: unknown }).error;
		routingLogs.push({
			t: Date.now(),
			level,
			type: (fields as { type?: string }).type,
			message: message ?? (fields as { message?: string }).message,
			error: error
				? String((error as Error).message ?? error).slice(0, 300)
				: undefined,
		});
	};
}
const routingKafka = kafkaAs({
	clientId: `${deployment}-server`,
	user: appUser,
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
	},
});
await owners.start();
const client = createBalanceWorkerClient({
	ctx: { owners },
	config: {
		partitionCount: PARTITION_COUNT,
		timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
		routeRefreshTimeoutMs: BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
	},
});

async function trackOnce(partition: number): Promise<string> {
	const customer = customers.get(partition);
	if (!customer) throw new Error(`No customer for partition ${partition}`);
	const id = `hammer-${crypto.randomUUID()}`;
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
	outcomes.push({ id, partition, sentAt, doneAt: Date.now(), outcome });
	return outcome;
}

let hammering = false;
const inFlight = new Set<Promise<string>>();
function startHammer(): void {
	hammering = true;
	for (const partition of customers.keys()) {
		void (async () => {
			let next = Date.now();
			while (hammering) {
				const sent = trackOnce(partition);
				inFlight.add(sent);
				void sent.finally(() => inFlight.delete(sent));
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
	dir: string;
};
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
	const dir = mkdtempSync(join(tmpdir(), `chaos-${name}-`));
	const env = {
		...createBalanceWorkerEnv({
			DATABASE_URL: databaseUrl,
			KAFKA_BROKERS: brokers.join(","),
			KAFKA_AUTH_MODE: "scram",
			KAFKA_SASL_MECHANISM: "scram-sha-512",
			KAFKA_SASL_USERNAME_BALANCE_WORKER: appUser.username,
			KAFKA_SASL_PASSWORD_BALANCE_WORKER: appUser.password,
			BALANCE_WORKER_HOST: "127.0.0.1",
			BALANCE_WORKER_PORT: String(port),
			BALANCE_WORKER_SQLITE_PATH: join(dir, "state.sqlite"),
			BALANCE_WORKER_DEPLOYMENT: deployment,
			BALANCE_WORKER_PARTITION_COUNT: String(PARTITION_COUNT),
		}),
		BENCH_NAME: name,
		BENCH_BACKEND: "postgres",
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
	children.push(child);
	void child.exited.then((exitCode) =>
		workerEvents.push({
			t: Date.now(),
			worker: name,
			event: "worker.exited",
			exitCode,
			duringRun: hammering,
		}),
	);
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
							message: String(parsed.message).slice(0, 400),
							clientName: parsed.name,
						});
					continue;
				}
				if (!("event" in parsed)) continue;
				workerEvents.push(parsed);
				if (
					/^(log\.error|error|unhealthy|consumer\.crash|service\.stopped)/.test(
						parsed.event,
					)
				)
					console.error(`[${parsed.worker}] ${line.slice(0, 800)}`);
			}
		}
	})();
	return { name, endpoint: env.BALANCE_WORKER_ENDPOINT, child, dir };
}

async function runStep(step: Step): Promise<void> {
	const shell = Bun.spawn(["bash", "-c", step.cmd], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = `${await new Response(shell.stdout).text()}${await new Response(shell.stderr).text()}`;
	await shell.exited;
	marks.push({
		t: Date.now(),
		label: step.label,
		output: output.trim().slice(0, 400),
	});
	console.error(
		`step ${step.label}: exit ${shell.exitCode} ${output.trim().slice(0, 200)}`,
	);
}

const workers: Worker[] = [];
const spawnedAt = Date.now();
for (let i = 0; i < WORKERS; i++)
	workers.push(await spawnWorker(String.fromCharCode(65 + i)));
const claimDeadline = Date.now() + 180_000;
while (
	new Set(
		ownershipEvents
			.filter((e) => e.type === "claimed" && e.seenAt >= spawnedAt)
			.map((e) => e.partition),
	).size < PARTITION_COUNT
) {
	if (Date.now() > claimDeadline)
		throw new Error("Timed out waiting for every partition claimed");
	await Bun.sleep(50);
}
for (const partition of customers.keys())
	while ((await trackOnce(partition)) !== "200") {
		if (Date.now() > claimDeadline)
			throw new Error(`partition ${partition} never served`);
		await Bun.sleep(250);
	}
await Bun.sleep(5_000);
console.error(`fleet of ${WORKERS} settled; hammering`);
startHammer();
await Bun.sleep(BASELINE_MS);

const faultStart = Date.now();
marks.push({ t: faultStart, label: "fault.start" });
let clearAt: number | undefined;
for (const step of steps) {
	await Bun.sleep(Math.max(0, faultStart + step.atMs - Date.now()));
	await runStep(step);
	if (step.label === "clear") clearAt = Date.now();
}
clearAt ??= Date.now();
await Bun.sleep(AFTER_CLEAR_MS);
hammering = false;
await Promise.allSettled([...inFlight]);
const endAt = Date.now();

// --- What happened -------------------------------------------------------------------------------
function countBy<T>(
	items: T[],
	key: (item: T) => string,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
	return out;
}
const phase = (t: number) =>
	t < faultStart
		? "baseline"
		: t < (clearAt as number)
			? "fault"
			: t <= endAt
				? "recovery"
				: "shutdown";
const rel = (t: number) => t - faultStart;
const perSecond: Record<string, Record<string, number>> = {};
for (const o of outcomes) {
	const s = String(Math.floor(rel(o.sentAt) / 1000));
	perSecond[s] ??= {};
	perSecond[s][o.outcome] = (perSecond[s][o.outcome] ?? 0) + 1;
}
/** Per partition: the first request sent after the clear that served, and the last one that did not. */
const recovery = [...customers.keys()]
	.sort((a, b) => a - b)
	.map((partition) => {
		const after = outcomes.filter(
			(o) => o.partition === partition && o.sentAt >= (clearAt as number),
		);
		const firstOk = after.find((o) => o.outcome === "200");
		const lastFail = after.filter((o) => o.outcome !== "200").at(-1);
		return {
			partition,
			firstOkAfterClearMs: firstOk
				? firstOk.doneAt - (clearAt as number)
				: null,
			lastFailureAfterClearMs: lastFail
				? lastFail.doneAt - (clearAt as number)
				: null,
			failuresAfterClear: after.filter((o) => o.outcome !== "200").length,
		};
	});
const lastJoinByWorker = Object.fromEntries(
	workers.map((w) => {
		const join = workerEvents
			.filter((e) => e.worker === w.name && e.event === "consumer.group_join")
			.at(-1);
		return [
			w.name,
			join
				? {
						relMs: rel(join.t),
						partitions: (join.partitions as number[]).length,
					}
				: null,
		];
	}),
);
const refusals = workerEvents.filter(
	(e) =>
		e.event === "log.warn" &&
		JSON.stringify(e.args).includes("balance_worker.consumer_refused"),
);
const rejoined = workerEvents.filter(
	(e) =>
		e.event === "log.info" &&
		JSON.stringify(e.args).includes("balance_worker.consumer_rejoined"),
);
const crashes = workerEvents
	.filter((e) => e.event === "consumer.crash")
	.map((e) => {
		const error = e.error as
			| { name?: string; message?: string; code?: unknown }
			| undefined;
		return {
			relMs: rel(e.t),
			worker: e.worker,
			restart: e.restart,
			groupId: e.groupId,
			error: `${error?.name}: ${String(error?.message).slice(0, 160)}`,
		};
	});

// --- Reconciliation: stop the fleet gracefully (flushes Postgres), then read the log as the admin ---
for (const worker of workers) {
	worker.child.kill("SIGTERM");
	await Promise.race([worker.child.exited, Bun.sleep(60_000)]);
	rmSync(worker.dir, { recursive: true, force: true });
}
await owners.stop();
await watcher.disconnect();
const reader = createPartitionReader({
	ctx: { kafka: adminKafka },
	config: { topic: topics.metering },
});
const offsets = await admin.fetchTopicOffsets(topics.metering);
const logCount = new Map<string, number>();
const logPartition = new Map<string, number>();
let nonMutationRecords = 0;
for (const { partition, high } of offsets) {
	const records = await reader.readRange({
		partition,
		fromOffset: 0n,
		toOffset: BigInt(high),
		timeoutMs: 120_000,
	});
	for (const { key, value } of records) {
		let record: ReturnType<typeof parseTrustedMeteringRecord>;
		try {
			record = parseTrustedMeteringRecord({ key, value });
		} catch {
			nonMutationRecords += 1;
			continue;
		}
		const id = String(
			(record as { id?: unknown }).id ?? record.command.commandId,
		);
		if (!id.startsWith("hammer-")) continue;
		logCount.set(id, (logCount.get(id) ?? 0) + 1);
		logPartition.set(id, partition);
	}
}
await reader.disconnect();
const outcomeById = new Map(outcomes.map((o) => [o.id, o]));
const duplicates = [...logCount]
	.filter(([, n]) => n > 1)
	.map(([id, n]) => ({ id, n, outcome: outcomeById.get(id)?.outcome }));
const okMissing = outcomes
	.filter((o) => o.outcome === "200" && !logCount.has(o.id))
	.map((o) => ({ id: o.id, partition: o.partition, relMs: rel(o.sentAt) }));
const appliedButFailed = countBy(
	outcomes.filter((o) => o.outcome !== "200" && logCount.has(o.id)),
	(o) => o.outcome,
);
const notInHarness = [...logCount.keys()].filter(
	(id) => !outcomeById.has(id),
).length;
const perPartition = [];
for (const [partition, customer] of [...customers].sort(
	(a, b) => a[0] - b[0],
)) {
	const logged = [...logPartition].filter(([, p]) => p === partition).length;
	const applied = INITIAL_BALANCE - (await customer.readBalance());
	perPartition.push({
		partition,
		ok: outcomes.filter((o) => o.partition === partition && o.outcome === "200")
			.length,
		loggedDistinct: logged,
		postgresApplied: applied,
		consistent: applied === logged,
	});
}
const reconciliation = {
	requests: outcomes.length,
	ok: outcomes.filter((o) => o.outcome === "200").length,
	loggedDistinct: logCount.size,
	duplicates,
	okMissing,
	appliedButReportedFailed: appliedButFailed,
	loggedButNeverSent: notInHarness,
	nonMutationRecords,
	postgresMatchesLog: perPartition.every((p) => p.consistent),
	postgresMismatches: perPartition.filter((p) => !p.consistent),
};

const summary = {
	config: {
		WORKERS,
		PARTITION_COUNT,
		REPLICATION,
		BASELINE_MS,
		AFTER_CLEAR_MS,
		steps,
	},
	marks: marks.map((m) => ({ ...m, relMs: rel(m.t) })),
	clearRelMs: rel(clearAt),
	endRelMs: rel(endAt),
	outcomesByPhase: Object.fromEntries(
		["baseline", "fault", "recovery"].map((p) => [
			p,
			countBy(
				outcomes.filter((o) => phase(o.sentAt) === p),
				(o) => o.outcome,
			),
		]),
	),
	recoveryMs: {
		everyPartitionServedAfterClear: recovery.every(
			(r) => r.firstOkAfterClearMs !== null,
		)
			? Math.max(...recovery.map((r) => r.firstOkAfterClearMs as number))
			: null,
		lastFailureAfterClear: Math.max(
			0,
			...recovery.map((r) => r.lastFailureAfterClearMs ?? 0),
		),
		perPartition: recovery,
	},
	crashes,
	crashesByRestart: countBy(
		crashes,
		(c) => `${phase(c.relMs + faultStart)}:restart=${c.restart}`,
	),
	groupJoins: countBy(
		workerEvents.filter((e) => e.event === "consumer.group_join"),
		(e) => phase(e.t),
	),
	rebalancing: countBy(
		workerEvents.filter((e) => e.event === "consumer.rebalancing"),
		(e) => phase(e.t),
	),
	prepares: countBy(
		workerEvents.filter((e) => e.event === "runtime.prepare"),
		(e) => phase(e.t),
	),
	refusalRejoinsScheduled: refusals.map((e) => ({
		relMs: rel(e.t),
		worker: e.worker,
	})),
	rejoinedAfterRefusal: rejoined.map((e) => ({
		relMs: rel(e.t),
		worker: e.worker,
	})),
	lastJoinByWorker,
	workerExitsDuringRun: workerEvents.filter(
		(e) => e.event === "worker.exited" && e.duringRun,
	),
	serviceStopped: workerEvents
		.filter((e) => e.event === "service.stopped")
		.map((e) => ({ relMs: rel(e.t), worker: e.worker })),
	workerErrors: countBy(
		workerEvents.filter((e) => /^(log\.error|error|unhealthy)$/.test(e.event)),
		(e) =>
			`${phase(e.t)}:${e.event}:${JSON.stringify(e.args ?? e.cause).slice(0, 140)}`,
	),
	kafkaLogs: countBy(
		workerEvents.filter((e) => /^kafka\.(warn|error)$/.test(e.event)),
		(e) =>
			`${phase(e.t)}:${String(e.message)
				.replace(/[0-9]+/g, "#")
				.slice(0, 120)}`,
	),
	routing: routingLogs.map((l) => ({ ...l, relMs: rel(l.t) })),
	ownershipRecords: countBy(
		ownershipEvents.filter((e) => e.seenAt >= faultStart),
		(e) => `${phase(e.seenAt)}:${e.type}`,
	),
	reconciliation,
	perPartitionReconciliation: perPartition,
	perSecond,
};

await admin.deleteTopics({ topics: Object.values(topics) });
await admin.disconnect();
for (const customer of [...customers.values(), ...extraCustomers])
	await customer.cleanup();
await postgres.close();
const out = join(
	process.env.BENCH_OUT_DIR ?? tmpdir(),
	`auth-chaos-${deployment}.json`,
);
await Bun.write(
	out,
	JSON.stringify({ summary, outcomes, workerEvents, ownershipEvents }, null, 1),
);
console.error(`raw data: ${out}`);
console.log(JSON.stringify(summary, null, 1));
process.exit(0);
