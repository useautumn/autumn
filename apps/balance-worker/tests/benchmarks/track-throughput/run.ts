import { performance } from "node:perf_hooks";
import type { TrackCommand } from "@autumn/balance-engine";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
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
/** http: callers race each other; queued: the command consumer, one record awaited at a time per partition. */
const mode = args.mode ?? "http";

const bench = await createBenchProcessor({
	scenario,
	partition: 0,
	latency: { appendMs, applyMs },
	serialize,
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
const app = createBalanceWorkerApp({
	ctx: {
		ownership: {
			findRuntime: () => ({
				process: (run) => run(bench.processor),
			}),
		},
		partitionResolver: { partitionForIdentity: () => 0 },
		logger: getBalanceWorkerLogger(),
	} as unknown as Parameters<typeof createBalanceWorkerApp>[0]["ctx"],
});
const trackOverHttp = async (command: TrackCommand) => {
	const response = await app.request("/v1/track", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			route: { partition: 0, routeEpoch: "1" },
			command,
		}),
	});
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

/** Commands are built before timing starts, so the fixture's own zod parse is not measured. */
const run = async ({ count }: { count: number }) => {
	const commands = Array.from({ length: count }, nextCommand);
	const latencies: number[] = [];
	let cursor = 0;
	const worker = async () => {
		while (cursor < commands.length) {
			const command = commands[cursor++];
			if (!command) return;
			const started = performance.now();
			if (mode === "hono") await trackOverHttp(command);
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
	const cpuBefore = process.cpuUsage();
	const started = performance.now();
	if (mode === "queued") await queuedWorker();
	else await Promise.all(Array.from({ length: concurrency }, worker));
	const elapsedMs = performance.now() - started;
	const cpu = process.cpuUsage(cpuBefore);
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
