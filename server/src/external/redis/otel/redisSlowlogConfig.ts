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

const DEFAULT_THRESHOLD: RedisThresholdConfig = {
	operation: "__default__",
	slowMs: 100,
	severeMs: 500,
};

const DEFAULT_REGION_BASELINE_MS = 0;

export const REDIS_THRESHOLDS: RedisThresholdConfig[] = [
	threshold({ operation: "get", slowMs: 15, severeMs: 100 }),
	threshold({ operation: "set", slowMs: 20, severeMs: 100 }),
	threshold({ operation: "hmget", slowMs: 25, severeMs: 150 }),
	threshold({ operation: "hdel", slowMs: 20, severeMs: 100 }),
	threshold({ operation: "unlink", slowMs: 20, severeMs: 100 }),
	threshold({ operation: "incr", slowMs: 15, severeMs: 100 }),
	threshold({ operation: "expire", slowMs: 15, severeMs: 100 }),

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
		operation: "getDelFullSubjectBalanceFields",
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
];

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
