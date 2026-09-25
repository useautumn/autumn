/**
 * Measures how long each balance-worker partition has no owner while workers
 * join, leave gracefully (SIGTERM -> worker.stop()) or die (SIGKILL), against a
 * real local Kafka. Workers run as subprocesses of benchWorker.ts and report
 * their lifecycle as JSON lines; this process watches the ownership topic,
 * hammers the client at 20 req/s per partition and joins the three clocks
 * (same machine, so Date.now() is comparable everywhere).
 *
 *   cd apps/balance-worker
 *   KAFKA_BROKERS=127.0.0.1:19092 NODE_ENV=test bun tests/benchmarks/ownership-handoff/run.ts [--runs 3] [--backend sqlite]
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseTrackCommand } from "@autumn/balance-engine";
import {
	BalanceWorkerClientError,
	createBalanceWorkerClient,
} from "@autumn/balance-worker-client";
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

const { values: args } = parseArgs({
	options: {
		runs: { type: "string", default: "3" },
		backend: { type: "string", default: "postgres" },
		// Back-to-back requests per partition to catch requests in flight at the withdraw. Off by default: it multiplies
		// the metering log volume, and replay re-reads the last ten minutes of it, so it inflates the very window being measured.
		probe: { type: "boolean", default: false },
	},
});
const RUNS = Number(args.runs);
const BACKEND = args.backend as "sqlite" | "postgres";
if (BACKEND !== "postgres")
	throw new Error(
		"Only the postgres backend is wired up: the sqlite backend still reads its catalog from Postgres and needs the state seeded on the log",
	);
const PARTITION_COUNT = 4;
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
	type: "claimed" | "unowned" | "ready";
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
	waitForLeaders: true,
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
			at:
				record.type === "claimed"
					? record.claimedAt
					: record.type === "ready"
						? record.readyAt
						: record.releasedAt,
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
				const { route, command } = body as {
					route: { partition: number };
					command: { requestId: string };
				};
				const lane = command.requestId.startsWith("probe-")
					? "probe"
					: "hammer";
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
	(lane === "probe" ? probeOutcomes : outcomes).push({
		partition,
		sentAt,
		doneAt: Date.now(),
		outcome,
	});
	return outcome;
}

let probing = false;
function startProbe(): () => void {
	probing = true;
	for (const partition of customers.keys()) {
		void (async () => {
			while (probing) await trackOnce(partition, "probe");
		})();
	}
	return () => {
		probing = false;
	};
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
const nameOf = (endpoint: string | undefined) =>
	(endpoint && workersByEndpoint.get(endpoint)) ?? "?";
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
		}),
		BENCH_NAME: name,
		BENCH_BACKEND: BACKEND,
	};
	const child = Bun.spawn(
		["bun", new URL("./benchWorker.ts", import.meta.url).pathname],
		{
			env: {
				...process.env,
				NODE_ENV: "test",
				AUTUMN_EDGE_CONFIG_OVERRIDE_B64: "e30=",
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
// A partition the roster hands back to its owner writes nothing on the ownership log, so the
// transition is settled once the roster has moved, the log has been quiet, and every partition
// has served a 200 since whichever of those came last.
function settled(t0: number): boolean {
	const joins = workerEvents.filter(
		(e) => e.event === "consumer.group_join" && e.t >= t0,
	);
	if (joins.length === 0) return false;
	const lastJoin = Math.max(...joins.map((e) => e.t));
	const lastRecord = Math.max(
		t0,
		...ownershipEvents.filter((e) => e.seenAt >= t0).map((e) => e.seenAt),
	);
	const lastActivity = Math.max(lastJoin, lastRecord);
	if (Date.now() - lastActivity < 1_500) return false;
	for (const partition of customers.keys())
		if (
			!outcomes.some(
				(o) =>
					o.partition === partition &&
					o.outcome === "200" &&
					o.sentAt >= lastActivity,
			)
		)
			return false;
	return true;
}

type Reconciliation = {
	partition: number;
	ok: number;
	unknown: number;
	applied: number;
};
async function reconcile(): Promise<Reconciliation[]> {
	const rows: Reconciliation[] = [];
	for (const [partition, customer] of customers) {
		const mine = [...outcomes, ...probeOutcomes].filter(
			(o) => o.partition === partition,
		);
		rows.push({
			partition,
			ok: mine.filter((o) => o.outcome === "200").length,
			unknown: mine.filter(
				(o) =>
					o.outcome === "DEADLINE" ||
					o.outcome === "TRANSPORT" ||
					o.outcome === "ABORTED",
			).length,
			applied: 1_000_000_000 - (await customer.readBalance()),
		});
	}
	return rows.sort((a, b) => a.partition - b.partition);
}

type Sample = {
	scenario: string;
	run: number;
	t0: number;
	rebalancingAfterMs: number | null;
	rebalancingAfterConsumerStartMs: number | null;
	perPartition: {
		partition: number;
		from: string;
		to: string;
		withdrawAt: number | null;
		unownedAt: number | null;
		claimedAt: number;
		firstOkAt: number;
		gapUnownedToClaimedMs: number | null;
		windowUnownedToOkMs: number | null;
		windowWithdrawToOkMs: number | null;
		windowT0ToOkMs: number;
		startup: Record<string, number | null>;
	}[];
	traffic: {
		partition: number;
		counts: Record<string, number>;
		longestFailureRunMs: number;
		rawStatuses: Record<string, number>;
		straddlingWithdraw: {
			total: number;
			ok: number;
			notOwner: number;
			other: number;
		};
		probe: {
			total: number;
			straddling: number;
			straddlingOk: number;
			straddlingNotOwner: number;
			straddlingOther: number;
		};
		okLatencyMs: { p50: number | null; p99: number | null };
	}[];
	leaver: Record<string, number | null> | null;
	reconciliation?: Reconciliation[];
};
const samples: Sample[] = [];

function analyze({
	scenario,
	run,
	t0,
	tEnd,
}: {
	scenario: string;
	run: number;
	t0: number;
	tEnd: number;
}): Sample {
	const inWindow = <T extends { t: number }>(events: T[]) =>
		events.filter((e) => e.t >= t0 && e.t <= tEnd);
	const events = inWindow(workerEvents);
	const rebalancing = events.find(
		(e) => e.event === "consumer.rebalancing" && e.worker === "A",
	);
	const consumerStart = events.find(
		(e) => e.event === "consumer.start" && e.worker !== "A",
	);
	const claims = claimsAfter(t0);
	const perPartition = [...claims.entries()]
		.sort(([a], [b]) => a - b)
		.map(([partition, claim]) => {
			const previousOwner = [...ownershipEvents]
				.filter(
					(e) => e.partition === partition && e.type === "claimed" && e.at < t0,
				)
				.at(-1);
			const unowned = ownershipEvents.find(
				(e) =>
					e.partition === partition &&
					e.type === "unowned" &&
					e.at >= t0 &&
					e.at <= tEnd &&
					e.endpoint === previousOwner?.endpoint,
			);
			const withdraw = events.find(
				(e) =>
					e.event === "withdraw" &&
					e.partition === partition &&
					e.worker === nameOf(previousOwner?.endpoint),
			);
			const firstOk = outcomes.find(
				(o) =>
					o.partition === partition &&
					o.outcome === "200" &&
					o.doneAt >= claim.seenAt,
			);
			if (!firstOk) throw new Error("No success after claim");
			const owner = nameOf(claim.endpoint);
			const step = (
				name: string,
				extra: (e: WorkerEvent) => boolean = () => true,
			) =>
				events.find(
					(e) =>
						e.worker === owner &&
						e.partition === partition &&
						e.event === name &&
						e.t >= t0 &&
						extra(e),
				)?.t ?? null;
			const status = (to: string) => step("runtime.status", (e) => e.to === to);
			const prepareAt = step("runtime.prepare");
			const prepared = step("runtime.prepared");
			const announced = step("ready.announced");
			const startAt = step("runtime.start");
			const fenced = status("bootstrapping");
			const bootstrapped = status("catching_up");
			const ready = status("ready");
			const claimStart = step("claim.start");
			const claimDone = step("claim.done");
			const diff = (a: number | null, b: number | null) =>
				a === null || b === null ? null : b - a;
			return {
				partition,
				from: nameOf(previousOwner?.endpoint),
				to: owner,
				withdrawAt: withdraw?.t ?? null,
				unownedAt: unowned?.at ?? null,
				claimedAt: claim.at,
				firstOkAt: firstOk.doneAt,
				gapUnownedToClaimedMs: unowned ? claim.at - unowned.at : null,
				windowUnownedToOkMs: unowned ? firstOk.doneAt - unowned.at : null,
				windowWithdrawToOkMs: withdraw ? firstOk.doneAt - withdraw.t : null,
				windowT0ToOkMs: firstOk.doneAt - t0,
				startup: {
					prepareMs: diff(prepareAt, prepared),
					announcedToActivateMs: diff(announced, startAt),
					activateMs: diff(startAt, ready),
					connectAndFenceMs: diff(startAt, fenced),
					bootstrapMs: diff(fenced, bootstrapped),
					replayMs: diff(bootstrapped, ready),
					readyToClaimStartMs: diff(ready, claimStart),
					claimMs: diff(claimStart, claimDone),
					totalStartToClaimMs: diff(startAt, claimDone),
				},
			};
		});
	const traffic = [...customers.keys()].sort().map((partition) => {
		const mine = outcomes
			.filter(
				(o) => o.partition === partition && o.sentAt >= t0 && o.sentAt <= tEnd,
			)
			.sort((a, b) => a.sentAt - b.sentAt);
		const counts: Record<string, number> = {};
		for (const o of mine) counts[o.outcome] = (counts[o.outcome] ?? 0) + 1;
		let longest = 0;
		let runStart: number | null = null;
		let runEnd = 0;
		for (const o of mine) {
			if (o.outcome !== "200") {
				runStart ??= o.sentAt;
				runEnd = Math.max(runEnd, o.doneAt);
			} else if (runStart !== null) {
				longest = Math.max(longest, runEnd - runStart);
				runStart = null;
			}
		}
		if (runStart !== null) longest = Math.max(longest, runEnd - runStart);
		const info = perPartition.find((p) => p.partition === partition);
		const raw = rawHttp.filter(
			(r) =>
				r.lane === "hammer" &&
				r.partition === partition &&
				r.sentAt >= t0 &&
				r.sentAt <= tEnd,
		);
		const probeRaw = rawHttp.filter(
			(r) =>
				r.lane === "probe" &&
				r.partition === partition &&
				r.sentAt >= t0 &&
				r.sentAt <= tEnd,
		);
		const probeStraddling = probeRaw.filter(
			(r) =>
				info?.withdrawAt &&
				nameOf(r.endpoint) === info.from &&
				r.sentAt < info.withdrawAt &&
				r.doneAt >= info.withdrawAt,
		);
		const rawStatuses: Record<string, number> = {};
		for (const r of raw)
			rawStatuses[String(r.status)] = (rawStatuses[String(r.status)] ?? 0) + 1;
		const straddling = raw.filter(
			(r) =>
				info?.withdrawAt &&
				nameOf(r.endpoint) === info.from &&
				r.sentAt < info.withdrawAt &&
				r.doneAt >= info.withdrawAt,
		);
		const okLatencies = mine
			.filter((o) => o.outcome === "200")
			.map((o) => o.doneAt - o.sentAt)
			.sort((a, b) => a - b);
		const p = (q: number) =>
			okLatencies[
				Math.min(okLatencies.length - 1, Math.floor(q * okLatencies.length))
			] ?? null;
		return {
			partition,
			counts,
			longestFailureRunMs: longest,
			rawStatuses,
			straddlingWithdraw: {
				total: straddling.length,
				ok: straddling.filter((r) => r.status === 200).length,
				notOwner: straddling.filter((r) => r.status === 409).length,
				other: straddling.filter((r) => r.status !== 200 && r.status !== 409)
					.length,
			},
			probe: {
				total: probeRaw.length,
				straddling: probeStraddling.length,
				straddlingOk: probeStraddling.filter((r) => r.status === 200).length,
				straddlingNotOwner: probeStraddling.filter((r) => r.status === 409)
					.length,
				straddlingOther: probeStraddling.filter(
					(r) => r.status !== 200 && r.status !== 409,
				).length,
			},
			okLatencyMs: { p50: p(0.5), p99: p(0.99) },
		};
	});
	const leaverEvent = (name: string) =>
		events.find((e) => e.worker === "B" && e.event === name)?.t ?? null;
	const rel = (t: number | null) => (t === null ? null : t - t0);
	const leaver =
		scenario === "GRACEFUL_LEAVE"
			? {
					stopBeginMs: rel(leaverEvent("stop.begin")),
					withdrawMs: rel(leaverEvent("withdraw")),
					drainedMs: rel(leaverEvent("drained")),
					releaseDoneMs: rel(leaverEvent("release.done")),
					partitionsStoppedMs: rel(leaverEvent("stop.partitions_stopped")),
					stopDoneMs: rel(leaverEvent("stop.done")),
				}
			: null;
	return {
		scenario,
		run,
		t0,
		leaver,
		rebalancingAfterMs: rebalancing ? rebalancing.t - t0 : null,
		rebalancingAfterConsumerStartMs:
			rebalancing && consumerStart ? rebalancing.t - consumerStart.t : null,
		perPartition,
		traffic,
	};
}

async function runScenario({
	scenario,
	run,
	trigger,
}: {
	scenario: string;
	run: number;
	trigger: () => Promise<number>;
}) {
	const stopProbe = args.probe ? startProbe() : () => undefined;
	await Bun.sleep(200);
	const t0 = await trigger();
	await waitFor(() => settled(t0), 120_000, `${scenario} to settle`);
	stopProbe();
	// Let the tail of the traffic land before slicing.
	await Bun.sleep(1_500);
	const tEnd = Date.now();
	const sample = analyze({ scenario, run, t0, tEnd });
	// Rows land asynchronously through the committer; give the last flush a moment, then compare what Postgres
	// holds against every 200 the client has seen so far, so a discrepancy can be pinned to a scenario.
	await Bun.sleep(1_000);
	sample.reconciliation = await reconcile();
	samples.push(sample);
	console.error(`[${scenario} #${run}] settled in ${tEnd - t0 - 1_500}ms`);
	await Bun.sleep(2_000);
}

const started = Date.now();
const A = await spawnWorker("A");
await waitFor(
	() => claimsAfter(A.spawnedAt).size === PARTITION_COUNT,
	60_000,
	"worker A to own everything",
);
for (const partition of customers.keys()) {
	const outcome = await trackOnce(partition);
	if (outcome !== "200")
		throw new Error(`Partition ${partition} not serving: ${outcome}`);
}
console.error(
	`A owns and serves all ${PARTITION_COUNT} partitions after ${Date.now() - started}ms`,
);
startHammer();
await Bun.sleep(2_000);

for (let run = 1; run <= RUNS; run++) {
	let B = await (async () => {
		let worker!: Worker;
		await runScenario({
			scenario: "JOIN",
			run,
			trigger: async () => {
				worker = await spawnWorker("B");
				return worker.spawnedAt;
			},
		});
		return worker;
	})();
	await runScenario({
		scenario: "GRACEFUL_LEAVE",
		run,
		trigger: async () => {
			const t0 = Date.now();
			B.child.kill("SIGTERM");
			return t0;
		},
	});
	await B.child.exited;
	rmSync(B.dir, { recursive: true, force: true });
	B = await (async () => {
		let worker!: Worker;
		await runScenario({
			scenario: "JOIN",
			run: run + RUNS,
			trigger: async () => {
				worker = await spawnWorker("B");
				return worker.spawnedAt;
			},
		});
		return worker;
	})();
	await runScenario({
		scenario: "HARD_KILL",
		run,
		trigger: async () => {
			const t0 = Date.now();
			B.child.kill("SIGKILL");
			return t0;
		},
	});
	await B.child.exited;
	rmSync(B.dir, { recursive: true, force: true });
}

hammering = false;
await Bun.sleep(1_500);
A.child.kill("SIGTERM");
await A.child.exited;
rmSync(A.dir, { recursive: true, force: true });
const reconciliation = await reconcile();
await routing.stop();
await watcher.disconnect();
await admin.deleteTopics({ topics: Object.values(topics) });
await admin.disconnect();
for (const customer of [...customers.values(), ...extraCustomers])
	await customer.cleanup();
await postgres.close();

const out = join(
	process.env.BENCH_OUT_DIR ?? tmpdir(),
	`ownership-handoff-${BACKEND}-${deployment}.json`,
);
await Bun.write(
	out,
	JSON.stringify(
		{
			backend: BACKEND,
			deployment,
			samples,
			reconciliation,
			outcomes,
			rawHttp,
			workerEvents,
			ownershipEvents,
		},
		null,
		1,
	),
);
console.error(`raw data: ${out}`);
console.log(
	JSON.stringify({ backend: BACKEND, samples, reconciliation }, null, 1),
);
process.exit(0);
