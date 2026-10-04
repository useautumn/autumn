/**
 * In-worker request latency per report window: every track and check that reaches the HTTP layer
 * records its duration; the event-loop report takes the window's percentiles and starts a new window.
 * A window keeps at most `reservoir` samples per kind (uniform reservoir sampling), so a burst costs
 * one array write per request and one sort per report.
 */
export type LatencyPercentiles = {
	p50: number;
	p99: number;
	max: number;
	count: number;
};

export type LatencyWindow = {
	/** Sync tracks and track batches. */
	latencyMs: LatencyPercentiles | null;
	checkLatencyMs: LatencyPercentiles | null;
};

export type RequestLatencies = {
	record(params: { path: string; durationMs: number }): void;
	/** This window's percentiles; starts the next window. */
	drain(): LatencyWindow;
};

const DEFAULT_RESERVOIR = 8192;

type Kind = "track" | "check";

function kindOf(path: string): Kind | null {
	if (path === "/v1/track" || path === "/v1/track-batch") return "track";
	if (path === "/v1/check") return "check";
	return null;
}

function percentile(sorted: number[], fraction: number): number {
	const index = Math.min(
		sorted.length - 1,
		Math.floor(sorted.length * fraction),
	);
	return sorted[index] as number;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function createRequestLatencies({
	reservoir = DEFAULT_RESERVOIR,
	random = Math.random,
}: {
	reservoir?: number;
	random?: () => number;
} = {}): RequestLatencies {
	const samples: Record<Kind, number[]> = { track: [], check: [] };
	const seen: Record<Kind, number> = { track: 0, check: 0 };
	let max: Record<Kind, number> = { track: 0, check: 0 };

	function record({
		path,
		durationMs,
	}: {
		path: string;
		durationMs: number;
	}): void {
		const kind = kindOf(path);
		if (!kind) return;
		seen[kind] += 1;
		if (durationMs > max[kind]) max[kind] = durationMs;
		const kept = samples[kind];
		if (kept.length < reservoir) {
			kept.push(durationMs);
			return;
		}
		const slot = Math.floor(random() * seen[kind]);
		if (slot < reservoir) kept[slot] = durationMs;
	}

	function percentilesOf(kind: Kind): LatencyPercentiles | null {
		if (seen[kind] === 0) return null;
		const sorted = samples[kind].slice().sort((a, b) => a - b);
		return {
			p50: round(percentile(sorted, 0.5)),
			p99: round(percentile(sorted, 0.99)),
			max: round(max[kind]),
			count: seen[kind],
		};
	}

	function drain(): LatencyWindow {
		const window = {
			latencyMs: percentilesOf("track"),
			checkLatencyMs: percentilesOf("check"),
		};
		samples.track = [];
		samples.check = [];
		seen.track = 0;
		seen.check = 0;
		max = { track: 0, check: 0 };
		return window;
	}

	return { record, drain };
}
