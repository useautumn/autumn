/**
 * Redis slowlog thresholds (per-operation SLOs).
 *
 * Scope: the V2 FullSubject cache surface only. Commands outside this set
 * fall through to `DEFAULT_THRESHOLD`, which is intentionally lax so it
 * doesn't flap on untuned ops.
 *
 * Two independent lookups compose into an effective threshold:
 *   1. Per-operation base threshold ("how long should this command take
 *      once it gets there?" — service time + same-region network)
 *   2. Per-region additive baseline ("how much extra network cost do I
 *      expect when hitting Redis in this region?")
 *
 * effective slowMs = base.slowMs + regionBaselineMs
 *
 * See `redis-slow-command-investigation.md` for the Axiom query templates
 * used to tune these numbers.
 */

export type RedisThresholdConfig = {
	operation: string;
	slowMs: number;
	severeMs: number;
};

export type RegionBaselineConfig = {
	region: string;
	baselineMs: number;
};

const threshold = ({
	operation,
	slowMs,
	severeMs,
}: RedisThresholdConfig): RedisThresholdConfig => ({
	operation,
	slowMs,
	severeMs,
});

const regionBaseline = ({
	region,
	baselineMs,
}: RegionBaselineConfig): RegionBaselineConfig => ({
	region,
	baselineMs,
});

/**
 * Fallback for any operation not in `REDIS_THRESHOLDS`. Kept lax so that
 * random non-V2 Redis calls don't flood slow-command logs.
 */
const DEFAULT_THRESHOLD: RedisThresholdConfig = {
	operation: "__default__",
	slowMs: 100,
	severeMs: 500,
};

const DEFAULT_REGION_BASELINE_MS = 0;

/**
 * Operation names match:
 *   - lowercase built-in command names (e.g. "get", "hmget")
 *   - exact `defineCommand` name for custom Lua commands (case sensitive)
 *
 * Built-in thresholds below are tuned for the V2 FullSubject cache path
 * but apply globally wherever these commands run — a slow GET anywhere
 * is still worth catching.
 */
export const REDIS_THRESHOLDS: RedisThresholdConfig[] = [
	// --- Built-in commands used by the V2 FullSubject cache layer ---
	// (server/src/internal/customers/cache/fullSubject/)
	threshold({ operation: "get", slowMs: 15, severeMs: 100 }),
	threshold({ operation: "set", slowMs: 20, severeMs: 100 }),
	threshold({ operation: "hmget", slowMs: 25, severeMs: 150 }),
	threshold({ operation: "hdel", slowMs: 20, severeMs: 100 }),
	threshold({ operation: "unlink", slowMs: 20, severeMs: 100 }),
	threshold({ operation: "incr", slowMs: 15, severeMs: 100 }),
	threshold({ operation: "expire", slowMs: 15, severeMs: 100 }),

	// --- V2 FullSubject Lua commands ---
	// (server/src/_luaScriptsV2/fullSubject/, fullSubjectDeduction/)
	threshold({ operation: "setCachedFullSubject", slowMs: 50, severeMs: 300 }),
	threshold({ operation: "adjustSubjectBalance", slowMs: 50, severeMs: 300 }),
	threshold({
		operation: "updateFullSubjectCustomerDataV2",
		slowMs: 50,
		severeMs: 300,
	}),
	threshold({
		operation: "updateFullSubjectEntityDataV2",
		slowMs: 50,
		severeMs: 300,
	}),
	threshold({
		operation: "updateFullSubjectCustomerProductV2",
		slowMs: 50,
		severeMs: 300,
	}),
	threshold({
		operation: "upsertInvoiceInFullSubjectV2",
		slowMs: 50,
		severeMs: 300,
	}),
	threshold({ operation: "updateSubjectBalances", slowMs: 75, severeMs: 400 }),
	threshold({
		operation: "deductFromSubjectBalances",
		slowMs: 75,
		severeMs: 400,
	}),
	threshold({ operation: "claimLockReceipt", slowMs: 30, severeMs: 200 }),
];

/**
 * Seed values are guesses; adjust after observing real p50 latencies in
 * Axiom (see Query E in `redis-slow-command-investigation.md`).
 */
export const REGION_BASELINES: RegionBaselineConfig[] = [
	regionBaseline({ region: "us-east-2", baselineMs: 0 }),
	regionBaseline({ region: "us-west-2", baselineMs: 70 }),
];

export const getRedisThresholdConfig = ({
	operation,
}: {
	operation: string;
}): RedisThresholdConfig =>
	REDIS_THRESHOLDS.find((config) => config.operation === operation) ??
	DEFAULT_THRESHOLD;

export const getRegionBaselineMs = ({
	region,
}: {
	region?: string;
}): number => {
	if (!region) return DEFAULT_REGION_BASELINE_MS;
	return (
		REGION_BASELINES.find((config) => config.region === region)?.baselineMs ??
		DEFAULT_REGION_BASELINE_MS
	);
};

export type ResolvedThresholds = {
	slowMs: number;
	severeMs: number;
	baseSlowMs: number;
	baseSevereMs: number;
	regionBaselineMs: number;
};

export const resolveThresholds = ({
	operation,
	redisRegion,
}: {
	operation: string;
	redisRegion?: string;
}): ResolvedThresholds => {
	const base = getRedisThresholdConfig({ operation });
	const regionBaselineMs = getRegionBaselineMs({ region: redisRegion });
	return {
		baseSlowMs: base.slowMs,
		baseSevereMs: base.severeMs,
		slowMs: base.slowMs + regionBaselineMs,
		severeMs: base.severeMs + regionBaselineMs,
		regionBaselineMs,
	};
};
