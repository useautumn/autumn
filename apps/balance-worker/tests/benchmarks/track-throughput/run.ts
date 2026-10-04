import { performance } from "node:perf_hooks";
import { decideGrantedTrack, type TrackCommand } from "@autumn/balance-engine";
import { WORKER_TRACK_GRANT_LANE_HEADER } from "@autumn/balance-worker-client/protocol";
import { createTrackGrants } from "../../../../../packages/balance-worker-client/src/trackGrants/createTrackGrants.js";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { createBalanceWorkerFetch } from "../../../src/http/fastPath/createBalanceWorkerFetch.js";
import type { BalanceWorkerRequestContext } from "../../../src/http/types/balanceWorkerHttp.js";
import { getBalanceWorkerLogger } from "../../../src/logging/getBalanceWorkerLogger.js";
import {
	createInitializeRequest,
	createTrackCommand,
	testIdentity,
} from "../../fixtures/mutations.js";
import { createBenchProcessor } from "./createBenchProcessor.js";
import { scenarios } from "./scenarios.js";

/** Closed-loop track load against one partition processor: `concurrency` tracks in flight over `customers` customers. */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const scenario = scenarios[args.scenario ?? "typical"];
if (!scenario) throw new Error(`Unknown scenario ${args.scenario}`);
const customers = Number(args.customers ?? 50);
const concurrency = Number(args.concurrency ?? 200);
const total = Number(args.total ?? 20_000);
const warmup = Number(args.warmup ?? 2_000);
const appendMs = Number(args.appendMs ?? 0);
const applyMs = Number(args.applyMs ?? 0);
const serialize = args.serialize !== "false";
/** http: callers race each other; queued: the command consumer, one record awaited at a time per partition;
 *  grants: `lanes` servers answer inside owner grants over the fast path, and the owner applies their queue as runs. */
const mode = args.mode ?? "http";
const lanes = Number(args.lanes ?? 4);

const bench = await createBenchProcessor({
	scenario,
	partition: 0,
	latency: { appendMs, applyMs },
	serialize,
	config: mode === "grants" ? { grantsTracks: true } : {},
});

const identities = Array.from({ length: customers }, (_, i) => ({
	...testIdentity,
	customerId: `cus_${i}`,
}));
for (const [i, identity] of identities.entries()) {
	await bench.processor.initialize({
		request: createInitializeRequest({
			state: scenario.stateFor({ identity }),
			commandId: `init_${i}`,
			requestId: `req_init_${i}`,
		}),
	});
}

/** The worker's real Hono app and logger in front of the processor; only the socket is skipped. */
const runtime: BalanceWorkerRequestContext["runtime"] = {
	process: (run) => run(bench.processor),
};

/** Production samples successful request lines; the default here logs every one. */
const logRate = args.logRate === undefined ? undefined : Number(args.logRate);
const appContext = {
	ownership: { findRuntime: () => runtime },
	partitionResolver: { partitionForIdentity: () => 0 },
	logger: getBalanceWorkerLogger(),
	...(logRate === undefined
		? {}
		: { requestLog: { successSampleRate: logRate } }),
};
const app = createBalanceWorkerApp({ ctx: appContext });
const fastFetch = createBalanceWorkerFetch({ ctx: appContext, app });
const trackOverHttp = async (command: TrackCommand, lane?: string) => {
	const request = new Request("http://worker/v1/track", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(lane ? { [WORKER_TRACK_GRANT_LANE_HEADER]: lane } : {}),
		},
		body: JSON.stringify({
			route: { partition: 0, routeEpoch: "1" },
			command,
		}),
	});
	const response = await (mode === "fast" || mode === "grants"
		? fastFetch(request)
		: app.fetch(request));
	if (response.status !== 200)
		throw new Error(`track ${response.status}: ${await response.text()}`);
	return response.json();
};

let sequence = 0;
const nextCommand = (): TrackCommand => {
	const n = sequence++;
	const identity = identities[n % customers];
	if (!identity) throw new Error("identity");
	return createTrackCommand({
		identity,
		commandId: `trk_${n}`,
		featureId: scenario.features[n % scenario.features.length],
		value: 1,
		occurredAt: 1_700_000_000_000 + n,
	});
};

