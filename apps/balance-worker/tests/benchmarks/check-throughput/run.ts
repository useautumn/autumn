import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { CheckCommand } from "@autumn/balance-engine";
import { scenarios } from "../track-throughput/scenarios.js";
import {
	benchIdentityOf,
	createBenchCheckCommand,
	createCheckBench,
} from "./createCheckBench.js";

/**
 * Closed-loop plain checks against one resident customer, the hot prod pattern:
 * one (entity, feature, required balance) asked over and over with no writes between.
 *
 *   processor  processor.check, no HTTP
 *   hono       the worker's real Hono app in process (parse, route, process, c.json, 5% log)
 *   socket     the same app on Bun.serve pinned to one core; this client on another
 *
 * Reports the median of `--runs` measured runs; the result line goes to stderr, logs to stdout.
 */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const scenarioName = args.scenario ?? "typical";
const scenario = scenarios[scenarioName];
if (!scenario) throw new Error(`Unknown scenario ${scenarioName}`);
const mode = args.mode ?? "processor";
/** 0 checks the customer itself; n spreads the checks over n of its entities. */
const entities = Number(args.entities ?? 1);
/** How many of the scenario's features the checks rotate over. */
const features = Number(args.features ?? 1);
const concurrency = Number(args.concurrency ?? (mode === "socket" ? 32 : 64));
const total = Number(args.total ?? (mode === "socket" ? 20_000 : 40_000));
const warmup = Number(args.warmup ?? 5_000);
const runs = Number(args.runs ?? 5);
const serverCore = args.serverCore ?? "1";
const clientCores = args.clientCores ?? "0";

const identities =
	entities === 0
		? [benchIdentityOf({ entityId: null })]
		: Array.from({ length: entities }, (_, i) =>
				benchIdentityOf({ entityId: `ent_${i}` }),
			);
const featureIds = scenario.features.slice(0, Math.max(features, 1));

let sequence = 0;
const nextCommand = (): CheckCommand => {
	const n = sequence++;
	const identity = identities[n % identities.length];
	const featureId = featureIds[n % featureIds.length];
	if (!identity || !featureId) throw new Error("bench fixture");
	return createBenchCheckCommand({ identity, featureId, sequence: n });
};
const requestBodyOf = (command: CheckCommand) =>
	JSON.stringify({ route: { partition: 0, routeEpoch: "1" }, command });
/** The headers the server's client sends: a 1 s budget, and the moment it runs out. */
const requestHeadersOf = () => ({
	"content-type": "application/json",
	"x-request-budget-ms": "1000",
	"x-request-deadline-at": String(Date.now() + 1000),
});

type Sender = (command: CheckCommand) => Promise<void>;
type CpuClock = () => number;

const processCpuMicros: CpuClock = () => {
	const usage = process.cpuUsage();
	return usage.user + usage.system;
};

const assertOk = async (response: Response) => {
	if (response.status !== 200)
		throw new Error(`check ${response.status}: ${await response.text()}`);
	await response.arrayBuffer();
};

const setUp = async (): Promise<{
	send: Sender;
	cpuMicros: CpuClock;
	stop(): void;
}> => {
	if (mode === "socket") return setUpSocket();
	const { processor, app } = await createCheckBench({ scenario });
	if (mode === "processor")
		return {
			send: async (command) => {
				await processor.check({ command });
			},
			cpuMicros: processCpuMicros,
			stop: () => undefined,
		};
	if (mode !== "hono") throw new Error(`Unknown mode ${mode}`);
	return {
		send: async (command) =>
			assertOk(
				await app.request("/v1/check", {
					method: "POST",
					headers: requestHeadersOf(),
					body: requestBodyOf(command),
				}),
			),
		cpuMicros: processCpuMicros,
		stop: () => undefined,
	};
};

/** Server CPU from /proc, so the client's own cost never counts against the worker. */
const setUpSocket = async () => {
	Bun.spawnSync(["taskset", "-p", "-c", clientCores, String(process.pid)]);
	const server = Bun.spawn(
		[
			"taskset",
			"-c",
			serverCore,
			process.execPath,
			"--config=./bunfig.toml",
			`${import.meta.dir}/serveCheckBench.ts`,
		],
		{
			env: { ...process.env, CHECK_BENCH_SCENARIO: scenarioName },
			stdout: "ignore",
			stderr: "pipe",
		},
	);
	const port = await readReadyPort({ stream: server.stderr });
	const ticksPerSecond = 100;
	const cpuMicros = () => {
		const fields = readFileSync(`/proc/${server.pid}/stat`, "utf8")
			.split(") ")[1]
			?.split(" ");
		const utime = Number(fields?.[11]);
		const stime = Number(fields?.[12]);
		return ((utime + stime) / ticksPerSecond) * 1_000_000;
	};
	const url = `http://127.0.0.1:${port}/v1/check`;
	return {
		send: async (command: CheckCommand) =>
			assertOk(
				await fetch(url, {
					method: "POST",
					headers: requestHeadersOf(),
					body: requestBodyOf(command),
				}),
			),
		cpuMicros,
		stop: () => server.kill(),
	};
};

const readReadyPort = async ({
	stream,
}: {
	stream: ReadableStream<Uint8Array>;
}): Promise<number> => {
	const decoder = new TextDecoder();
	let seen = "";
	for await (const chunk of stream) {
		seen += decoder.decode(chunk);
		const match = seen.match(/READY (\d+)/);
		if (match) return Number(match[1]);
	}
	throw new Error(`bench server exited: ${seen}`);
};

const measure = async ({
	send,
	cpuMicros,
	count,
}: {
	send: Sender;
	cpuMicros: CpuClock;
	count: number;
}) => {
	const latencies: number[] = [];
	let issued = 0;
	const worker = async () => {
		while (issued < count) {
			issued++;
			const command = nextCommand();
			const started = performance.now();
			await send(command);
			latencies.push(performance.now() - started);
		}
	};
	const cpuBefore = cpuMicros();
	const started = performance.now();
	await Promise.all(Array.from({ length: concurrency }, worker));
	const elapsedMs = performance.now() - started;
	const cpuUsPerCheck = (cpuMicros() - cpuBefore) / count;
	latencies.sort((a, b) => a - b);
	const percentile = (p: number) =>
		latencies[
			Math.min(latencies.length - 1, Math.floor(latencies.length * p))
		] ?? 0;
	return {
		cpuUsPerCheck,
		rps: (count / elapsedMs) * 1000,
		p50Ms: percentile(0.5),
		p99Ms: percentile(0.99),
	};
};

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const bench = await setUp();
await measure({ ...bench, count: warmup });
const samples = [];
for (let run = 0; run < runs; run++)
	samples.push(await measure({ ...bench, count: total }));
bench.stop();

const cpuUsPerCheck = median(samples.map((sample) => sample.cpuUsPerCheck));
console.error(
	JSON.stringify({
		scenario: scenarioName,
		mode,
		entities,
		features,
		concurrency,
		runs,
		cpuUsPerCheck: Number(cpuUsPerCheck.toFixed(1)),
		checksPerCoreSec: Math.round(1_000_000 / cpuUsPerCheck),
		rps: Math.round(median(samples.map((sample) => sample.rps))),
		p50Ms: Number(median(samples.map((sample) => sample.p50Ms)).toFixed(2)),
		p99Ms: Number(median(samples.map((sample) => sample.p99Ms)).toFixed(2)),
		cpuUsSamples: samples.map((sample) =>
			Number(sample.cpuUsPerCheck.toFixed(1)),
		),
	}),
);
process.exit(0);
