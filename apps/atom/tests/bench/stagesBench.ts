/**
 * One hot customer on a pair of single-thread replicas over HTTP, a share of checks hopping to the owner; its journal goes
 * to a worker-faithful Autumn (multiWorkerAutumn.ts) that pushes each subject back to one replica after the lag, relayed to
 * the other. Optional same-customer reads and a background of other customers. Reports the owner's thread CPU, its stage
 * clock, heap and latency. `bun run bench:stages <rate> <seconds> <simple|complex> [pushLagMs] [hopShare] [readsPerDeduction]
 * [backgroundCustomers] [backgroundRate]`.
 */

import { heapSize } from "bun:jsc";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createSubjectState,
	type SubjectState,
	type WorkerUsageWindow,
} from "@autumn/balance-engine";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import {
	fullSubjectRowsMemoStats,
	EntInterval,
	FeatureType,
	getUsageWindowBounds,
	LATEST_VERSION,
	ResetInterval,
} from "@autumn/shared";
import { customerWith } from "../../../../packages/balance-engine/tests/unit/deduction/deductionFixtures.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
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
import {
	readStageClock,
	timeStage,
} from "../../src/threads/stats/stageClock.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
	readThreadStats,
} from "../../src/threads/stats/threadStats.js";
import { allSlotsOwnedHere, atomOrg } from "../unit/utils/atomFixtures.js";
import { createFastCheck } from "./fastCheckSpike.js";

const MULTI_WORKER_AUTUMN_PATH = `${import.meta.dir}/multiWorkerAutumn.ts`;

const ATOM_TOKEN = "atom_token_bench";
const PEER_SECRET = "p".repeat(64);
const PORT = 18_180;
const PEER_PORT = 18_181;
const AUTUMN_PORT = 18_877;
const PUSH_ROUTER_PORT = 18_878;
const ADDRESSES = ["127.0.0.21", "127.0.0.22"];
const SLOTS = 43;
const BALANCES = 40;
const CLOCK_TICK_MS = 10;

const jsThreadCpuMs = (): number => {
	const fields = readFileSync(`/proc/self/task/${process.pid}/stat`, "utf8")
		.split(") ")[1]
		?.split(" ");
	return (Number(fields?.[11]) + Number(fields?.[12])) * CLOCK_TICK_MS;
};

/** The hot customer's subject: 40 balances, and for `complex` a credit system, a rollover, a daily cap's window and overage on the deducted one. */
const subjectOf = (shape: string, customerId: string) => {
	const others = Array.from({ length: BALANCES - 1 }, (_, i) =>
		createCustomerEntitlement({
			id: `feature_${i + 1}_monthly`,
			featureId: `feature_${i + 1}`,
			balance: 1_000_000_000,
		}),
	);
	const messages = {
		...createCustomerEntitlement({ balance: 1_000_000_000 }),
		...(shape === "complex" && { usage_allowed: true }),
	};
	const complex = shape === "complex";
	const credits = createCustomerEntitlement({
		id: "credits_monthly",
		featureId: "credits",
		balance: 1_000_000_000,
	});
	const today = getUsageWindowBounds({
		interval: EntInterval.Day,
		now: occurredAt,
	});
	const window: WorkerUsageWindow = {
		id: "uw_messages",
		internal_customer_id: "cus_internal_1",
		internal_entity_id: null,
		feature_id: "messages",
		internal_feature_id: "feat_messages",
		filter_key: null,
		anchor_customer_entitlement_id: null,
		window_start_at: today.windowStartAt,
		window_end_at: today.windowEndAt,
		usage: 0,
		updated_at: occurredAt - 1,
	};
	const state: SubjectState = createSubjectState({
		identity: { ...identity, customerId },
		...(complex && {
			customer: customerWith({
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: 1_000_000_000,
						interval: ResetInterval.Day,
					},
				],
			}),
		}),
		customerProducts: [createCustomerProduct()],
		customerEntitlements: complex
			? [messages, credits, ...others.slice(1)]
			: [messages, ...others],
		rollovers: complex
			? [
					{
						id: "ro_messages",
						cus_ent_id: "messages_monthly",
						balance: 1_000_000,
						usage: 0,
						expires_at: occurredAt + 30 * 86_400_000,
						entities: {},
					},
				]
			: [],
		usageWindows: complex ? [window] : [],
	});
	const catalog = createCatalogFor({ state });
	const creditFeature = catalog.features.feat_credits;
	if (complex && creditFeature) {
		creditFeature.type = FeatureType.CreditSystem;
		creditFeature.config = {
			schema: [{ metered_feature_id: "messages", credit_amount: 1 }],
		};
	}
	return { state, catalog, org: atomOrg };
};

