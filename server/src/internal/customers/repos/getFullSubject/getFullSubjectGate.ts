import type { AppEnv } from "@autumn/shared";
import { RecaseError } from "@autumn/shared";
import { metrics } from "@opentelemetry/api";
import { LRUCache } from "lru-cache";
import pLimit, { type LimitFunction } from "p-limit";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { getRuntimeFullSubjectGateConfig } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";

export type FullSubjectGateLane = "primary" | "replica";

const GATE_LOG_WAIT_MS_THRESHOLD = 50;
const LIMITER_CACHE_MAX = 5000;
const LIMITER_CACHE_TTL_MS = 30 * 60 * 1000;

// Seed keeps cold processes from over-rejecting before real samples arrive.
const SERVICE_TIME_EWMA_SEED_MS = 100;
const SERVICE_TIME_EWMA_ALPHA = 0.2;
let globalEwmaServiceMs = SERVICE_TIME_EWMA_SEED_MS;

// Per-org-limiter EWMAs so one tenant's slow hydrations don't shed other tenants.
const perOrgEwmaServiceMs = new LRUCache<string, { valueMs: number }>({
	max: LIMITER_CACHE_MAX,
	ttl: LIMITER_CACHE_TTL_MS,
	updateAgeOnGet: true,
});

const buildOrgGateKey = ({
	lane,
	orgId,
	env,
}: {
	lane: FullSubjectGateLane;
	orgId: string;
	env: AppEnv;
}): string => `${lane}:${orgId}:${env}`;

const perCustomerLimiters = new LRUCache<string, LimitFunction>({
	max: LIMITER_CACHE_MAX,
	ttl: LIMITER_CACHE_TTL_MS,
	updateAgeOnGet: true,
});

const perOrgLimiters = new LRUCache<string, LimitFunction>({
	max: LIMITER_CACHE_MAX,
	ttl: LIMITER_CACHE_TTL_MS,
	updateAgeOnGet: true,
});

const getOrUpdateLimiter = (
	cache: LRUCache<string, LimitFunction>,
	key: string,
	concurrency: number,
): LimitFunction => {
	const existing = cache.get(key);
	if (existing) {
		if (existing.concurrency !== concurrency)
			existing.concurrency = concurrency;
		return existing;
	}
	const limiter = pLimit(concurrency);
	cache.set(key, limiter);
	return limiter;
};

const getCustomerLimiter = ({
	lane,
	orgId,
	env,
	customerId,
	limit,
}: {
	lane: FullSubjectGateLane;
	orgId: string;
	env: AppEnv;
	customerId: string;
	limit: number;
}): LimitFunction =>
	getOrUpdateLimiter(
		perCustomerLimiters,
		`${lane}:${orgId}:${env}:${customerId}`,
		limit,
	);

const predictedWaitMs = (limiter: LimitFunction, serviceMs: number): number =>
	(limiter.pendingCount / Math.max(1, limiter.concurrency)) * serviceMs;

const getOrgLimiter = ({
	lane,
	orgId,
	env,
	limit,
}: {
	lane: FullSubjectGateLane;
	orgId: string;
	env: AppEnv;
	limit: number;
}): LimitFunction =>
	getOrUpdateLimiter(
		perOrgLimiters,
		buildOrgGateKey({ lane, orgId, env }),
		limit,
	);

const meter = metrics.getMeter("autumn-server");
const startedCounter = meter.createCounter("autumn.full_subject.gate.started", {
	description: "FullSubject DB hydrations entering the gate",
});
const completedCounter = meter.createCounter(
	"autumn.full_subject.gate.completed",
	{ description: "FullSubject DB hydrations finished (success or failure)" },
);
const failedCounter = meter.createCounter("autumn.full_subject.gate.failed", {
	description: "FullSubject DB hydrations that threw",
});
const waitHistogram = meter.createHistogram(
	"autumn.full_subject.gate.wait_ms",
	{
		description:
			"Time spent queued before the DB hydration started, in milliseconds.",
		unit: "ms",
	},
);
const activeCounter = meter.createUpDownCounter(
	"autumn.full_subject.gate.active",
	{ description: "FullSubject hydrations currently executing" },
);
const rejectedCounter = meter.createCounter(
	"autumn.full_subject.gate.rejected",
	{ description: "FullSubject hydrations rejected (queue full or timed out)" },
);

