import { logger } from "@/external/logtail/logtailUtils.js";
import {
	type InFlightRequestSummary,
	listInFlightRequests,
} from "./inFlightRequests.js";

export type MemorySpikeReport = {
	rssMB: number;
	inFlightCount: number;
	requests: InFlightRequestSummary[];
};

const DEFAULT_THRESHOLD_MB = 4500;
const DEFAULT_REARM_MB = 3500;
const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_MAX_REPORTS = 3;
const MAX_REQUESTS_LOGGED = 20;

export const createMemorySpikeProbe = ({
	readRssMB,
	listInFlightRequests: readInFlight,
	report,
	thresholdMB,
	rearmMB,
	maxReports,
	maxRequestsLogged,
}: {
	readRssMB: () => number;
	listInFlightRequests: () => InFlightRequestSummary[];
	report: (payload: MemorySpikeReport) => void;
	thresholdMB: number;
	rearmMB: number;
	maxReports: number;
	maxRequestsLogged: number;
}) => {
	let armed = true;
	let reportsSent = 0;

	const sample = () => {
		const rssMB = readRssMB();

		if (rssMB < rearmMB) {
			armed = true;
		}

		if (!armed || rssMB < thresholdMB || reportsSent >= maxReports) return;

		armed = false;
		reportsSent += 1;

		const requests = readInFlight();
		const longestRunning = [...requests]
			.sort((a, b) => b.elapsedMs - a.elapsedMs)
			.slice(0, maxRequestsLogged);

		report({
			rssMB,
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

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Set MEMORY_SPIKE_PROBE_MB to 0 to disable. */
export const startMemorySpikeProbe = ({ label }: { label: string }) => {
	const thresholdMB = readEnvNumber({
		name: "MEMORY_SPIKE_PROBE_MB",
		fallback: DEFAULT_THRESHOLD_MB,
	});
	if (thresholdMB <= 0) return;

	const probe = createMemorySpikeProbe({
		readRssMB: () => process.memoryUsage().rss / 1024 / 1024,
		listInFlightRequests: () => listInFlightRequests({ now: Date.now() }),
		report: ({ rssMB, inFlightCount, requests }) => {
			logger.warn(
				`memory_spike_inflight, rss: ${Math.round(rssMB)}MB, inFlight: ${inFlightCount}`,
				{
					type: "memory_spike_inflight",
					data: {
						label,
						pid: process.pid,
						rssMB: Math.round(rssMB),
						inFlightCount,
						requests,
					},
				},
			);
		},
		thresholdMB,
		rearmMB: readEnvNumber({
			name: "MEMORY_SPIKE_PROBE_REARM_MB",
			fallback: DEFAULT_REARM_MB,
		}),
		maxReports: readEnvNumber({
			name: "MEMORY_SPIKE_PROBE_MAX_REPORTS",
			fallback: DEFAULT_MAX_REPORTS,
		}),
		maxRequestsLogged: MAX_REQUESTS_LOGGED,
	});

	intervalHandle = setInterval(
		() => {
			probe.sample();
		},
		readEnvNumber({
			name: "MEMORY_SPIKE_PROBE_INTERVAL_MS",
			fallback: DEFAULT_INTERVAL_MS,
		}),
	);

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
