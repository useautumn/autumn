const MB = 1024 * 1024;

/** JSC never returns allocator-retained pages, so forks only shed memory by
 *  dying; recycling above this RSS is the bound the engine cannot provide. */
export const FORK_RECYCLE_DEFAULTS = {
	rssThresholdBytes: 2000 * MB,
	minAgeMs: 30 * 60_000,
	checkIntervalMs: 30_000,
	drainTimeoutMs: 30_000,
	maxDelayMs: 5 * 60_000,
	// Replacement boots briefly saturate every core; the hourly burst is the
	// one scheduled moment the serving forks cannot spare them.
	blackoutBeforeMs: 2 * 60_000,
	blackoutAfterMs: 3 * 60_000,
} as const;

/** Rolled once per fork: a private post-eligibility wait de-phases same-boot
 *  cohorts so a burst can't harvest a whole fleet's boots into one minute. */
export const rollEligibilityDelayMs = ({
	maxDelayMs,
	random = Math.random,
}: {
	maxDelayMs: number;
	random?: () => number;
}): number => Math.round(random() * maxDelayMs);

const HOUR_MS = 60 * 60_000;

export const isWithinHourlyBlackout = ({
	now,
	beforeMs,
	afterMs,
}: {
	now: number;
	beforeMs: number;
	afterMs: number;
}): boolean => {
	const intoHour = now % HOUR_MS;
	return intoHour < afterMs || intoHour >= HOUR_MS - beforeMs;
};

export const msUntilHourlyBlackoutEnd = ({
	now,
	beforeMs,
	afterMs,
}: {
	now: number;
	beforeMs: number;
	afterMs: number;
}): number => {
	const intoHour = now % HOUR_MS;
	if (intoHour < afterMs) return afterMs - intoHour;
	if (intoHour >= HOUR_MS - beforeMs) return HOUR_MS - intoHour + afterMs;
	return 0;
};

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

// Zero is meaningful here: it disables the delay/blackout entirely.
const nonNegativeOr = (raw: string | undefined, fallback: number): number => {
	const value = Number(raw);
	return Number.isFinite(value) && value >= 0 ? value : fallback;
};

/** Serving forks per task — single-threaded loops, so this is capacity.
 *  Cap 6: above it, forks x ~2.3GB worst case (default 2000MB threshold +
 *  overshoot) + primary can OOM a 16GB task; revisit if the threshold drops. */
export const getServerForkCount = (): number => {
	const value = Number(process.env.SERVER_FORK_COUNT);
	if (!Number.isInteger(value) || value < 1) return 3;
	return Math.min(6, value);
};

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
		maxDelayMs: nonNegativeOr(
			process.env.FORK_RECYCLE_MAX_DELAY_MS,
			FORK_RECYCLE_DEFAULTS.maxDelayMs,
		),
		blackoutBeforeMs: nonNegativeOr(
			process.env.FORK_RECYCLE_BLACKOUT_BEFORE_MS,
			FORK_RECYCLE_DEFAULTS.blackoutBeforeMs,
		),
		blackoutAfterMs: nonNegativeOr(
			process.env.FORK_RECYCLE_BLACKOUT_AFTER_MS,
			FORK_RECYCLE_DEFAULTS.blackoutAfterMs,
		),
	};
};
