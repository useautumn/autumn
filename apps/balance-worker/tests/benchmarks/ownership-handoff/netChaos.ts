import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseTrackCommand } from "@autumn/balance-engine";
import {
	BalanceWorkerClientError,
	createBalanceWorkerClient,
	createOwnersFromKafka,
	type HttpRequest,
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
	createPartitionReader,
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

const PARTITION_COUNT = Number(process.env.CHURN_PARTITIONS ?? 16);
const WORKERS = Number(process.env.CHURN_WORKERS ?? 4);
const BASELINE_MS = Number(process.env.CHAOS_BASELINE_MS ?? 15_000);
const AFTER_CLEAR_MS = Number(process.env.CHAOS_AFTER_CLEAR_MS ?? 60_000);
const HEARTBEAT_MS = Number(process.env.CHAOS_HEARTBEAT_MS ?? 5_000);
const SCENARIO = process.env.CHAOS_NAME ?? "unnamed";
const VICTIMS = (process.env.CHAOS_VICTIMS ?? "").split(",").filter(Boolean);
const NET_PREFIX = process.env.NETCHAOS_PREFIX ?? "bwc";
const KAFKA_CONTAINER = process.env.CHAOS_KAFKA_CONTAINER ?? "bwchaos-kafka";
const PG_CONTAINER = process.env.CHAOS_PG_CONTAINER ?? "bwchaos-pg";
const WORKER_PORT = 8082;
const HAMMER_INTERVAL_MS = 50;
const INITIAL_BALANCE = 1_000_000_000;
const TIMELINE_BEFORE_MS = 10_000;
const TIMELINE_AFTER_CLEAR_MS = 30_000;
const NET_SCRIPT = new URL("./netChaosNet.sh", import.meta.url).pathname;
const WORKER_SCRIPT = new URL("./benchWorker.ts", import.meta.url).pathname;

const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
if (brokers.length === 0) throw new Error("KAFKA_BROKERS is required");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const outDir = process.env.BENCH_OUT_DIR;
if (!outDir) throw new Error("BENCH_OUT_DIR is required");
const uid = process.getuid?.() ?? 0;
const gid = process.getgid?.() ?? 0;

type Step = { atMs: number; label: string; cmd?: string; spawn?: string };
const steps = JSON.parse(process.env.CHAOS_STEPS ?? "[]") as Step[];

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
	submitted: string | null;
	reason: string | null;
};
type HttpTap = {
	sentAt: number;
	doneAt: number;
	endpoint: string;
	path: string;
	partition: number | null;
	commands: number;
	status: number | "error";
	code: string | null;
	reason: string | null;
	error: string | null;
};
type Mark = { t: number; label: string; output?: string; exitCode?: number };

const workerEvents: WorkerEvent[] = [];
const ownershipEvents: OwnershipEvent[] = [];
const outcomes: ClientOutcome[] = [];
const taps: HttpTap[] = [];
const routingLogs: { t: number; level: string; message?: string }[] = [];
const marks: Mark[] = [];

const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"])
	.stdout.toString()
	.trim();
const deployment = `bench-${crypto.randomUUID().slice(0, 8)}`;
const runDir = join(outDir, `${SCENARIO}-${deployment}`);
mkdirSync(runDir, { recursive: true });
const edgeDir = join(runDir, "admin-bucket");
const permitDir = join(edgeDir, "admin/balance-worker-step-down", deployment);
mkdirSync(permitDir, { recursive: true });
const serviceArn = `arn:aws:ecs:local:0:service/${deployment}/balance-workers-blue`;
const fleetId = fleetIdOf({ serviceArn });
const subjectSnapshotsPath = join(
	edgeDir,
	BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY,
);
mkdirSync(join(subjectSnapshotsPath, ".."), { recursive: true });
writeFileSync(
	subjectSnapshotsPath,
	JSON.stringify({ ...defaultSubjectSnapshotsEdgeConfig(), mode: "off" }),
);
const slotPath = join(edgeDir, BALANCE_WORKER_ACTIVE_SLOT_KEY);
mkdirSync(join(slotPath, ".."), { recursive: true });
writeFileSync(
	slotPath,
	JSON.stringify({
		activeTaskDefinitionArn: null,
		activeImageSha: null,
		flightcontrolBlueArn: serviceArn,
		updatedAt: new Date().toISOString(),
		updatedBy: "net chaos benchmark",
		reason: "blue is live",
	}),
);

