/**
 * GC on one owner thread: one replica process (owning every slot) serves a hot customer deducting at a fixed rate over
 * HTTP, beside a background of held customers that are checked at a low rate, with the journal handed to a
 * worker-faithful Autumn (multiWorkerAutumn.ts) that pushes each subject back after the lag. The replica runs with
 * BUN_JSC_logGC=1 (plus whatever BUN_JSC_* the driver's env carries); its stderr is parsed for every collection in the
 * measured window: kind, pause increments, cycle time, heap before and after.
 * `bun run bench:gc <rate> <seconds> [backgroundCustomers] [backgroundRate] [backgroundBalances] [backgroundPlans] [pushLagMs] [readsPerDeduction]`
 */

import { heapSize, heapStats } from "bun:jsc";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSubjectState, type SubjectState } from "@autumn/balance-engine";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { LATEST_VERSION } from "@autumn/shared";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
} from "../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createDeployedAuth } from "../../src/auth/createDeployedAuth.js";
import { hashToken } from "../../src/auth/hashToken.js";
import { createAutumnClient } from "../../src/autumnClient/createAutumnClient.js";
import { createAtomApp } from "../../src/http/createAtomApp.js";
import { createPeerApp } from "../../src/http/createPeerApp.js";
import { createJournalForwarder } from "../../src/journalForwarder/createJournalForwarder.js";
import { CATALOG_PUSH, SUBJECT_PUSH } from "../../src/pushes/applyPushes.js";
import { createReplicaRing } from "../../src/replicas/createReplicaRing.js";
import { createReplication } from "../../src/replication/createReplication.js";
import { createHandlerRegistry } from "../../src/replication/handlers/createHandlerRegistry.js";
import { createHeldSubjects } from "../../src/state/heldSubjects/createHeldSubjects.js";
import { createSubjectPulls } from "../../src/subjectPulls/createSubjectPulls.js";
import { readStageClock } from "../../src/threads/stats/stageClock.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
	readThreadStats,
} from "../../src/threads/stats/threadStats.js";
import { allSlotsOwnedHere, atomOrg } from "../unit/utils/atomFixtures.js";

const MULTI_WORKER_AUTUMN_PATH = `${import.meta.dir}/multiWorkerAutumn.ts`;

const ATOM_TOKEN = "atom_token_bench";
const PEER_SECRET = "p".repeat(64);
const PORT = 18_280;
const PEER_PORT = 18_281;
const AUTUMN_PORT = 18_977;
const PUSH_ROUTER_PORT = 18_978;
const ADDRESS = "127.0.0.1";
const SLOTS = 43;
const HOT_BALANCES = 40;
const CLOCK_TICK_MS = 10;
/** Staging Medium: (6 GiB − 288 MiB − 3 × 192 MiB) × 0.5 / 3 / 5 of row text per thread. */
const HELD_BUDGET_BYTES = 176 * 1024 ** 2;
const RESET_MARK = "__BENCH_RESET__";
const END_MARK = "__BENCH_END__";

const jsThreadCpuMs = (): number => {
	const fields = readFileSync(`/proc/self/task/${process.pid}/stat`, "utf8")
		.split(") ")[1]
		?.split(" ");
	return (Number(fields?.[11]) + Number(fields?.[12])) * CLOCK_TICK_MS;
};

const entitlementsOf = ({
	balances,
	plan,
}: {
	balances: number;
	plan: number;
}) =>
	Array.from({ length: balances }, (_, i) =>
		createCustomerEntitlement({
			id: i === 0 ? "messages_monthly" : `feature_${i}_p${plan}_monthly`,
			featureId: i === 0 ? "messages" : `feature_${i}_p${plan}`,
			balance: 1_000_000_000,
		}),
	);

const subjectOf = ({
	customerId,
	balances,
	plan,
}: {
	customerId: string;
	balances: number;
	plan: number;
}) => {
	const state: SubjectState = createSubjectState({
		identity: { ...identity, customerId },
		customerProducts: [createCustomerProduct()],
		customerEntitlements: entitlementsOf({ balances, plan }),
	});
	return { state, catalog: createCatalogFor({ state }), org: atomOrg };
};

