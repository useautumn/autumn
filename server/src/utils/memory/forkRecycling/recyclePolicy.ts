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

export const getForkRecycleConfig = () => {
	const thresholdMb = Number(process.env.FORK_RECYCLE_RSS_MB);
	const minAgeMs = Number(process.env.FORK_RECYCLE_MIN_AGE_MS);
	const checkIntervalMs = Number(process.env.FORK_RECYCLE_CHECK_INTERVAL_MS);
	const drainTimeoutMs = Number(process.env.FORK_RECYCLE_DRAIN_TIMEOUT_MS);

	return {
		enabled: process.env.FORK_RECYCLE_DISABLED !== "true",
		rssThresholdBytes: Number.isFinite(thresholdMb)
			? thresholdMb * MB
			: FORK_RECYCLE_DEFAULTS.rssThresholdBytes,
		minAgeMs: Number.isFinite(minAgeMs)
			? minAgeMs
			: FORK_RECYCLE_DEFAULTS.minAgeMs,
		checkIntervalMs: Number.isFinite(checkIntervalMs)
			? checkIntervalMs
			: FORK_RECYCLE_DEFAULTS.checkIntervalMs,
		drainTimeoutMs: Number.isFinite(drainTimeoutMs)
			? drainTimeoutMs
			: FORK_RECYCLE_DEFAULTS.drainTimeoutMs,
	};
};