/** The servers' side of grants mode: their local decisions are timed so the owner's share can be told apart. */
let serverDecideUs = 0;
const laneGrants = Array.from({ length: lanes }, (_, index) =>
	createTrackGrants({
		config: {
			lane: `lane_${index}`,
			maxEntries: 10_000,
			decide: (params) => {
				const started = performance.now();
				try {
					return decideGrantedTrack(params);
				} finally {
					serverDecideUs += (performance.now() - started) * 1000;
				}
			},
		},
	}),
);
const queuedByServers: TrackCommand[] = [];
let consumerOffset = 0;

/** The consumer's S13 shape: consecutive same-subject records as one run, the rest alone. */
const applyQueuedByServers = async () => {
	const commands = queuedByServers.splice(0);
	let index = 0;
	while (index < commands.length) {
		const first = commands[index];
		if (!first) break;
		let end = index + 1;
		while (
			end < commands.length &&
			end - index < 100 &&
			commands[end]?.identity.customerId === first.identity.customerId
		)
			end++;
		const entries = commands.slice(index, end).map((command) => ({
			command,
			source: { commandOffset: String(consumerOffset++) },
		}));
		const outcomes = await bench.processor.executeQueuedTracks({ entries });
		for (const [position, outcome] of outcomes.entries()) {
			const entry = entries[position];
			if (!entry) continue;
			if (outcome.kind === "decided") await outcome.decided.waitForCommit();
			else
				await bench.processor.execute({
					source: entry.source,
					run: (processor) => processor.track({ command: entry.command }),
				});
		}
		index = end;
	}
	return commands.length;
};

/** Commands are built before timing starts, so the fixture's own zod parse is not measured. */
const run = async ({ count }: { count: number }) => {
	const commands = Array.from({ length: count }, nextCommand);
	const latencies: number[] = [];
	let cursor = 0;
	let workers = 0;
	const worker = async () => {
		const lane = workers++ % lanes;
		while (cursor < commands.length) {
			const command = commands[cursor++];
			if (!command) return;
			const started = performance.now();
			if (mode === "grants") {
				await laneGrants[lane]?.answer({
					command,
					send: () => trackOverHttp(command, `lane_${lane}`),
					append: async (leased) => {
						queuedByServers.push(leased);
					},
				});
			} else if (mode === "hono" || mode === "fast")
				await trackOverHttp(command);
			else await bench.processor.track({ command });
			latencies.push(performance.now() - started);
		}
	};
	let commandOffset = 0;
	const queuedWorker = async () => {
		for (const command of commands) {
			const started = performance.now();
			await bench.processor.execute({
				source: { commandOffset: String(commandOffset++) },
				run: (processor) => processor.track({ command }),
			});
			latencies.push(performance.now() - started);
		}
	};
	serverDecideUs = 0;
	const cpuBefore = process.cpuUsage();
	const started = performance.now();
	if (mode === "queued") await queuedWorker();
	else await Promise.all(Array.from({ length: concurrency }, worker));
	const answeredCpu = process.cpuUsage(cpuBefore);
	// Applied after the servers answered, so the owner's ledger cost is measured on its own.
	const applyBefore = process.cpuUsage();
	const leased = await applyQueuedByServers();
	const applyCpu = process.cpuUsage(applyBefore);
	const elapsedMs = performance.now() - started;
	const cpu = process.cpuUsage(cpuBefore);
	const grants =
		mode === "grants"
			? {
					leasedShare: Number((leased / count).toFixed(3)),
					ownerCpuUsPerTrack: Math.round(
						(answeredCpu.user +
							answeredCpu.system -
							serverDecideUs +
							applyCpu.user +
							applyCpu.system) /
							count,
					),
					ownerApplyUsPerLeased: leased
						? Math.round((applyCpu.user + applyCpu.system) / leased)
						: 0,
					serverDecideUsPerLeased: leased
						? Math.round(serverDecideUs / leased)
						: 0,
				}
			: {};
	latencies.sort((a, b) => a - b);
	const pct = (p: number) =>
		latencies[
			Math.min(latencies.length - 1, Math.floor(latencies.length * p))
		] ?? 0;
	return {
		count,
		elapsedMs,
		tracksPerSec: Math.round((count / elapsedMs) * 1000),
		cpuUsPerTrack: Math.round((cpu.user + cpu.system) / count),
		p50: pct(0.5).toFixed(2),
		p99: pct(0.99).toFixed(2),
		...grants,
	};
};

await run({ count: warmup });
const result = await run({ count: total });
console.log(
	JSON.stringify({
		scenario: scenario.name,
		mode,
		customers,
		concurrency,
		appendMs,
		applyMs,
		serialize,
		...result,
		...bench.stats(),
	}),
);
await bench.processor.drain();
process.exit(0);