type GcCycle = {
	kind: string;
	pauses: number[];
	pauseMs: number;
	maxPauseMs: number;
	cycleMs: number;
	beforeKb: number;
	afterKb: number;
};

/** Every collection between the reset and end marks, from the replica's stderr. */
export const parseGcLog = (text: string): GcCycle[] => {
	const window = text.split(RESET_MARK).at(-1)?.split(END_MARK)[0] ?? "";
	const cycles: GcCycle[] = [];
	let current: GcCycle | null = null;
	for (const line of window.split("\n")) {
		const start = line.match(/START M (\d+)kb => (\w+)Collection/);
		if (start) {
			current = {
				kind: start[2] as string,
				pauses: [],
				pauseMs: 0,
				maxPauseMs: 0,
				cycleMs: 0,
				beforeKb: Number(start[1]),
				afterKb: 0,
			};
		}
		if (!current) continue;
		for (const pause of line.matchAll(/ p=([\d.]+)ms/g))
			current.pauses.push(Number(pause[1]));
		const end = line.match(
			/=> (\d+)kb, p=[\d.]+ms \(max [\d.]+\), cycle ([\d.]+)ms END/,
		);
		if (end) {
			current.afterKb = Number(end[1]);
			current.cycleMs = Number(end[2]);
			current.pauseMs = current.pauses.reduce((sum, ms) => sum + ms, 0);
			current.maxPauseMs = Math.max(0, ...current.pauses);
			cycles.push(current);
			current = null;
		}
	}
	return cycles;
};

const percentile = (sorted: number[], share: number) =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;

const summarizeGc = ({
	cycles,
	wallMs,
	threadCpuMs,
}: {
	cycles: GcCycle[];
	wallMs: number;
	threadCpuMs: number;
}) => {
	const byKind = (kind: string) => {
		const of = cycles.filter((cycle) => cycle.kind === kind);
		const pauses = of.flatMap((cycle) => cycle.pauses).sort((a, b) => a - b);
		const perCycle = of.map((cycle) => cycle.pauseMs).sort((a, b) => a - b);
		const pauseMs = perCycle.reduce((sum, ms) => sum + ms, 0);
		return {
			cycles: of.length,
			pauseMs: Number(pauseMs.toFixed(1)),
			cycleMs: Number(
				of.reduce((sum, cycle) => sum + cycle.cycleMs, 0).toFixed(1),
			),
			incrementP50Ms: Number(percentile(pauses, 0.5).toFixed(2)),
			incrementP99Ms: Number(percentile(pauses, 0.99).toFixed(2)),
			incrementMaxMs: Number(percentile(pauses, 1).toFixed(2)),
			perCycleP50Ms: Number(percentile(perCycle, 0.5).toFixed(2)),
			perCycleMaxMs: Number(percentile(perCycle, 1).toFixed(2)),
			heapBeforeKbAvg: Math.round(
				of.reduce((sum, cycle) => sum + cycle.beforeKb, 0) /
					Math.max(1, of.length),
			),
			heapAfterKbAvg: Math.round(
				of.reduce((sum, cycle) => sum + cycle.afterKb, 0) /
					Math.max(1, of.length),
			),
		};
	};
	const eden = byKind("Eden");
	const full = byKind("Full");
	const pauseMs = eden.pauseMs + full.pauseMs;
	return {
		eden,
		full,
		pauseMs: Number(pauseMs.toFixed(1)),
		pauseShareOfWall: Number((pauseMs / wallMs).toFixed(4)),
		pauseShareOfThreadCpu: Number((pauseMs / threadCpuMs).toFixed(4)),
		concurrentCycleShareOfWall: Number(
			((eden.cycleMs + full.cycleMs) / wallMs).toFixed(4),
		),
	};
};

