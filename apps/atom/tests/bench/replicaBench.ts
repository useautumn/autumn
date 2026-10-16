/**
 * A pair of single-thread replicas in their own processes, each with its own public and peer port, driven over HTTP with
 * the load test's mix: deductions, twice as many reads, a share sent to the replica that does not own the customer, and
 * Autumn pushing each deducted subject back (feedbackAutumn.ts). Only what is sent after `measureAfter` seconds counts.
 * `bun run bench:replicas <deductionsPerSecond> <seconds> [hopShare] [slots] [measureAfter]`.
 */
import { heapSize } from "bun:jsc";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LATEST_VERSION } from "@autumn/shared";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createState,
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
	createThreadStatsBuffer,
	openThreadCounters,
	readThreadStats,
} from "../../src/threads/stats/threadStats.js";
import { allSlotsOwnedHere, atomOrg } from "../unit/utils/atomFixtures.js";

const ATOM_TOKEN = "atom_token_bench";
const PEER_SECRET = "p".repeat(64);
const PORT = 18_080;
const PEER_PORT = 18_081;
const AUTUMN_PORT = 18_777;
const ADDRESSES = ["127.0.0.11", "127.0.0.12"];
const CUSTOMERS = 5_000;
const BALANCES = 40;
const READS_PER_DEDUCTION = 2;

const customerIds = Array.from({ length: CUSTOMERS }, (_, i) => `cus_${i}`);

/** Every customer's subject as Autumn first sends it: 40 balances, the catalog they reference, the org. */
const templateSubject = () => {
	const state = createState({
		customerEntitlements: Array.from({ length: BALANCES }, (_, i) =>
			createCustomerEntitlement({
				id: i === 0 ? "messages_monthly" : `feature_${i}_monthly`,
				featureId: i === 0 ? "messages" : `feature_${i}`,
				balance: 1_000_000_000,
			}),
		),
	});
	return { state, catalog: createCatalogFor({ state }), org: atomOrg };
};

/** One replica: the Atom's own apps over a deployed folder, every customer held, its journal forwarded to the fake Autumn. */
const runReplica = async ({
	address,
	slots,
}: {
	address: string;
	slots: number;
}) => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-bench-replica-"));
	const statsBuffer = createThreadStatsBuffer({ threads: 1 });
	const counters = openThreadCounters({ buffer: statsBuffer, index: 0 });
	let appendCalls = 0;
	let tracksSent = 0;
	const client = createAutumnClient({
		autumnApiUrl: `http://127.0.0.1:${AUTUMN_PORT}`,
	});
	const auth = createDeployedAuth({
		dataDir,
		tokenHash: hashToken({ token: ATOM_TOKEN }),
		slotCount: slots,
		owners: allSlotsOwnedHere,
		held: createHeldSubjects({ budgetBytes: 2 * 1024 ** 3 }),
		subjectPulls: createSubjectPulls({
			ctx: { autumnClient: client, counters, logger: { warn() {} } },
		}),
		journalForwarder: createJournalForwarder({
			ctx: {
				autumnClient: {
					appendTracks: (params) => {
						appendCalls++;
						tracksSent += params.tracks.length;
						return client.appendTracks(params);
					},
				},
				logger: { info() {}, warn() {} },
				counters,
			},
		}),
	});
	const peers = ADDRESSES.filter((peer) => peer !== address);
	const registry = createHandlerRegistry();
	registry.register(SUBJECT_PUSH);
	registry.register(CATALOG_PUSH);
	// A push lands on one replica and reaches the other through its peer outbox, as on a deployment.
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
	const { state, catalog } = templateSubject();
	for (const customerId of customerIds) {
		const processor = auth.slots.processorFor({ customerId });
		await processor.setSubject({
			customerId,
			body: JSON.stringify({
				state: { ...state, identity: { ...state.identity, customerId } },
				catalog,
				org: atomOrg,
				log_offset: "1",
				read_at: 1000,
			}),
		});
	}

	let lagMaxMs = 0;
	let lagTotalMs = 0;
	let lagTicks = 0;
	let due = performance.now() + 10;
	/** Ticks 50 ms or more late. */
	let stalls = 0;
	setInterval(() => {
		const lag = Math.max(0, performance.now() - due);
		due = performance.now() + 10;
		lagMaxMs = Math.max(lagMaxMs, lag);
		lagTotalMs += lag;
		lagTicks++;
		if (lag >= 50) stalls++;
	}, 10);
	let cpuAtReset = process.cpuUsage();
	let resetAt = performance.now();
	const statsOf = () => {
		const cpu = process.cpuUsage(cpuAtReset);
		const stats = readThreadStats({ buffer: statsBuffer })[0];
		return {
			address,
			cpuMs: (cpu.user + cpu.system) / 1000,
			coresUsed: (cpu.user + cpu.system) / 1000 / (performance.now() - resetAt),
			loopLagAvgMs: lagTotalMs / Math.max(1, lagTicks),
			loopLagMaxMs: lagMaxMs,
			checks: stats?.checks,
			checksProxied: stats?.checksProxied,
			stalls,
			heapMb: Math.round(heapSize() / 1024 ** 2),
			pushes: stats?.pushes,
			relayed: stats?.relayed,
			relayDropped: stats?.relayDropped,
			subjectPulls: stats?.subjectPulls,
			appendCalls,
			tracksPerAppend: appendCalls ? tracksSent / appendCalls : null,
		};
	};
	const app = createAtomApp({ ctx: httpContext });
	const peerApp = createPeerApp({ ctx: httpContext, secret: PEER_SECRET });
	Bun.serve({
		hostname: address,
		port: PORT,
		fetch: (request) => {
			const { pathname } = new URL(request.url);
			if (pathname === "/__bench/stats") return Response.json(statsOf());
			if (pathname === "/__bench/reset") {
				cpuAtReset = process.cpuUsage();
				resetAt = performance.now();
				lagMaxMs = 0;
				stalls = 0;
				lagTotalMs = 0;
				lagTicks = 0;
				appendCalls = 0;
				tracksSent = 0;
				return new Response(null, { status: 204 });
			}
			return app.fetch(request);
		},
	});
	Bun.serve({ hostname: address, port: PEER_PORT, fetch: peerApp.fetch });
	process.on("SIGTERM", () => {
		rmSync(dataDir, { recursive: true, force: true });
		process.exit(0);
	});
	console.log("ready");
};

