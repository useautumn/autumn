import { logger } from "@/external/logtail/logtailUtils.js";
import {
	type InFlightRequestSummary,
	listInFlightRequests,
} from "./inFlightRequests.js";

/** arrayBuffers separates transport/buffer growth from ordinary object churn. */
export type MemorySnapshotMB = {
	rssMB: number;
	heapUsedMB: number;
	heapTotalMB: number;
	externalMB: number;
	arrayBuffersMB: number;
};

export type MemorySpikeReport = MemorySnapshotMB & {
	inFlightCount: number;
	requests: InFlightRequestSummary[];
};

const DEFAULT_CEILING_MB = 4500;
const DEFAULT_RISE_MB = 1500;
const DEFAULT_BASELINE_SAMPLES = 30;
const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_MAX_REPORTS = 3;
const MAX_REQUESTS_LOGGED = 20;

const toMB = (bytes: number): number =>
	Math.round((bytes / 1024 / 1024) * 10) / 10;

/**
 * Fires on a rapid RISE above the recent baseline, not just an absolute size —
 * a process going 2GB to 4.4GB is the event; a steadily fat one is not.
 */
export const createMemorySpikeProbe = ({
	readMemoryMB,
	listInFlightRequests: readInFlight,
	report,
	ceilingMB,
	riseMB,
	baselineSamples,
	maxReports,
	maxRequestsLogged,
}: {
	readMemoryMB: () => MemorySnapshotMB;
	listInFlightRequests: () => InFlightRequestSummary[];
	report: (payload: MemorySpikeReport) => void;
	ceilingMB: number;
	riseMB: number;
	baselineSamples: number;
	maxReports: number;
	maxRequestsLogged: number;
}) => {
	let armed = true;
	let reportsSent = 0;
	const history: number[] = [];

	const sample = () => {
		const memory = readMemoryMB();
		const baselineMB = history.length ? Math.min(...history) : memory.rssMB;

		history.push(memory.rssMB);
		if (history.length > baselineSamples) history.shift();

		const spiking =
			memory.rssMB - baselineMB >= riseMB || memory.rssMB >= ceilingMB;

		// Re-arm as soon as the condition clears, so one event yields one report.
		if (!spiking) armed = true;
		if (!(spiking && armed) || reportsSent >= maxReports) return;

		armed = false;
		reportsSent += 1;

		const requests = readInFlight();
		const longestRunning = [...requests]
			.sort((a, b) => b.elapsedMs - a.elapsedMs)
			.slice(0, maxRequestsLogged);

		report({
			...memory,
			inFlightCount: requests.length,
			requests: longestRunning,
		});
	};

	return { sample };
};

const readEnvNumber = ({
	name,
	fallback,
}: {
	name: string;
	fallback: number;
}): number => {
	const raw = process.env[name];
	if (!raw) return fallback;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
};

/** A non-positive interval would clamp to a ~1ms sampling loop. */
const readIntervalMs = (): number => {
	const parsed = readEnvNumber({
		name: "MEMORY_SPIKE_PROBE_INTERVAL_MS",
		fallback: DEFAULT_INTERVAL_MS,
	});
	return parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Set MEMORY_SPIKE_PROBE_MB to 0 to disable. */
export const startMemorySpikeProbe = ({ label }: { label: string }) => {
	const ceilingMB = readEnvNumber({
		name: "MEMORY_SPIKE_PROBE_MB",
		fallback: DEFAULT_CEILING_MB,
	});
	if (ceilingMB <= 0) return;

	const probe = createMemorySpikeProbe({
		readMemoryMB: () => {
			const memory = process.memoryUsage();
			return {
				rssMB: toMB(memory.rss),
				heapUsedMB: toMB(memory.heapUsed),
				heapTotalMB: toMB(memory.heapTotal),
				externalMB: toMB(memory.external),
				arrayBuffersMB: toMB(memory.arrayBuffers),
			};
		},
		listInFlightRequests: () => listInFlightRequests({ now: Date.now() }),
		report: ({ inFlightCount, requests, ...memory }) => {
			logger.warn(
				`memory_spike_inflight, rss: ${memory.rssMB}MB, heapUsed: ${memory.heapUsedMB}MB, inFlight: ${inFlightCount}`,
				{
					type: "memory_spike_inflight",
					data: {
						label,
						pid: process.pid,
						...memory,
						inFlightCount,
						requests,
					},
				},
			);
		},
		ceilingMB,
		riseMB: readEnvNumber({
			name: "MEMORY_SPIKE_PROBE_RISE_MB",
			fallback: DEFAULT_RISE_MB,
		}),
		baselineSamples: readEnvNumber({
			name: "MEMORY_SPIKE_PROBE_BASELINE_SAMPLES",
			fallback: DEFAULT_BASELINE_SAMPLES,
		}),
		maxReports: readEnvNumber({
			name: "MEMORY_SPIKE_PROBE_MAX_REPORTS",
			fallback: DEFAULT_MAX_REPORTS,
		}),
		maxRequestsLogged: MAX_REQUESTS_LOGGED,
	});

	intervalHandle = setInterval(() => {
		probe.sample();
	}, readIntervalMs());

	if (intervalHandle.unref) {
		intervalHandle.unref();
	}
};

export const stopMemorySpikeProbe = () => {
	if (intervalHandle) {
		clearInterval(intervalHandle);
		intervalHandle = null;
	}
};