const runReplica = async ({
	customerId,
	backgroundPath,
	backgroundBalances,
	backgroundPlans,
}: {
	customerId: string;
	backgroundPath: string;
	backgroundBalances: number;
	backgroundPlans: number;
}) => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-gc-"));
	const statsBuffer = createThreadStatsBuffer({ threads: 1 });
	const counters = openThreadCounters({ buffer: statsBuffer, index: 0 });
	const client = createAutumnClient({
		autumnApiUrl: `http://127.0.0.1:${AUTUMN_PORT}`,
	});
	const held = createHeldSubjects({ budgetBytes: HELD_BUDGET_BYTES });
	const auth = createDeployedAuth({
		dataDir,
		tokenHash: hashToken({ token: ATOM_TOKEN }),
		slotCount: SLOTS,
		owners: allSlotsOwnedHere,
		held,
		subjectPulls: createSubjectPulls({
			ctx: { autumnClient: client, counters, logger: { warn() {} } },
		}),
		journalForwarder: createJournalForwarder({
			ctx: { autumnClient: client, logger: { info() {}, warn() {} }, counters },
		}),
	});
	const registry = createHandlerRegistry();
	registry.register(SUBJECT_PUSH);
	registry.register(CATALOG_PUSH);
	const replication = createReplication({
		ctx: {
			secret: PEER_SECRET,
			port: PEER_PORT,
			registry,
			counters,
			logger: { warn() {} },
			resolver: { peers: async () => [], forget() {} },
		},
	});
	const httpContext = {
		auth,
		logger: { info() {}, warn() {}, error() {} },
		autumnApiUrl: `http://127.0.0.1:${AUTUMN_PORT}`,
		health: {
			bootedAt: new Date().toISOString(),
			restarts: new Int32Array(1),
			ready: new Int32Array([1]),
			threadsReady: new Int32Array([1]),
			thread: 0,
			threadStats: statsBuffer,
			dataDir,
		},
		counters,
		loop: { lagMs: () => 0 },
		replication,
		peer: {
			port: PEER_PORT,
			secret: PEER_SECRET,
			ring: createReplicaRing({
				ctx: { resolver: { peers: async () => [] }, own: () => [ADDRESS] },
			}),
		},
	};
	await auth.slots.processorFor({ customerId }).setSubject({
		customerId,
		body: JSON.stringify({
			...subjectOf({ customerId, balances: HOT_BALANCES, plan: 0 }),
			log_offset: "1",
			read_at: 1000,
		}),
	});
	const backgroundIds: string[] = await Bun.file(backgroundPath).json();
	backgroundIds.forEach((id, index) => {
		auth.slots.processorFor({ customerId: id }).setSubject({
			customerId: id,
			body: JSON.stringify({
				...subjectOf({
					customerId: id,
					balances: backgroundBalances,
					plan: index % backgroundPlans,
				}),
				log_offset: "1",
				read_at: 1000,
			}),
		});
	});
	let lagMaxMs = 0;
	let lagTotalMs = 0;
	let lagTicks = 0;
	const lags: number[] = [];
	let due = performance.now() + 10;
	setInterval(() => {
		const lag = Math.max(0, performance.now() - due);
		due = performance.now() + 10;
		lagMaxMs = Math.max(lagMaxMs, lag);
		lagTotalMs += lag;
		lagTicks++;
		lags.push(lag);
		if (lag >= 20)
			console.error(
				`__LAG__ at=${Math.round(performance.now() - wallAtReset)} lag=${lag.toFixed(1)}`,
			);
	}, 10);
	const bootedAt = performance.now();
	const stageClockNow = () =>
		readStageClock({ aliveUs: (performance.now() - bootedAt) * 1000 });
	let stageClockAtReset = stageClockNow();
	let cpuAtReset = jsThreadCpuMs();
	let wallAtReset = performance.now();
	const heapSamples: { atMs: number; heapMb: number }[] = [];
	setInterval(() => {
		heapSamples.push({
			atMs: Math.round(performance.now() - wallAtReset),
			heapMb: Math.round(heapSize() / 1024 ** 2),
		});
	}, 1000);
	const reset = () => {
		stageClockAtReset = stageClockNow();
		cpuAtReset = jsThreadCpuMs();
		wallAtReset = performance.now();
		lagMaxMs = 0;
		lagTotalMs = 0;
		lagTicks = 0;
		lags.length = 0;
		heapSamples.length = 0;
		console.error(RESET_MARK);
	};
	const app = createAtomApp({ ctx: httpContext });
	const peerApp = createPeerApp({ ctx: httpContext, secret: PEER_SECRET });
	Bun.serve({
		hostname: ADDRESS,
		port: PORT,
		fetch: (request) => {
			const { pathname } = new URL(request.url);
			if (pathname === "/__bench/reset") {
				reset();
				return new Response(null, { status: 204 });
			}
			if (pathname === "/__bench/stats") {
				console.error(END_MARK);
				const stats = readThreadStats({ buffer: statsBuffer })[0];
				const sortedLags = [...lags].sort((a, b) => a - b);
				const heap = heapStats();
				const statsAt = performance.now();
				return Response.json({
					heapStatsMs: Number((performance.now() - statsAt).toFixed(1)),
					threadCpuMs: jsThreadCpuMs() - cpuAtReset,
					wallMs: performance.now() - wallAtReset,
					stageClockUs: Object.fromEntries(
						Object.entries(stageClockNow()).map(([field, us]) => [
							field,
							us - (stageClockAtReset[field] ?? 0),
						]),
					),
					heapMb: Math.round(heap.heapSize / 1024 ** 2),
					heapCapacityMb: Math.round(heap.heapCapacity / 1024 ** 2),
					extraMemoryMb: Math.round(heap.extraMemorySize / 1024 ** 2),
					objectCount: heap.objectCount,
					rssMb: Math.round(process.memoryUsage().rss / 1024 ** 2),
					heldSubjects: held.size,
					heldMb: Math.round(held.bytes / 1024 ** 2),
					heldEvicted: held.evicted,
					loopLagAvgMs: Number((lagTotalMs / Math.max(1, lagTicks)).toFixed(3)),
					loopLagP99Ms: Number(percentile(sortedLags, 0.99).toFixed(2)),
					loopLagMaxMs: Number(lagMaxMs.toFixed(2)),
					heapSamples,
					checks: stats?.checks,
					pushes: stats?.pushes,
					tracksAppended: stats?.tracksAppended,
					viewFoldKept: stats?.viewFoldKept,
					viewFoldRebuilt: stats?.viewFoldRebuilt,
				});
			}
			return app.fetch(request);
		},
	});
	Bun.serve({ hostname: ADDRESS, port: PEER_PORT, fetch: peerApp.fetch });
	process.on("SIGTERM", () => {
		rmSync(dataDir, { recursive: true, force: true });
		process.exit(0);
	});
	console.log("ready");
};