/** Until the process prints "ready" on stdout. */
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

const percentile = (sorted: number[], p: number) =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

/** Starts the fake Autumn and both replicas, warms every view, then sends the mix at a fixed rate and reads back the cost. */
const drive = async ({
	rate,
	seconds,
	hopShare,
	slots,
	measureAfter,
}: {
	rate: number;
	seconds: number;
	hopShare: number;
	slots: number;
	measureAfter: number;
}) => {
	const templatePath = join(
		mkdtempSync(join(tmpdir(), "atom-bench-autumn-")),
		"subject.json",
	);
	await Bun.write(templatePath, JSON.stringify(templateSubject()));
	const autumn = Bun.spawn(
		[
			"bun",
			join(import.meta.dir, "feedbackAutumn.ts"),
			String(AUTUMN_PORT),
			ATOM_TOKEN,
			ADDRESSES.map((address) => `${address}:${PORT}`).join(","),
			templatePath,
		],
		{ stdout: "pipe", stderr: "inherit" },
	);
	await waitForReady(autumn.stdout);
	const replicas = ADDRESSES.map((address) =>
		Bun.spawn(
			[
				"bun",
				"--config=./bunfig.toml",
				// Each replica's CPU profile, written as it exits, when asked for.
				...(process.env.BENCH_PROF_DIR
					? ["--cpu-prof", `--cpu-prof-dir=${process.env.BENCH_PROF_DIR}`]
					: []),
				import.meta.path,
				"replica",
				address,
				String(slots),
			],
			{ stdout: "pipe", stderr: "inherit", env: process.env },
		),
	);
	for (const replica of replicas) await waitForReady(replica.stdout);
	const ring = createReplicaRing({
		ctx: {
			resolver: { peers: async () => ADDRESSES.slice(1) },
			own: () => ADDRESSES.slice(0, 1),
		},
	});
	const ownerOf = new Map<string, string>();
	for (const customerId of customerIds)
		ownerOf.set(customerId, await ring.ownerOf({ customerId }));
	const send = (customerId: string, deducts: boolean) => {
		const owner = ownerOf.get(customerId) as string;
		const hops = Math.random() < hopShare;
		const to = hops ? (ADDRESSES.find((a) => a !== owner) as string) : owner;
		const startedAt = performance.now();
		return fetch(`http://${to}:${PORT}/v1/balances.check`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-atom-token": ATOM_TOKEN,
				"x-api-version": LATEST_VERSION,
			},
			body: JSON.stringify({
				customer_id: customerId,
				feature_id: "messages",
				...(deducts && { send_event: true }),
			}),
		}).then(async (reply) => {
			await reply.arrayBuffer();
			return { ms: performance.now() - startedAt, ok: reply.status === 200 };
		});
	};
	for (const customerId of customerIds) await send(customerId, false);
	const resetStats = () =>
		Promise.all(
			ADDRESSES.map((address) =>
				fetch(`http://${address}:${PORT}/__bench/reset`),
			),
		);
	await resetStats();
	let measuring = measureAfter === 0;

	const deductions: Promise<{ ms: number; ok: boolean }>[] = [];
	const reads: Promise<{ ms: number; ok: boolean }>[] = [];
	const total = rate * seconds;
	const startedAt = performance.now();
	let sent = 0;
	while (sent < total) {
		const due = Math.min(
			total,
			Math.floor(((performance.now() - startedAt) / 1000) * rate),
		);
		if (!measuring && performance.now() - startedAt >= measureAfter * 1000) {
			measuring = true;
			await resetStats();
		}
		for (; sent < due; sent++) {
			const deduction = send(customerIds[sent % CUSTOMERS] as string, true);
			const sentReads = Array.from({ length: READS_PER_DEDUCTION }, (_, r) =>
				send(customerIds[(sent * 7 + r * 13) % CUSTOMERS] as string, false),
			);
			if (!measuring) continue;
			deductions.push(deduction);
			reads.push(...sentReads);
		}
		await Bun.sleep(1);
	}
	const latencies = (results: { ms: number; ok: boolean }[]) => {
		const sorted = results.map(({ ms }) => ms).sort((a, b) => a - b);
		return {
			calls: results.length,
			failed: results.filter(({ ok }) => !ok).length,
			p50Ms: Number(percentile(sorted, 0.5).toFixed(1)),
			p99Ms: Number(percentile(sorted, 0.99).toFixed(1)),
		};
	};
	const deducted = latencies(await Promise.all(deductions));
	const read = latencies(await Promise.all(reads));
	await Bun.sleep(200);
	const perReplica = await Promise.all(
		ADDRESSES.map(async (address) =>
			(await fetch(`http://${address}:${PORT}/__bench/stats`)).json(),
		),
	);
	const cpuMs = perReplica.reduce((sum, { cpuMs }) => sum + cpuMs, 0);
	console.log(
		JSON.stringify(
			{
				rate,
				seconds,
				measuredSeconds: seconds - measureAfter,
				hopShare,
				slots,
				autumn: await (
					await fetch(`http://127.0.0.1:${AUTUMN_PORT}/__counts`)
				).json(),
				deductions: deducted,
				reads: read,
				cpuMsPerCall: Number(
					(cpuMs / (deducted.calls + read.calls)).toFixed(3),
				),
				replicas: perReplica.map((stats) => ({
					...stats,
					cpuMs: Math.round(stats.cpuMs),
					coresUsed: Number(stats.coresUsed.toFixed(2)),
					loopLagAvgMs: Number(stats.loopLagAvgMs.toFixed(1)),
					loopLagMaxMs: Math.round(stats.loopLagMaxMs),
					tracksPerAppend:
						stats.tracksPerAppend === null
							? null
							: Number(stats.tracksPerAppend.toFixed(1)),
				})),
			},
			null,
			1,
		),
	);
	for (const replica of replicas) replica.kill("SIGTERM");
	autumn.kill();
	process.exit(0);
};

if (process.argv[2] === "replica")
	await runReplica({
		address: process.argv[3] as string,
		slots: Number(process.argv[4]),
	});
else
	await drive({
		rate: Number(process.argv[2] ?? 300),
		seconds: Number(process.argv[3] ?? 20),
		hopShare: Number(process.argv[4] ?? 0.2),
		slots: Number(process.argv[5] ?? 43),
		measureAfter: Number(process.argv[6] ?? 0),
	});
