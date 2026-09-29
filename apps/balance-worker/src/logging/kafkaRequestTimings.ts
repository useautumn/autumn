import type { KafkaRequestTiming } from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";

export type KafkaRequestSummary = {
	api: string;
	count: number;
	/** Samples the percentiles come from; below `count` once the reservoir is full. */
	sampled: number;
	p50: number;
	p90: number;
	p99: number;
	max: number;
	/** Time queued in the client before sending, which a slow broker does not explain. */
	pendingP99: number;
	/** The broker with the highest median, so one bad coordinator stands out. */
	slowestBroker?: { broker: string; count: number; p50: number };
};

type ApiWindow = {
	count: number;
	max: number;
	durations: number[];
	pendings: number[];
	byBroker: Map<string, { count: number; durations: number[] }>;
};

const DEFAULT_MAX_SAMPLES_PER_API = 2_000;
const MAX_SAMPLES_PER_BROKER = 500;

/**
 * Per-API timings of every broker request the partition producers make, so the
 * commit's latency can be split into its round trips (AddPartitionsToTxn,
 * Produce, AddOffsetsToTxn, TxnOffsetCommit, EndTxn) and a slow coordinator
 * shows up by name. Reservoir-sampled so a busy window costs bounded memory.
 */
export function createKafkaRequestTimings({
	maxSamplesPerApi = DEFAULT_MAX_SAMPLES_PER_API,
}: {
	maxSamplesPerApi?: number;
} = {}) {
	let windows = new Map<string, ApiWindow>();

	function record(timing: KafkaRequestTiming): void {
		const window = windows.get(timing.apiName) ?? {
			count: 0,
			max: 0,
			durations: [],
			pendings: [],
			byBroker: new Map(),
		};
		windows.set(timing.apiName, window);
		window.count += 1;
		window.max = Math.max(window.max, timing.durationMs);
		sampleInto({
			samples: window.durations,
			value: timing.durationMs,
			seen: window.count,
			limit: maxSamplesPerApi,
		});
		sampleInto({
			samples: window.pendings,
			value: timing.pendingMs,
			seen: window.count,
			limit: maxSamplesPerApi,
		});
		const broker = window.byBroker.get(timing.broker) ?? {
			count: 0,
			durations: [],
		};
		window.byBroker.set(timing.broker, broker);
		broker.count += 1;
		sampleInto({
			samples: broker.durations,
			value: timing.durationMs,
			seen: broker.count,
			limit: MAX_SAMPLES_PER_BROKER,
		});
	}

	function drain(): KafkaRequestSummary[] {
		const drained = windows;
		windows = new Map();
		const summaries: KafkaRequestSummary[] = [];
		for (const [api, window] of drained) {
			const durations = [...window.durations].sort((a, b) => a - b);
			const pendings = [...window.pendings].sort((a, b) => a - b);
			let slowestBroker: KafkaRequestSummary["slowestBroker"];
			for (const [broker, stats] of window.byBroker) {
				const p50 = percentileOf({
					sorted: [...stats.durations].sort((a, b) => a - b),
					fraction: 0.5,
				});
				if (!slowestBroker || p50 > slowestBroker.p50)
					slowestBroker = { broker, count: stats.count, p50 };
			}
			summaries.push({
				api,
				count: window.count,
				sampled: durations.length,
				p50: percentileOf({ sorted: durations, fraction: 0.5 }),
				p90: percentileOf({ sorted: durations, fraction: 0.9 }),
				p99: percentileOf({ sorted: durations, fraction: 0.99 }),
				max: window.max,
				pendingP99: percentileOf({ sorted: pendings, fraction: 0.99 }),
				slowestBroker,
			});
		}
		return summaries;
	}

	return { record, drain };
}

/** The process's timings: every partition producer on this worker reports into one. */
export const kafkaRequestTimings = createKafkaRequestTimings();

function sampleInto({
	samples,
	value,
	seen,
	limit,
}: {
	samples: number[];
	value: number;
	seen: number;
	limit: number;
}): void {
	if (samples.length < limit) {
		samples.push(value);
		return;
	}
	const slot = Math.floor(Math.random() * seen);
	if (slot < limit) samples[slot] = value;
}

function percentileOf({
	sorted,
	fraction,
}: {
	sorted: number[];
	fraction: number;
}): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(fraction * sorted.length) - 1),
	);
	return sorted[index] ?? 0;
}

const REQUEST_REPORT_INTERVAL_MS = 10_000;

/** Logs one `balance_worker.kafka_requests` line per Kafka API every ten seconds. */
export function createKafkaRequestReporter({
	ctx,
	config,
}: {
	ctx: {
		logger: Pick<AutumnLogger, "info">;
		timings: Pick<ReturnType<typeof createKafkaRequestTimings>, "drain">;
	};
	config: { deployment: string; endpoint: string };
}): { start(): void; stop(): void } {
	let timer: ReturnType<typeof setInterval> | undefined;

	function report(): void {
		try {
			for (const summary of ctx.timings.drain()) {
				ctx.logger.info(
					{
						event: "balance_worker.kafka_requests",
						workerDeployment: config.deployment,
						data: { workerEndpoint: config.endpoint, ...summary },
					},
					`Kafka ${summary.api}: ${summary.count} requests, p50 ${summary.p50}ms p99 ${summary.p99}ms`,
				);
			}
		} catch {
			// Telemetry must never disturb the worker.
		}
	}

	function start(): void {
		if (timer) return;
		ctx.timings.drain();
		timer = setInterval(report, REQUEST_REPORT_INTERVAL_MS);
		timer.unref();
	}

	function stop(): void {
		if (timer) clearInterval(timer);
		timer = undefined;
	}

	return { start, stop };
}