const waitForReady = async (stdout: ReadableStream<Uint8Array>) => {
	const reader = stdout.getReader();
	let seen = "";
	while (!seen.includes("ready")) {
		const { value, done } = await reader.read();
		if (done) throw new Error("A bench process exited before it was ready");
		seen += new TextDecoder().decode(value);
	}
	reader.releaseLock();
};

const drive = async ({
	rate,
	seconds,
	backgroundCustomers,
	backgroundRate,
	backgroundBalances,
	backgroundPlans,
	pushLagMs,
	readsPerDeduction,
}: {
	rate: number;
	seconds: number;
	backgroundCustomers: number;
	backgroundRate: number;
	backgroundBalances: number;
	backgroundPlans: number;
	pushLagMs: number;
	readsPerDeduction: number;
}) => {
	const customerId = "cus_hot";
	const backgroundIds = Array.from(
		{ length: backgroundCustomers },
		(_, i) => `cus_bg_${i}`,
	);
	const folder = mkdtempSync(join(tmpdir(), "atom-gc-driver-"));
	const subjectPath = join(folder, "subject.json");
	await Bun.write(
		subjectPath,
		JSON.stringify(subjectOf({ customerId, balances: HOT_BALANCES, plan: 0 })),
	);
	const backgroundPath = join(folder, "background.json");
	await Bun.write(backgroundPath, JSON.stringify(backgroundIds));
	const backgroundSubjectPath = join(folder, "background-subject.json");
	await Bun.write(
		backgroundSubjectPath,
		JSON.stringify(
			subjectOf({
				customerId: "cus_bg_template",
				balances: backgroundBalances,
				plan: 0,
			}),
		),
	);
	const gcLogPath = process.env.GC_LOG_PATH ?? join(folder, "gc.log");
	// Herald pushes with the deployment's token; this router stands in for it.
	let routedPushes = 0;
	Bun.serve({
		hostname: "127.0.0.1",
		port: PUSH_ROUTER_PORT,
		fetch: async (request) => {
			routedPushes++;
			const reply = await fetch(`http://${ADDRESS}:${PORT}/v1/subjects.set`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-atom-token": ATOM_TOKEN,
					[ATOM_CUSTOMER_ID_HEADER]:
						request.headers.get(ATOM_CUSTOMER_ID_HEADER) ?? "",
				},
				body: await request.text(),
			});
			await reply.arrayBuffer();
			return new Response(null, { status: 204 });
		},
	});
	const autumn = Bun.spawn(
		[
			process.execPath,
			MULTI_WORKER_AUTUMN_PATH,
			String(AUTUMN_PORT),
			`http://127.0.0.1:${PUSH_ROUTER_PORT}/`,
			String(pushLagMs),
			subjectPath,
			customerId,
			backgroundSubjectPath,
		],
		{ stdout: "pipe", stderr: "inherit" },
	);
	await waitForReady(autumn.stdout);
	const gcLog = Bun.file(gcLogPath);
	const replica = Bun.spawn(
		[
			process.execPath,
			"--config=./bunfig.toml",
			import.meta.path,
			"replica",
			customerId,
			backgroundPath,
			String(backgroundBalances),
			String(backgroundPlans),
		],
		{
			stdout: "pipe",
			stderr: gcLog,
			env: { ...process.env, BUN_JSC_logGC: process.env.BUN_JSC_logGC ?? "1" },
		},
	);
	await waitForReady(replica.stdout);

	const send = (deducts: boolean, target: string) => {
		const startedAt = performance.now();
		return fetch(`http://${ADDRESS}:${PORT}/v1/balances.check`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-atom-token": ATOM_TOKEN,
				"x-api-version": LATEST_VERSION,
			},
			body: JSON.stringify({
				customer_id: target,
				feature_id: "messages",
				...(deducts && { send_event: true }),
			}),
		}).then(async (reply) => {
			const body = await reply.text();
			if (reply.status !== 200) {
				const reason = `${reply.status} ${reply.headers.get("x-atom-forwarded") ?? body.slice(0, 80)}`;
				failures.set(reason, (failures.get(reason) ?? 0) + 1);
			}
			return { ms: performance.now() - startedAt, ok: reply.status === 200 };
		});
	};
	const failures = new Map<string, number>();
	const warmupMs = pushLagMs + 3_000;
	const totalMs = warmupMs + seconds * 1000;
	const results: Promise<{ ms: number; ok: boolean }>[] = [];
	const readResults: Promise<{ ms: number; ok: boolean }>[] = [];
	const backgroundResults: Promise<{ ms: number; ok: boolean }>[] = [];
	const startedAt = performance.now();
	let sent = 0;
	let measuring = false;
	let backgroundSent = 0;
	while (performance.now() - startedAt < totalMs) {
		const elapsed = performance.now() - startedAt;
		if (!measuring && elapsed >= warmupMs) {
			measuring = true;
			await fetch(`http://${ADDRESS}:${PORT}/__bench/reset`);
		}
		const due = Math.floor((elapsed / 1000) * rate);
		for (; sent < due; sent++) {
			const reply = send(true, customerId);
			const reads = Array.from({ length: readsPerDeduction }, () =>
				send(false, customerId),
			);
			if (!measuring) continue;
			results.push(reply);
			readResults.push(...reads);
		}
		const backgroundDue = Math.floor((elapsed / 1000) * backgroundRate);
		for (; backgroundSent < backgroundDue; backgroundSent++) {
			const id = backgroundIds[backgroundSent % backgroundIds.length] as string;
			const reply = send(false, id);
			if (measuring) backgroundResults.push(reply);
		}
		await Bun.sleep(1);
	}
	const stats = await (
		await fetch(`http://${ADDRESS}:${PORT}/__bench/stats`)
	).json();
	const settled = await Promise.all(results);
	const readsSettled = await Promise.all(readResults);
	const backgroundSettled = await Promise.all(backgroundResults);
	const sortedOf = (list: { ms: number }[]) =>
		list.map(({ ms }) => ms).sort((a, b) => a - b);
	const latency = (list: { ms: number; ok: boolean }[]) => {
		const sorted = sortedOf(list);
		return {
			count: list.length,
			failed: list.filter(({ ok }) => !ok).length,
			p50Ms: Number(percentile(sorted, 0.5).toFixed(1)),
			p99Ms: Number(percentile(sorted, 0.99).toFixed(1)),
			maxMs: Number(percentile(sorted, 1).toFixed(1)),
		};
	};
	await Bun.sleep(200);
	const cycles = parseGcLog(await Bun.file(gcLogPath).text());
	const gc = summarizeGc({
		cycles,
		wallMs: stats.wallMs,
		threadCpuMs: stats.threadCpuMs,
	});
	const { heapSamples, stageClockUs, ...rest } = stats;
	const stageShares = Object.fromEntries(
		Object.entries(stageClockUs as Record<string, number>)
			.filter(([field]) => field.startsWith("stage"))
			.map(([field, us]) => [
				field.replace(/^stage/, "").replace(/Us$/, ""),
				Number((us / 1000 / stats.wallMs).toFixed(3)),
			]),
	);
	console.log(
		JSON.stringify({
			rate,
			seconds,
			backgroundCustomers,
			backgroundRate,
			backgroundBalances,
			backgroundPlans,
			pushLagMs,
			readsPerDeduction,
			jscEnv: Object.fromEntries(
				Object.entries(process.env).filter(([key]) =>
					key.startsWith("BUN_JSC_"),
				),
			),
			deductions: latency(settled),
			failures: Object.fromEntries(failures),
			routedPushes,
			reads: latency(readsSettled),
			background: latency(backgroundSettled),
			threadCpuMsPerDeduction: Number(
				(stats.threadCpuMs / Math.max(1, settled.length)).toFixed(3),
			),
			gc,
			gcPauseMsPerDeduction: Number(
				(gc.pauseMs / Math.max(1, settled.length)).toFixed(3),
			),
			stageShares,
			replica: rest,
			heapMbOverTime: (heapSamples as { heapMb: number }[])
				.map(({ heapMb }) => heapMb)
				.filter((_, index) => index % 5 === 0),
			gcLogPath,
		}),
	);
	replica.kill("SIGTERM");
	autumn.kill();
	await Promise.race([replica.exited, Bun.sleep(2_000)]);
	replica.kill("SIGKILL");
	rmSync(folder, { recursive: true, force: true });
	process.exit(0);
};

if (process.argv[2] === "replica")
	await runReplica({
		customerId: process.argv[3] as string,
		backgroundPath: process.argv[4] as string,
		backgroundBalances: Number(process.argv[5]),
		backgroundPlans: Number(process.argv[6]),
	});
else
	await drive({
		rate: Number(process.argv[2] ?? 1000),
		seconds: Number(process.argv[3] ?? 20),
		backgroundCustomers: Number(process.argv[4] ?? 0),
		backgroundRate: Number(process.argv[5] ?? 0),
		backgroundBalances: Number(process.argv[6] ?? 20),
		backgroundPlans: Number(process.argv[7] ?? 8),
		pushLagMs: Number(process.argv[8] ?? 1_500),
		readsPerDeduction: Number(process.argv[9] ?? 0),
	});
