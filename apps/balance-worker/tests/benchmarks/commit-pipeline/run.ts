import { performance } from "node:perf_hooks";
import type { StagingArm } from "@autumn/edge-config";
import { COMMIT_DEPTH_EXPERIMENT } from "../../../src/experiments/commitDepth.js";
import { COMMIT_PIPELINE_EXPERIMENT } from "../../../src/experiments/commitPipeline.js";
import { createPartitionCommitLogging } from "../../../src/logging/createPartitionCommitLogging.js";
import { getBalanceWorkerLogger } from "../../../src/logging/getBalanceWorkerLogger.js";
import {
	createInitializeRequest,
	createTrackCommand,
	testIdentity,
} from "../../fixtures/mutations.js";
import { forceStagingArm } from "../../fixtures/stagingArms.js";
import { createBenchProcessor } from "../track-throughput/createBenchProcessor.js";
import { scenarios } from "../track-throughput/scenarios.js";

/**
 * Open-loop sync tracks on one partition through the worker's commit logging, with Kafka and Postgres
 * latency simulated: what each arm of `--experiment` (commit-pipeline, or commit-depth) does to track
 * latency, commits/s, flushes/s and CPU. Results go to stderr; stdout carries the worker's own log lines, as on a task.
 */
type LoggedStateStore = Parameters<
	typeof createPartitionCommitLogging
>[0]["ctx"]["stateStore"];

const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const arm = (args.arm ?? "A") as StagingArm;
const experiment =
	args.experiment === COMMIT_DEPTH_EXPERIMENT
		? COMMIT_DEPTH_EXPERIMENT
		: COMMIT_PIPELINE_EXPERIMENT;
const rate = Number(args.rate ?? 500);
const batch = Number(args.batch ?? 500);
const seconds = Number(args.seconds ?? 6);
const appendMs = Number(args.appendMs ?? 4);
const applyMs = Number(args.applyMs ?? 45);
const scenario = scenarios.typical;
if (!scenario) throw new Error("scenario");

forceStagingArm({ experiment, arm });
let commits = 0;
let flushes = 0;
let logLines = 0;
const logger = getBalanceWorkerLogger();
const bench = await createBenchProcessor({
	scenario,
	partition: 0,
	latency: { appendMs, applyMs },
	serialize: true,
	// The worker's own: 500 records a commit, a 5 ms linger on a busy partition, two appends in flight under commit-depth B.
	limits: { maxBatchSize: batch, commitLingerMs: 5, commitPipelineDepth: 2 },
	instrument: (ports) => {
		const counted = {
			appender: {
				...ports.appender,
				appendCommitted: (
					params: Parameters<typeof ports.appender.appendCommitted>[0],
				) => {
					commits++;
					return ports.appender.appendCommitted(params);
				},
			},
			stateStore: {
				...ports.stateStore,
				applyDurableMutations: (
					params: Parameters<typeof ports.stateStore.applyDurableMutations>[0],
				) => {
					flushes++;
					return ports.stateStore.applyDurableMutations(params);
				},
			},
		};
		const logged = createPartitionCommitLogging({
			ctx: {
				appender: counted.appender,
				// The bench store reads no offsets; commit logging only forwards the call.
				stateStore: {
					...counted.stateStore,
					readNextOffset: () => null,
				} as unknown as LoggedStateStore,
				logger: {
					debug: (...line: Parameters<typeof logger.debug>) => {
						logLines++;
						logger.debug(...line);
					},
					info: (...line: Parameters<typeof logger.info>) => {
						logLines++;
						logger.info(...line);
					},
					error: logger.error.bind(logger),
				},
			},
			config: { deployment: "bench", endpoint: "http://bench" },
		});
		return {
			appender: logged.appender,
			stateStore: logged.stateStore as typeof ports.stateStore,
		};
	},
});
const identity = { ...testIdentity, customerId: "cus_hot" };
await bench.processor.initialize({
	request: createInitializeRequest({
		state: scenario.stateFor({ identity }),
		commandId: "init",
		requestId: "req_init",
	}),
});

let sequence = 0;
async function runFor(durationMs: number) {
	const latencies: number[] = [];
	const inFlight: Promise<void>[] = [];
	const startedAt = performance.now();
	const intervalMs = 1_000 / rate;
	let next = startedAt;
	while (performance.now() - startedAt < durationMs) {
		const now = performance.now();
		while (next <= now) {
			const n = sequence++;
			const command = createTrackCommand({
				identity,
				commandId: `trk_${n}`,
				featureId: scenario.features[n % scenario.features.length],
				value: 1,
				occurredAt: 1_700_000_000_000 + n,
			});
			const sentAt = performance.now();
			inFlight.push(
				bench.processor.track({ command }).then(() => {
					latencies.push(performance.now() - sentAt);
				}),
			);
			next += intervalMs;
		}
		const waitMs = Math.max(1, next - performance.now());
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}
	await Promise.all(inFlight);
	return latencies;
}

await runFor(1_000);
commits = 0;
flushes = 0;
logLines = 0;
const cpuBefore = process.cpuUsage();
const startedAt = performance.now();
const latencies = await runFor(seconds * 1_000);
await bench.processor.drain?.();
const elapsedS = (performance.now() - startedAt) / 1_000;
const cpu = process.cpuUsage(cpuBefore);
latencies.sort((a, b) => a - b);
const pct = (p: number) =>
	latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ??
	0;
console.error(
	JSON.stringify({
		experiment,
		arm,
		rate,
		batch,
		appendMs,
		applyMs,
		tracks: latencies.length,
		p50Ms: Number(pct(0.5).toFixed(2)),
		p99Ms: Number(pct(0.99).toFixed(2)),
		commitsPerS: Math.round(commits / elapsedS),
		flushesPerS: Math.round(flushes / elapsedS),
		logLinesPerS: Math.round(logLines / elapsedS),
		cpuMsPerS: Math.round((cpu.user + cpu.system) / 1_000 / elapsedS),
		cpuUsPerTrack: Math.round((cpu.user + cpu.system) / latencies.length),
	}),
);
process.exit(0);