const attrs = ({
	orgId,
	env,
	lane,
}: {
	orgId: string;
	env: AppEnv;
	lane: FullSubjectGateLane;
}) => ({
	org_id: orgId,
	env,
	lane,
});

const GATE_REJECTION_REASONS = [
	"per_customer_queue_full",
	"per_org_queue_full",
	"wait_timeout",
	"predicted_wait_timeout",
] as const;
type GateRejectionReason = (typeof GATE_REJECTION_REASONS)[number];
const gateRejectionReasonSet: ReadonlySet<string> = new Set(
	GATE_REJECTION_REASONS,
);

const rejectOverloaded = ({
	reason,
	labels,
}: {
	reason: GateRejectionReason;
	labels: Record<string, string>;
}): never => {
	rejectedCounter.add(1, { ...labels, reason });
	throw new RecaseError({
		message:
			"Too many concurrent requests for this customer. Please retry shortly.",
		code: "rate_limit_exceeded",
		statusCode: 429,
		data: { reason },
	});
};

export const isFullSubjectGateRejection = (error: unknown): boolean => {
	if (!(error instanceof RecaseError)) return false;
	if (error.code !== "rate_limit_exceeded" || error.statusCode !== 429)
		return false;
	const data = error.data;
	return (
		typeof data === "object" &&
		data !== null &&
		"reason" in data &&
		typeof data.reason === "string" &&
		gateRejectionReasonSet.has(data.reason)
	);
};

// Configured caps are cluster-wide; each process enforces an even share.
// Floor (not round) so cluster-wide capacity never EXCEEDS the configured target.
export const toPerProcessLimit = (
	clusterWideTarget: number,
	fleetProcessCount: number,
): number =>
	Math.max(1, Math.floor(clusterWideTarget / Math.max(1, fleetProcessCount)));

