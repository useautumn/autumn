const MB = 1024 * 1024;

export const FORK_RECYCLE_DEFAULTS = {
	rssThresholdBytes: 2000 * MB,
	minAgeMs: 30 * 60_000,
	checkIntervalMs: 30_000,
	drainTimeoutMs: 30_000,
	drainGraceMs: 5_000,
	maxDelayMs: 5 * 60_000,
	blackoutBeforeMs: 2 * 60_000,
	blackoutAfterMs: 3 * 60_000,
} as const;

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

const positiveOr = (raw: string | undefined, fallback: number): number => {
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? value : fallback;
};

const intervalOr = (raw: string | undefined, fallback: number): number =>
	Math.max(1_000, positiveOr(raw, fallback));

const nonNegativeOr = (raw: string | undefined, fallback: number): number => {
	const value = Number(raw);
	return Number.isFinite(value) && value >= 0 ? value : fallback;
};

export const getServerForkCount = (): number => {
	const value = Number(process.env.SERVER_FORK_COUNT);
	if (!Number.isInteger(value) || value < 1) return 4;
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
		drainGraceMs: nonNegativeOr(
			process.env.FORK_RECYCLE_DRAIN_GRACE_MS,
			FORK_RECYCLE_DEFAULTS.drainGraceMs,
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
