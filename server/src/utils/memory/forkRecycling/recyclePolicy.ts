const MB = 1024 * 1024;

/** JSC never returns allocator-retained pages, so forks only shed memory by
 *  dying; recycling above this RSS is the bound the engine cannot provide. */
export const FORK_RECYCLE_DEFAULTS = {
	rssThresholdBytes: 3072 * MB,
	minAgeMs: 30 * 60_000,
	checkIntervalMs: 30_000,
	drainTimeoutMs: 30_000,
} as const;

export const shouldRequestRecycle = ({
	rssBytes,
	thresholdBytes,
	ageMs,
	minAgeMs,
}: {
	rssBytes: number;
	thresholdBytes: number;
	ageMs: number;
	minAgeMs: number;
}): boolean => rssBytes >= thresholdBytes && ageMs >= minAgeMs;

// Sub-second timings would hot-loop checks or defeat the drain bounds, so
// intervals floor at 1s (thresholds/ages just need to be positive).
const positiveOr = (raw: string | undefined, fallback: number): number => {
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? value : fallback;
};

const intervalOr = (raw: string | undefined, fallback: number): number =>
	Math.max(1_000, positiveOr(raw, fallback));

export const getForkRecycleConfig = () => {
	return {
		enabled: process.env.FORK_RECYCLE_DISABLED !== "true",
		rssThresholdBytes:
			positiveOr(
				process.env.FORK_RECYCLE_RSS_MB,
				FORK_RECYCLE_DEFAULTS.rssThresholdBytes / MB,
			) * MB,
		minAgeMs: positiveOr(
			process.env.FORK_RECYCLE_MIN_AGE_MS,
			FORK_RECYCLE_DEFAULTS.minAgeMs,
		),
		checkIntervalMs: intervalOr(
			process.env.FORK_RECYCLE_CHECK_INTERVAL_MS,
			FORK_RECYCLE_DEFAULTS.checkIntervalMs,
		),
		drainTimeoutMs: intervalOr(
			process.env.FORK_RECYCLE_DRAIN_TIMEOUT_MS,
			FORK_RECYCLE_DEFAULTS.drainTimeoutMs,
		),
	};
};