export const runWithFullSubjectGate = async <T>({
	customerId,
	orgId,
	env,
	lane = "primary",
	logger,
	queryFn,
}: {
	customerId: string | undefined;
	orgId: string;
	env: AppEnv;
	lane?: FullSubjectGateLane;
	logger?: Logger;
	queryFn: () => Promise<T>;
}): Promise<T> => {
	const config = getRuntimeFullSubjectGateConfig();
	const { max_wait_ms, fleet_process_count } = config;
	const {
		per_customer_limit,
		per_org_limit,
		per_customer_pending_max,
		per_org_pending_max,
	} = lane === "replica" ? config.replica_lane : config;
	const enqueuedAt = Date.now();
	const labels = attrs({ orgId, env, lane });

	const perProcessOrgLimit = toPerProcessLimit(
		per_org_limit,
		fleet_process_count,
	);
	const perProcessOrgPendingMax = toPerProcessLimit(
		per_org_pending_max,
		fleet_process_count,
	);

	const orgLimiter = getOrgLimiter({
		lane,
		orgId,
		env,
		limit: perProcessOrgLimit,
	});

	let customerLimiter: LimitFunction | undefined;
	if (customerId) {
		customerLimiter = getCustomerLimiter({
			lane,
			orgId,
			env,
			customerId,
			limit: toPerProcessLimit(per_customer_limit, fleet_process_count),
		});
		if (
			customerLimiter.pendingCount >=
			toPerProcessLimit(per_customer_pending_max, fleet_process_count)
		) {
			rejectOverloaded({ reason: "per_customer_queue_full", labels });
		}
	} else if (orgLimiter.pendingCount >= perProcessOrgPendingMax) {
		rejectOverloaded({ reason: "per_org_queue_full", labels });
	}

	// Fast-shed: a queue predicted (via EWMA service time) not to drain within
	// max_wait_ms would only hold the request until the dequeue-time 429.
	const orgGateKey = buildOrgGateKey({ lane, orgId, env });
	const gateEwmaMs =
		perOrgEwmaServiceMs.get(orgGateKey)?.valueMs ?? globalEwmaServiceMs;
	const enqueuePredictedWaitMs = customerLimiter
		? Math.max(
				predictedWaitMs(customerLimiter, gateEwmaMs),
				predictedWaitMs(orgLimiter, gateEwmaMs),
			)
		: predictedWaitMs(orgLimiter, gateEwmaMs);
	if (enqueuePredictedWaitMs >= max_wait_ms) {
		rejectOverloaded({ reason: "predicted_wait_timeout", labels });
	}

	startedCounter.add(1, labels);

	const execute = async (): Promise<T> => {
		const waitMs = Date.now() - enqueuedAt;
		waitHistogram.record(waitMs, labels);
		if (waitMs >= max_wait_ms) {
			rejectOverloaded({ reason: "wait_timeout", labels });
		}
		if (waitMs >= GATE_LOG_WAIT_MS_THRESHOLD) {
			logger?.info(
				`[full_subject_gate] queued ${waitMs}ms lane=${lane} customer=${customerId ?? "unknown"} org=${orgId} env=${env}`,
			);
		}
		activeCounter.add(1, labels);
		const serviceStartedAt = Date.now();
		try {
			return await queryFn();
		} catch (error) {
			failedCounter.add(1, labels);
			throw error;
		} finally {
			const serviceMs = Date.now() - serviceStartedAt;
			// Cold orgs seed from the global EWMA, then diverge on their own samples.
			const orgEwma = perOrgEwmaServiceMs.get(orgGateKey) ?? {
				valueMs: globalEwmaServiceMs,
			};
			orgEwma.valueMs =
				SERVICE_TIME_EWMA_ALPHA * serviceMs +
				(1 - SERVICE_TIME_EWMA_ALPHA) * orgEwma.valueMs;
			perOrgEwmaServiceMs.set(orgGateKey, orgEwma);
			globalEwmaServiceMs =
				SERVICE_TIME_EWMA_ALPHA * serviceMs +
				(1 - SERVICE_TIME_EWMA_ALPHA) * globalEwmaServiceMs;
			activeCounter.add(-1, labels);
			completedCounter.add(1, labels);
		}
	};

	if (customerLimiter) {
		return customerLimiter(() => {
			if (orgLimiter.pendingCount >= perProcessOrgPendingMax) {
				rejectOverloaded({ reason: "per_org_queue_full", labels });
			}
			return orgLimiter(execute);
		});
	}
	return orgLimiter(execute);
};

export const _setFullSubjectGateEwmaForTesting = (valueMs: number): void => {
	globalEwmaServiceMs = valueMs;
	perOrgEwmaServiceMs.clear();
};

export const _getFullSubjectGateEwmaForTesting = (): number =>
	globalEwmaServiceMs;

export const _setFullSubjectGateOrgEwmaForTesting = ({
	lane = "primary",
	orgId,
	env,
	valueMs,
}: {
	lane?: FullSubjectGateLane;
	orgId: string;
	env: AppEnv;
	valueMs: number;
}): void => {
	perOrgEwmaServiceMs.set(buildOrgGateKey({ lane, orgId, env }), { valueMs });
};

export const _getFullSubjectGateOrgEwmaForTesting = ({
	lane = "primary",
	orgId,
	env,
}: {
	lane?: FullSubjectGateLane;
	orgId: string;
	env: AppEnv;
}): number | undefined =>
	perOrgEwmaServiceMs.get(buildOrgGateKey({ lane, orgId, env }))?.valueMs;