const topics = {
	metering: `${deployment}-events`,
	ownership: `${deployment}-ownership`,
	commands: `${deployment}-commands`,
	catalog: `${deployment}-catalog-invalidations`,
};
const kafka = createTestKafka({ clientId: `${deployment}-harness`, brokers });
const admin = kafka.admin();
await admin.connect();
await admin.createTopics({
	topics: [
		{
			topic: topics.metering,
			numPartitions: PARTITION_COUNT,
			replicationFactor: 1,
		},
		{
			topic: topics.commands,
			numPartitions: PARTITION_COUNT,
			replicationFactor: 1,
		},
		{
			topic: topics.ownership,
			numPartitions: PARTITION_COUNT,
			replicationFactor: 1,
			configEntries: [{ name: "cleanup.policy", value: "compact" }],
		},
		{ topic: topics.catalog, numPartitions: 1, replicationFactor: 1 },
	],
});

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

function routingLog(level: string) {
	return (payload: object | string, message?: string) => {
		const fields = typeof payload === "string" ? { message: payload } : payload;
		routingLogs.push({
			t: Date.now(),
			level,
			message: message ?? (fields as { message?: string }).message,
		});
	};
}
const owners = createOwnersFromKafka({
	ctx: {
		kafka,
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

async function postJson(request: HttpRequest) {
	const url = new URL(request.url);
	const body = request.body as {
		route?: { partition?: number };
		commands?: unknown[];
	};
	const sent = {
		sentAt: Date.now(),
		endpoint: url.origin,
		path: url.pathname,
		partition: body.route?.partition ?? null,
		commands: body.commands?.length ?? 1,
	};
	try {
		const response = await fetch(request.url, {
			method: "POST",
			headers: {
				...request.headers,
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify(request.body),
			signal: request.signal,
			redirect: "manual",
		});
		const json = (await response.json()) as {
			error?: { code?: string; reason?: string };
		};
		taps.push({
			...sent,
			doneAt: Date.now(),
			status: response.status,
			code: json.error?.code ?? null,
			reason: json.error?.reason ?? null,
			error: null,
		});
		return { status: response.status, body: json };
	} catch (cause) {
		taps.push({
			...sent,
			doneAt: Date.now(),
			status: "error",
			code: null,
			reason: null,
			error: (cause as Error).name,
		});
		throw cause;
	}
}
const client = createBalanceWorkerClient({
	ctx: { owners, http: { postJson } },
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
	let submitted: string | null = null;
	let reason: string | null = null;
	try {
		await client.track({ command });
	} catch (cause) {
		if (cause instanceof BalanceWorkerClientError) {
			outcome = cause.workerCode
				? `${cause.code}:${cause.workerCode}`
				: cause.code;
			submitted = cause.outcome;
			reason = cause.workerReason ?? null;
		} else outcome = `THROW:${(cause as Error).name}`;
	}
	outcomes.push({
		id,
		partition,
		sentAt,
		doneAt: Date.now(),
		outcome,
		submitted,
		reason,
	});
	return outcome;
}

const state = { hammering: false };
const inFlight = new Set<Promise<string>>();
function startHammer(): void {
	state.hammering = true;
	for (const partition of customers.keys()) {
		void (async () => {
			let next = Date.now();
			while (state.hammering) {
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
	index: number;
	endpoint: string;
	child: Bun.Subprocess<"ignore", "pipe", "pipe">;
	pid: number | null;
	spawnedAt: number;
};
const workers: Worker[] = [];
const nameByEndpoint = new Map<string, string>();
function nameOf(endpoint: string | undefined): string {
	return (endpoint && nameByEndpoint.get(endpoint)) ?? "?";
}
function indexOf(name: string): number {
	return name.charCodeAt(0) - 64;
}

async function pump({
	stream,
	file,
	onLine,
}: {
	stream: ReadableStream<Uint8Array>;
	file: string;
	onLine?: (line: string) => void;
}): Promise<void> {
	const decoder = new TextDecoder();
	let buffered = "";
	for await (const chunk of stream) {
		const text = decoder.decode(chunk, { stream: true });
		appendFileSync(file, text);
		if (!onLine) continue;
		buffered += text;
		const lines = buffered.split("\n");
		buffered = lines.pop() ?? "";
		for (const line of lines) if (line) onLine(line);
	}
}

function recordWorkerLine({
	worker,
	line,
}: {
	worker: Worker;
	line: string;
}): void {
	let parsed: Record<string, unknown>;
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
				event: `kafka.${String(parsed.level).toLowerCase()}`,
				message: String(parsed.message).slice(0, 400),
			});
		return;
	}
	if (!("event" in parsed)) return;
	const event = parsed as WorkerEvent;
	workerEvents.push(event);
	if (event.event === "worker.starting") worker.pid = Number(event.pid);
	if (
		/^(log\.error|error|unhealthy|consumer\.crash|service\.stopped)/.test(
			event.event,
		)
	)
		console.error(`[${event.worker}] ${line.slice(0, 600)}`);
}

function spawnWorker(name: string): Worker {
	const index = indexOf(name);
	const endpoint = `http://10.200.${index}.2:${WORKER_PORT}`;
	const dir = join(runDir, `worker-${name}`);
	mkdirSync(dir, { recursive: true });
	const env = {
		...createBalanceWorkerEnv({
			DATABASE_URL: databaseUrl,
			KAFKA_BROKERS: brokers.join(","),
			KAFKA_AUTH_MODE: "none",
			BALANCE_WORKER_HOST: "127.0.0.1",
			BALANCE_WORKER_PORT: String(WORKER_PORT),
			BALANCE_WORKER_SQLITE_PATH: join(dir, "state.sqlite"),
			BALANCE_WORKER_DEPLOYMENT: deployment,
			BALANCE_WORKER_PARTITION_COUNT: String(PARTITION_COUNT),
		}),
		BENCH_NAME: name,
		BENCH_BACKEND: "postgres",
		BENCH_SERVICE_ARN: serviceArn,
		BENCH_EDGE_CONFIG_DIR: edgeDir,
		BENCH_ADVERTISE_IP: `10.200.${index}.2`,
		BENCH_HEARTBEAT_MS: HEARTBEAT_MS,
	};
	const { AUTUMN_EDGE_CONFIG_OVERRIDE_B64: _, ...inherited } = process.env;
	const child = Bun.spawn(
		[
			"sudo",
			"-n",
			"-E",
			"ip",
			"netns",
			"exec",
			`${NET_PREFIX}${index}`,
			"setpriv",
			`--reuid=${uid}`,
			`--regid=${gid}`,
			"--init-groups",
			process.execPath,
			WORKER_SCRIPT,
		],
		{
			env: {
				...inherited,
				HOME: homedir(),
				NODE_ENV: "test",
				BENCH_WORKER_ENV: JSON.stringify(env),
			},
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const worker: Worker = {
		name,
		index,
		endpoint,
		child,
		pid: null,
		spawnedAt: Date.now(),
	};
	workers.push(worker);
	nameByEndpoint.set(endpoint, name);
	void child.exited.then((exitCode) =>
		workerEvents.push({
			t: Date.now(),
			worker: name,
			event: "worker.exited",
			exitCode,
			duringRun: state.hammering,
		}),
	);
	void pump({
		stream: child.stdout,
		file: join(runDir, `worker-${name}.stdout.log`),
		onLine: (line) => recordWorkerLine({ worker, line }),
	});
	void pump({
		stream: child.stderr,
		file: join(runDir, `worker-${name}.stderr.log`),
	});
	return worker;
}

function stepEnv(): Record<string, string> {
	const env: Record<string, string> = {
		NET: NET_SCRIPT,
		EDGE_DIR: edgeDir,
		PERMIT_DIR: permitDir,
		KAFKA_CONTAINER,
		PG_CONTAINER,
		DEPLOYMENT: deployment,
	};
	for (let i = 0; i < 26; i++) {
		const name = String.fromCharCode(65 + i);
		env[`IDX_${name}`] = String(i + 1);
		env[`NS_${name}`] = `${NET_PREFIX}${i + 1}`;
	}
	for (const worker of workers)
		if (worker.pid) env[`PID_${worker.name}`] = String(worker.pid);
	return env;
}

async function runCommand({
	label,
	cmd,
}: {
	label: string;
	cmd: string;
}): Promise<void> {
	const shell = Bun.spawn(["bash", "-c", cmd], {
		env: { ...process.env, ...stepEnv() },
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = `${await new Response(shell.stdout).text()}${await new Response(shell.stderr).text()}`;
	await shell.exited;
	marks.push({
		t: Date.now(),
		label,
		output: output.trim().slice(0, 600),
		exitCode: shell.exitCode ?? undefined,
	});
	console.error(
		`step ${label}: exit ${shell.exitCode} ${output.trim().slice(0, 300)}`,
	);
}

async function runStep(step: Step): Promise<void> {
	if (step.spawn) {
		spawnWorker(step.spawn);
		marks.push({ t: Date.now(), label: step.label });
		console.error(`step ${step.label}: spawned ${step.spawn}`);
		return;
	}
	if (step.cmd) await runCommand({ label: step.label, cmd: step.cmd });
}

function ownersAt(t: number): Map<number, string> {
	const byPartition = new Map<number, string>();
	for (const event of ownershipEvents)
		if (event.type === "claimed" && event.seenAt <= t)
			byPartition.set(event.partition, nameOf(event.endpoint));
	return byPartition;
}
function movedBetween({ from, to }: { from: number; to: number }) {
	const before = ownersAt(from);
	const after = ownersAt(to);
	const moved = [...customers.keys()]
		.sort((a, b) => a - b)
		.filter((partition) => before.get(partition) !== after.get(partition))
		.map((partition) => ({
			partition,
			from: before.get(partition) ?? null,
			to: after.get(partition) ?? null,
		}));
	const claims = ownershipEvents.filter(
		(e) => e.type === "claimed" && e.seenAt > from && e.seenAt <= to,
	).length;
	return { moved: moved.length, claims, partitions: moved };
}

function countBy<T>(
	items: T[],
	key: (item: T) => string,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
	return out;
}

const spawnedAt = Date.now();
for (let i = 0; i < WORKERS; i++) spawnWorker(String.fromCharCode(65 + i));
const claimDeadline = Date.now() + 240_000;
while (
	new Set(
		ownershipEvents
			.filter((e) => e.type === "claimed" && e.seenAt >= spawnedAt)
			.map((e) => e.partition),
	).size < PARTITION_COUNT
) {
	if (Date.now() > claimDeadline)
		throw new Error("Timed out waiting for every partition claimed");
	await Bun.sleep(100);
}
for (const partition of customers.keys())
	while ((await trackOnce(partition)) !== "200") {
		if (Date.now() > claimDeadline)
			throw new Error(`partition ${partition} never served`);
		await Bun.sleep(250);
	}
await Bun.sleep(5_000);
const readyAt = Date.now();
console.error(
	`fleet of ${WORKERS} settled in ${readyAt - spawnedAt}ms; owners ${JSON.stringify(Object.fromEntries(ownersAt(readyAt)))}`,
);
startHammer();
await Bun.sleep(BASELINE_MS);

const faultStart = Date.now();
marks.push({ t: faultStart, label: "fault.start" });
const ownersAtFault = Object.fromEntries(ownersAt(faultStart));
for (const victim of VICTIMS)
	if (!Object.values(ownersAtFault).includes(victim))
		console.error(`warning: victim ${victim} owns no partition at fault start`);
let clearAt: number | undefined;
for (const step of steps) {
	await Bun.sleep(Math.max(0, faultStart + step.atMs - Date.now()));
	await runStep(step);
	if (step.label === "clear") clearAt = Date.now();
}
clearAt ??= Date.now();
await Bun.sleep(AFTER_CLEAR_MS);
state.hammering = false;
await Promise.allSettled([...inFlight]);
const endAt = Date.now();

for (const worker of workers) {
	await runCommand({
		label: `safety.clear.${worker.name}`,
		cmd: `"$NET" clear ${worker.index} || true`,
	});
}
await runCommand({
	label: "safety.unpause",
	cmd: `docker unpause "$KAFKA_CONTAINER" >/dev/null 2>&1; docker unpause "$PG_CONTAINER" >/dev/null 2>&1; chmod -R u+w "$EDGE_DIR"; true`,
});

const rel = (t: number) => t - faultStart;
const relOrNull = (t: number | undefined | null) =>
	t === undefined || t === null ? null : rel(t);
const phase = (t: number) =>
	t < faultStart
		? "baseline"
		: t < (clearAt as number)
			? "fault"
			: t <= endAt
				? "recovery"
				: "after";

type Tick = WorkerEvent & {
	work: {
		lastSendAckAt: number | null;
		ownNetwork: string;
		steppedDown: boolean;
	};
	verdict: {
		state: string;
		segments: number;
		retransmitRatio: number | null;
		busyPartitions: number;
		stalledPartitions: number;
	};
	tcp: { outSegs: number; retransSegs: number; timeouts: number } | null;
	sends: { partition: number; longestInFlightMs: number }[];
};
const ticks = workerEvents.filter(
	(e) => e.event === "own_network.tick",
) as Tick[];
function logsOf({
	worker,
	event,
	match,
}: {
	worker: string;
	event: string;
	match: RegExp;
}) {
	return workerEvents.filter(
		(e) =>
			e.worker === worker &&
			e.event === event &&
			e.t >= faultStart &&
			match.test(JSON.stringify(e.args ?? "")),
	);
}
function argsOf(
	event: WorkerEvent | undefined,
): Record<string, unknown> | null {
	const args = event?.args as unknown[] | undefined;
	return (args?.[1] as Record<string, unknown> | undefined) ?? null;
}
const timelines = Object.fromEntries(
	workers.map((worker) => {
		const mine = ticks.filter(
			(tick) => tick.worker === worker.name && tick.t >= faultStart,
		);
		const stepping = logsOf({
			worker: worker.name,
			event: "log.error",
			match: /stepping down/,
		})[0];
		const first = (event: string) =>
			workerEvents.find(
				(e) =>
					e.worker === worker.name && e.event === event && e.t >= faultStart,
			);
		return [
			worker.name,
			{
				firstDegradedMs: relOrNull(
					mine.find((t) => t.verdict.state === "degraded")?.t,
				),
				firstDegradedProductMs: relOrNull(
					mine.find((t) => t.work.ownNetwork === "degraded")?.t,
				),
				stepDownLogMs: relOrNull(stepping?.t),
				stepDown: stepping
					? {
							peers: argsOf(stepping)?.peers,
							permitSlot: argsOf(stepping)?.permitSlot,
							verdict: argsOf(stepping)?.verdict,
						}
					: null,
				steppedDownMs: relOrNull(
					logsOf({
						worker: worker.name,
						event: "log.info",
						match: /Stepped down/,
					})[0]?.t,
				),
				leaveStartMs: relOrNull(first("consumer.leave.start")?.t),
				leaveDoneMs: relOrNull(first("consumer.leave.done")?.t),
				leaveFailedMs: relOrNull(first("consumer.leave.failed")?.t),
				staying: [
					...logsOf({
						worker: worker.name,
						event: "log.warn",
						match: /do not vouch|could not be read/,
					}),
					...logsOf({
						worker: worker.name,
						event: "log.error",
						match: /no step-down permit|check failed/,
					}),
				].map((e) => ({
					relMs: rel(e.t),
					message: String((e.args as unknown[])[0]),
					peers: argsOf(e)?.peers ?? null,
					reason: argsOf(e)?.reason ?? null,
					error: argsOf(e)?.error ?? null,
				})),
				exits: workerEvents
					.filter(
						(e) => e.worker === worker.name && e.event === "worker.exited",
					)
					.map((e) => ({
						relMs: rel(e.t),
						exitCode: e.exitCode,
						duringRun: e.duringRun,
					})),
				spawnedMs: rel(worker.spawnedAt),
			},
		];
	}),
);
const steppedDownWorkers = Object.entries(timelines)
	.filter(([, timeline]) => timeline.stepDownLogMs !== null)
	.map(([name]) => name);

const sinceFault = outcomes.filter(
	(o) => o.sentAt >= faultStart && o.sentAt <= endAt,
);
const failures = sinceFault.filter((o) => o.outcome !== "200");
const recovery = [...customers.keys()]
	.sort((a, b) => a - b)
	.map((partition) => {
		const mine = sinceFault
			.filter((o) => o.partition === partition)
			.sort((a, b) => a.sentAt - b.sentAt);
		const failed = mine.filter((o) => o.outcome !== "200");
		const lastFailure = failed.at(-1);
		const firstOkAfter = lastFailure
			? mine.find((o) => o.outcome === "200" && o.sentAt >= lastFailure.sentAt)
			: undefined;
		return {
			partition,
			ownerAtFault: ownersAtFault[partition] ?? null,
			ownerAtEnd: ownersAt(endAt).get(partition) ?? null,
			failures: failed.length,
			firstFailureMs: relOrNull(failed[0]?.sentAt),
			lastFailureDoneMs: relOrNull(lastFailure?.doneAt),
			servedAgainMs: relOrNull(firstOkAfter?.doneAt),
		};
	});
const hadFailures = recovery.filter((r) => r.failures > 0);
const allServedAgainMs = hadFailures.every((r) => r.servedAgainMs !== null)
	? Math.max(0, ...hadFailures.map((r) => r.servedAgainMs as number))
	: null;

const selected = [
	...VICTIMS,
	...workers
		.map((w) => w.name)
		.filter((name) => !VICTIMS.includes(name))
		.slice(0, 2),
];
const perSecond = Object.fromEntries(
	selected.map((name) => [
		name,
		ticks
			.filter(
				(tick) =>
					tick.worker === name &&
					tick.t >= faultStart - TIMELINE_BEFORE_MS &&
					tick.t <= (clearAt as number) + TIMELINE_AFTER_CLEAR_MS,
			)
			.map((tick) => ({
				s: Math.round(rel(tick.t) / 1000),
				out: tick.tcp?.outSegs ?? null,
				re: tick.tcp?.retransSegs ?? null,
				rto: tick.tcp?.timeouts ?? null,
				ratio:
					tick.tcp && tick.tcp.outSegs > 0
						? Number((tick.tcp.retransSegs / tick.tcp.outSegs).toFixed(4))
						: null,
				seg3s: tick.verdict.segments,
				ratio3s:
					tick.verdict.retransmitRatio === null
						? null
						: Number(tick.verdict.retransmitRatio.toFixed(4)),
				busy: tick.verdict.busyPartitions,
				stalled: tick.verdict.stalledPartitions,
				mirror: tick.verdict.state,
				product: tick.work.ownNetwork,
				steppedDown: tick.work.steppedDown,
			})),
	]),
);
const calibration = Object.fromEntries(
	workers.map((worker) => {
		const mine = ticks.filter(
			(tick) => tick.worker === worker.name && tick.tcp,
		);
		const ratios = (filter: (t: Tick) => boolean) =>
			mine
				.filter(filter)
				.filter((t) => (t.tcp?.outSegs ?? 0) > 0)
				.map((t) => (t.tcp?.retransSegs ?? 0) / (t.tcp?.outSegs ?? 1));
		const summarize = (values: number[]) =>
			values.length
				? {
						n: values.length,
						max: Number(Math.max(...values).toFixed(4)),
						mean: Number(
							(values.reduce((a, b) => a + b, 0) / values.length).toFixed(4),
						),
					}
				: null;
		const segments = (filter: (t: Tick) => boolean) => {
			const values = mine.filter(filter).map((t) => t.tcp?.outSegs ?? 0);
			return values.length
				? { min: Math.min(...values), max: Math.max(...values) }
				: null;
		};
		return [
			worker.name,
			{
				baselineRatio: summarize(
					ratios((t) => phase(t.t) === "baseline" && t.t >= readyAt),
				),
				faultRatio: summarize(ratios((t) => phase(t.t) === "fault")),
				baselineSegmentsPerSecond: segments(
					(t) => phase(t.t) === "baseline" && t.t >= readyAt,
				),
				faultSegmentsPerSecond: segments((t) => phase(t.t) === "fault"),
				statesDuringFault: countBy(
					mine.filter((t) => phase(t.t) === "fault"),
					(t) => t.verdict.state,
				),
				mirrorMatchesProduct: mine.every(
					(t) => t.verdict.state === t.work.ownNetwork,
				),
			},
		];
	}),
);
const steppingDownAnswers = countBy(
	taps.filter(
		(t) =>
			t.sentAt >= faultStart &&
			t.code === "NOT_OWNER" &&
			t.reason === "STEPPING_DOWN",
	),
	(t) => nameOf(t.endpoint),
);
const markRows = marks.map((m) => ({ ...m, relMs: rel(m.t) }));
const ownerMoves = {
	faultToClear: movedBetween({ from: faultStart, to: clearAt }),
	clearToEnd: movedBetween({ from: clearAt, to: endAt }),
	faultToEnd: movedBetween({ from: faultStart, to: endAt }),
	byStep: marks
		.filter((m) => m.label !== "fault.start" && !m.label.startsWith("safety"))
		.map((m, i, all) => ({
			after: m.label,
			...movedBetween({ from: m.t, to: all[i + 1]?.t ?? endAt }),
		})),
};

for (const worker of workers) {
	if (worker.child.exitCode !== null) continue;
	if (worker.pid) process.kill(worker.pid, "SIGTERM");
	await Promise.race([worker.child.exited, Bun.sleep(60_000)]);
	if (worker.child.exitCode === null && worker.pid)
		process.kill(worker.pid, "SIGKILL");
}
await owners.stop();
await watcher.disconnect();
const reader = createPartitionReader({
	ctx: { kafka },
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
const failedButLogged = outcomes.filter(
	(o) => o.outcome !== "200" && logCount.has(o.id),
);
const reconciliation = {
	requests: outcomes.length,
	ok: outcomes.filter((o) => o.outcome === "200").length,
	loggedDistinct: logCount.size,
	duplicates: [...logCount]
		.filter(([, n]) => n > 1)
		.map(([id, n]) => ({ id, n, outcome: outcomeById.get(id)?.outcome })),
	okMissing: outcomes
		.filter((o) => o.outcome === "200" && !logCount.has(o.id))
		.map((o) => ({ id: o.id, partition: o.partition, relMs: rel(o.sentAt) })),
	failedButLogged: countBy(
		failedButLogged,
		(o) => `${o.outcome}|${o.submitted}`,
	),
	failedNotLogged: countBy(
		outcomes.filter((o) => o.outcome !== "200" && !logCount.has(o.id)),
		(o) => `${o.outcome}|${o.submitted}`,
	),
	loggedButNeverSent: [...logCount.keys()].filter((id) => !outcomeById.has(id))
		.length,
	nonMutationRecords,
	postgresMatchesLog: perPartition.every((p) => p.consistent),
	postgresMismatches: perPartition.filter((p) => !p.consistent),
};

const summary = {
	scenario: SCENARIO,
	commit,
	deployment,
	fleetId,
	config: {
		WORKERS,
		PARTITION_COUNT,
		BASELINE_MS,
		AFTER_CLEAR_MS,
		HEARTBEAT_MS,
		VICTIMS,
		steps,
	},
	fleetSettledMs: readyAt - spawnedAt,
	marks: markRows,
	clearRelMs: rel(clearAt),
	endRelMs: rel(endAt),
	ownersAtFault,
	ownersAtEnd: Object.fromEntries(ownersAt(endAt)),
	steppedDownWorkers,
	timelines,
	outcomesByPhase: Object.fromEntries(
		["baseline", "fault", "recovery"].map((p) => [
			p,
			countBy(
				outcomes.filter((o) => o.sentAt >= readyAt && phase(o.sentAt) === p),
				(o) => (o.outcome === "200" ? "200" : `${o.outcome}|${o.submitted}`),
			),
		]),
	),
	failOpens: {
		total: failures.length,
		unknownOutcome: failures.filter((o) => o.submitted === "unknown").length,
		notSubmitted: failures.filter((o) => o.submitted === "not_submitted")
			.length,
		byCode: countBy(failures, (o) => `${o.outcome}|${o.submitted}`),
		byOwnerAtFault: countBy(failures, (o) => ownersAtFault[o.partition] ?? "?"),
	},
	steppingDownAnswers,
	notOwnerAnswersByWorker: countBy(
		taps.filter((t) => t.sentAt >= faultStart && t.code === "NOT_OWNER"),
		(t) => `${nameOf(t.endpoint)}:${t.reason ?? "-"}`,
	),
	recovery: { allServedAgainMs, perPartition: recovery },
	ownerMoves,
	groupJoins: countBy(
		workerEvents.filter(
			(e) => e.event === "consumer.group_join" && e.t >= faultStart,
		),
		(e) => `${phase(e.t)}:${e.worker}`,
	),
	prepares: countBy(
		workerEvents.filter(
			(e) => e.event === "runtime.prepare" && e.t >= faultStart,
		),
		(e) => `${phase(e.t)}:${e.worker}`,
	),
	crashes: workerEvents
		.filter((e) => e.event === "consumer.crash")
		.map((e) => ({ relMs: rel(e.t), worker: e.worker, restart: e.restart })),
	workerErrors: countBy(
		workerEvents.filter(
			(e) =>
				/^(log\.error|error|unhealthy)$/.test(e.event) && e.t >= faultStart,
		),
		(e) =>
			`${e.worker}:${e.event}:${JSON.stringify(e.args ?? e.cause).slice(0, 160)}`,
	),
	routing: countBy(
		routingLogs.filter((l) => l.t >= faultStart),
		(l) => `${phase(l.t)}:${l.level}:${String(l.message).slice(0, 100)}`,
	),
	calibration,
	perSecond,
	reconciliation,
	perPartitionReconciliation: perPartition,
};

await admin.deleteTopics({ topics: Object.values(topics) });
await admin.disconnect();
for (const customer of [...customers.values(), ...extraCustomers])
	await customer.cleanup();
await postgres.close();
chmodSync(permitDir, 0o755);
writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 1));
writeFileSync(
	join(runDir, "raw.json"),
	JSON.stringify({
		outcomes,
		taps,
		workerEvents,
		ownershipEvents,
		routingLogs,
	}),
);
console.error(`summary: ${join(runDir, "summary.json")}`);
process.exit(0);