/** A background customer as staging holds them: 14 balances on one plan. */
const backgroundSubjectOf = (customerId: string) => {
	const state: SubjectState = createSubjectState({
		identity: { ...identity, customerId },
		customerProducts: [createCustomerProduct()],
		customerEntitlements: Array.from({ length: 14 }, (_, i) =>
			createCustomerEntitlement({
				id: i === 0 ? "messages_monthly" : `feature_${i}_monthly`,
				featureId: i === 0 ? "messages" : `feature_${i}`,
				balance: 1_000_000_000,
			}),
		),
	});
	return { state, catalog: createCatalogFor({ state }), org: atomOrg };
};

type Stage = { ms: number; calls: number; units: number };

const runReplica = async ({
	address,
	shape,
	customerId,
	backgroundPath,
}: {
	address: string;
	shape: string;
	customerId: string;
	backgroundPath: string;
}) => {
	const stages = new Map<string, Stage>();
	let depth = 0;
	let timedTopLevelMs = 0;
	(globalThis as Record<string, unknown>).__T = <T>(
		name: string,
		fn: () => T,
		units = 1,
	): T => {
		const at = performance.now();
		depth++;
		try {
			return fn();
		} finally {
			depth--;
			const ms = performance.now() - at;
			const stage = stages.get(name) ?? { ms: 0, calls: 0, units: 0 };
			stage.ms += ms;
			stage.calls++;
			stage.units += units;
			stages.set(name, stage);
			if (depth === 0) timedTopLevelMs += ms;
		}
	};
	(globalThis as Record<string, unknown>).__R = (
		name: string,
		ms: number,
		units = 1,
	) => {
		const stage = stages.get(name) ?? { ms: 0, calls: 0, units: 0 };
		stage.ms += ms;
		stage.calls++;
		stage.units += units;
		stages.set(name, stage);
	};
	const dataDir = mkdtempSync(join(tmpdir(), "atom-hot-stages-"));
	const statsBuffer = createThreadStatsBuffer({ threads: 1 });
	const counters = openThreadCounters({ buffer: statsBuffer, index: 0 });
	const client = createAutumnClient({
		autumnApiUrl: `http://127.0.0.1:${AUTUMN_PORT}`,
	});
	const auth = createDeployedAuth({
		dataDir,
		tokenHash: hashToken({ token: ATOM_TOKEN }),
		slotCount: SLOTS,
		owners: allSlotsOwnedHere,
		held: createHeldSubjects({ budgetBytes: 512 * 1024 ** 2 }),
		subjectPulls: createSubjectPulls({
			ctx: { autumnClient: client, counters, logger: { warn() {} } },
		}),
		journalForwarder: createJournalForwarder({
			ctx: { autumnClient: client, logger: { info() {}, warn() {} }, counters },
		}),
	});
	const peers = ADDRESSES.filter((peer) => peer !== address);
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
			resolver: { peers: async () => peers, forget() {} },
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
				ctx: { resolver: { peers: async () => peers }, own: () => [address] },
			}),
		},
	};
	await auth.slots.processorFor({ customerId }).setSubject({
		customerId,
		body: JSON.stringify({
			...subjectOf(shape, customerId),
			log_offset: "1",
			read_at: 1000,
		}),
	});

	const backgroundIds: string[] = await Bun.file(backgroundPath).json();
	for (const id of backgroundIds)
		await auth.slots.processorFor({ customerId: id }).setSubject({
			customerId: id,
			body: JSON.stringify({
				...backgroundSubjectOf(id),
				log_offset: "1",
				read_at: 1000,
			}),
		});
	let lagMaxMs = 0;
	let lagTotalMs = 0;
	let lagTicks = 0;
	let due = performance.now() + 10;
	setInterval(() => {
		const lag = Math.max(0, performance.now() - due);
		due = performance.now() + 10;
		lagMaxMs = Math.max(lagMaxMs, lag);
		lagTotalMs += lag;
		lagTicks++;
	}, 10);
	const bootedAt = performance.now();
	const stageClockNow = () =>
		readStageClock({ aliveUs: (performance.now() - bootedAt) * 1000 });
	let stageClockAtReset = stageClockNow();
	let cpuAtReset = jsThreadCpuMs();
	let wallAtReset = performance.now();
	let flattensAtReset = fullSubjectRowsMemoStats.builds;
	const reset = () => {
		flattensAtReset = fullSubjectRowsMemoStats.builds;
		stages.clear();
		stageClockAtReset = stageClockNow();
		timedTopLevelMs = 0;
		cpuAtReset = jsThreadCpuMs();
		wallAtReset = performance.now();
		lagMaxMs = 0;
		lagTotalMs = 0;
		lagTicks = 0;
	};
	const app = createAtomApp({ ctx: httpContext });
	const peerApp = createPeerApp({ ctx: httpContext, secret: PEER_SECRET });
	const fastCheck = createFastCheck({ ctx: httpContext as never, app });
	Bun.serve({
		hostname: address,
		port: PORT,
		...(process.env.BENCH_FAST_CHECK && {
			routes: { "/v1/balances.check": { POST: fastCheck } },
		}),
		fetch: (request) => {
			// The checks are POSTs; the bench's own GETs are told apart without parsing a URL on the measured path.
			if (request.method !== "GET")
				return timeStage("honoDispatch", () => app.fetch(request));
			const { pathname } = new URL(request.url);
			if (pathname === "/__bench/reset") {
				reset();
				return new Response(null, { status: 204 });
			}
			if (pathname === "/__bench/stats") {
				const stats = readThreadStats({ buffer: statsBuffer })[0];
				return Response.json({
					address,
					threadCpuMs: jsThreadCpuMs() - cpuAtReset,
					wallMs: performance.now() - wallAtReset,
					timedTopLevelMs,
					stageClockUs: Object.fromEntries(
						Object.entries(stageClockNow()).map(([field, us]) => [
							field,
							us - (stageClockAtReset[field] ?? 0),
						]),
					),
					heapMb: Math.round(heapSize() / 1024 ** 2),
					rowFlattens: fullSubjectRowsMemoStats.builds - flattensAtReset,
					rssMb: Math.round(process.memoryUsage().rss / 1024 ** 2),
					loopLagAvgMs: lagTotalMs / Math.max(1, lagTicks),
					loopLagMaxMs: lagMaxMs,
					stages: Object.fromEntries(stages),
					checks: stats?.checks,
					checksProxied: stats?.checksProxied,
					pushes: stats?.pushes,
					relayed: stats?.relayed,
					relayDropped: stats?.relayDropped,
				});
			}
			return app.fetch(request);
		},
	});
	Bun.serve({
		hostname: address,
		port: PEER_PORT,
		fetch: (request) => timeStage("honoDispatch", () => peerApp.fetch(request)),
	});
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
	shape,
	pushLagMs,
	hopShare,
	readsPerDeduction,
	backgroundCustomers,
	backgroundRate,
}: {
	rate: number;
	seconds: number;
	shape: string;
	pushLagMs: number;
	hopShare: number;
	readsPerDeduction: number;
	backgroundCustomers: number;
	backgroundRate: number;
}) => {
	const ring = createReplicaRing({
		ctx: {
			resolver: { peers: async () => ADDRESSES.slice(1) },
			own: () => ADDRESSES.slice(0, 1),
		},
	});
	let customerId = "cus_hot_0";
	for (let i = 0; (await ring.ownerOf({ customerId })) !== ADDRESSES[0]; i++)
		customerId = `cus_hot_${i}`;
	const [owner, other] = ADDRESSES as [string, string];
	// Background customers the owner thread also holds and serves, as on staging.
	const backgroundIds: string[] = [];
	for (let i = 0; backgroundIds.length < backgroundCustomers; i++) {
		const id = `cus_bg_${i}`;
		if ((await ring.ownerOf({ customerId: id })) === owner)
			backgroundIds.push(id);
	}

	const folder = mkdtempSync(join(tmpdir(), "atom-hot-driver-"));
	const subjectPath = join(folder, "subject.json");
	await Bun.write(subjectPath, JSON.stringify(subjectOf(shape, customerId)));
	const backgroundPath = join(folder, "background.json");
	await Bun.write(backgroundPath, JSON.stringify(backgroundIds));
	const backgroundSubjectPath = join(folder, "background-subject.json");
	await Bun.write(
		backgroundSubjectPath,
		JSON.stringify(backgroundSubjectOf("cus_bg_template")),
	);
	// Herald pushes to the deployment's address, so either replica takes it; this router stands in for that address.
	let routedPushes = 0;
	Bun.serve({
		hostname: "127.0.0.1",
		port: PUSH_ROUTER_PORT,
		fetch: async (request) => {
			routedPushes++;
			const to = ADDRESSES[Math.floor(Math.random() * 2)] as string;
			const reply = await fetch(`http://${to}:${PORT}/v1/subjects.set`, {
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
	const replicas = ADDRESSES.map((address) =>
		Bun.spawn(
			[
				process.execPath,
				"--config=./bunfig.toml",
				...(process.env.BENCH_CPU_PROF && address === ADDRESSES[0]
					? [
							"--cpu-prof",
							"--cpu-prof-md",
							`--cpu-prof-interval=${process.env.BENCH_CPU_PROF_INTERVAL ?? "250"}`,
							`--cpu-prof-dir=${process.env.BENCH_CPU_PROF}`,
						]
					: []),
				import.meta.path,
				"replica",
				address,
				shape,
				customerId,
				backgroundPath,
			],
			{ stdout: "pipe", stderr: "inherit", env: process.env },
		),
	);
	for (const replica of replicas) await waitForReady(replica.stdout);

	const send = (to: string, deducts = true, target = customerId) => {
		const startedAt = performance.now();
		return fetch(`http://${to}:${PORT}/v1/balances.check`, {
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
			await reply.arrayBuffer();
			return { ms: performance.now() - startedAt, ok: reply.status === 200 };
		});
	};
	const warmupMs = pushLagMs + 3_000;
	const totalMs = warmupMs + seconds * 1000;
	const results: Promise<{ ms: number; ok: boolean }>[] = [];
	const readResults: Promise<{ ms: number; ok: boolean }>[] = [];
	const startedAt = performance.now();
	let sent = 0;
	let measuring = false;
	let hopped = 0;
	let backgroundSent = 0;
	while (performance.now() - startedAt < totalMs) {
		const elapsed = performance.now() - startedAt;
		if (!measuring && elapsed >= warmupMs) {
			measuring = true;
			await Promise.all(
				ADDRESSES.map((address) =>
					fetch(`http://${address}:${PORT}/__bench/reset`),
				),
			);
		}
		const due = Math.floor((elapsed / 1000) * rate);
		for (; sent < due; sent++) {
			const hops = Math.random() < hopShare;
			const reply = send(hops ? other : owner);
			const reads = Array.from({ length: readsPerDeduction }, () =>
				send(Math.random() < hopShare ? other : owner, false),
			);
			if (!measuring) continue;
			if (hops) hopped++;
			results.push(reply);
			readResults.push(...reads);
		}
		const backgroundDue = Math.floor((elapsed / 1000) * backgroundRate);
		for (; backgroundSent < backgroundDue; backgroundSent++) {
			const id = backgroundIds[backgroundSent % backgroundIds.length] as string;
			void send(Math.random() < hopShare ? other : owner, true, id);
		}
		await Bun.sleep(1);
	}
	const stats = await Promise.all(
		ADDRESSES.map(async (address) =>
			(await fetch(`http://${address}:${PORT}/__bench/stats`)).json(),
		),
	);
	const settled = await Promise.all(results);
	const readsSettled = await Promise.all(readResults);
	const readSorted = readsSettled.map(({ ms }) => ms).sort((a, b) => a - b);
	const readPct = (p: number) =>
		Number(
			(
				readSorted[
					Math.min(readSorted.length - 1, Math.floor(readSorted.length * p))
				] ?? 0
			).toFixed(1),
		);
	const sorted = settled.map(({ ms }) => ms).sort((a, b) => a - b);
	const pct = (p: number) =>
		Number(
			(
				sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
			).toFixed(1),
		);
	console.log(
		JSON.stringify({
			rate,
			seconds,
			shape,
			pushLagMs,
			hopShare,
			backgroundCustomers,
			backgroundRate,
			backgroundSent,
			deductions: settled.length,
			failed: settled.filter(({ ok }) => !ok).length,
			hopped,
			routedPushes,
			p50Ms: pct(0.5),
			p99Ms: pct(0.99),
			reads: readsSettled.length,
			readsFailed: readsSettled.filter(({ ok }) => !ok).length,
			readP50Ms: readPct(0.5),
			readP99Ms: readPct(0.99),
			owner: stats[0],
			nonOwner: stats[1],
		}),
	);
	for (const replica of replicas) replica.kill("SIGTERM");
	autumn.kill();
	rmSync(folder, { recursive: true, force: true });
	process.exit(0);
};

if (process.argv[2] === "replica")
	await runReplica({
		address: process.argv[3] as string,
		shape: process.argv[4] as string,
		customerId: process.argv[5] as string,
		backgroundPath: process.argv[6] as string,
	});
else
	await drive({
		rate: Number(process.argv[2] ?? 100),
		seconds: Number(process.argv[3] ?? 20),
		shape: process.argv[4] ?? "simple",
		pushLagMs: Number(process.argv[5] ?? 1_500),
		hopShare: Number(process.argv[6] ?? 0.2),
		readsPerDeduction: Number(process.argv[7] ?? 0),
		backgroundCustomers: Number(process.argv[8] ?? 0),
		backgroundRate: Number(process.argv[9] ?? 0),
	});
