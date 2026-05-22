import type { AppEnv } from "@autumn/shared";
import { metrics } from "@opentelemetry/api";
import { LRUCache } from "lru-cache";
import pLimit, { type LimitFunction } from "p-limit";
import type { Logger } from "@/external/logtail/logtailUtils.js";

// Log per-customer attribution when a request queued for at least this long.
// Sub-threshold engagements are still counted in metrics — just not logged
// (avoids spam under healthy load).
const GATE_LOG_WAIT_MS_THRESHOLD = 50;

const PER_CUSTOMER_LIMIT = Number(
	process.env.FULL_SUBJECT_PER_CUSTOMER_LIMIT ?? 15,
);
const PER_ORG_LIMIT = Number(process.env.FULL_SUBJECT_PER_ORG_LIMIT ?? 30);
const LIMITER_CACHE_MAX = 5000;
const LIMITER_CACHE_TTL_MS = 30 * 60 * 1000;

// updateAgeOnGet keeps active customers/orgs alive — without it, an in-flight
// burst that straddles a TTL expiry could see a fresh limiter and effectively
// double the cap.
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

const getCustomerLimiter = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: AppEnv;
	customerId: string;
}): LimitFunction => {
	const key = `${orgId}:${env}:${customerId}`;
	const existing = perCustomerLimiters.get(key);
	if (existing) return existing;
	const limiter = pLimit(PER_CUSTOMER_LIMIT);
	perCustomerLimiters.set(key, limiter);
	return limiter;
};

const getOrgLimiter = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): LimitFunction => {
	const key = `${orgId}:${env}`;
	const existing = perOrgLimiters.get(key);
	if (existing) return existing;
	const limiter = pLimit(PER_ORG_LIMIT);
	perOrgLimiters.set(key, limiter);
	return limiter;
};

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
const perCustomerActiveCounter = meter.createUpDownCounter(
	"autumn.full_subject.gate.per_customer_active",
	{ description: "Hydrations currently executing for a given customer" },
);
const perOrgActiveCounter = meter.createUpDownCounter(
	"autumn.full_subject.gate.per_org_active",
	{ description: "Hydrations currently executing for a given org" },
);

// Metric labels intentionally exclude customer_id — that's high-cardinality
// (hundreds of thousands of customers) and would balloon time-series count
// + ingestion cost. Per-customer attribution lives in log lines, not metrics.
const attrs = ({ orgId, env }: { orgId: string; env: AppEnv }) => ({
	org_id: orgId,
	env,
});

/**
 * Wrap a FullSubject DB hydration so it goes through per-customer + per-org
 * concurrency gates. Per-customer slot is acquired FIRST so one customer's
 * burst can't hold per-org slots while waiting on its own customer cap
 * (head-of-line starves siblings within the same org).
 *
 * Limits are PER-PROCESS, not cluster-wide — with N API replicas, effective
 * caps are PER_CUSTOMER_LIMIT*N and PER_ORG_LIMIT*N. Sized accordingly.
 *
 * Defaults: 15 per-customer, 30 per-org per process. Override via
 * FULL_SUBJECT_PER_CUSTOMER_LIMIT / FULL_SUBJECT_PER_ORG_LIMIT.
 */
export const runWithFullSubjectGate = async <T>({
	customerId,
	orgId,
	env,
	logger,
	queryFn,
}: {
	customerId: string | undefined;
	orgId: string;
	env: AppEnv;
	logger?: Logger;
	queryFn: () => Promise<T>;
}): Promise<T> => {
	const enqueuedAt = Date.now();
	const labels = attrs({ orgId, env });
	startedCounter.add(1, labels);

	const execute = async (): Promise<T> => {
		const waitMs = Date.now() - enqueuedAt;
		waitHistogram.record(waitMs, labels);
		if (waitMs >= GATE_LOG_WAIT_MS_THRESHOLD) {
			logger?.info(
				`[full_subject_gate] queued ${waitMs}ms customer=${customerId ?? "unknown"} org=${orgId} env=${env}`,
			);
		}
		perOrgActiveCounter.add(1, labels);
		perCustomerActiveCounter.add(1, labels);
		try {
			return await queryFn();
		} catch (error) {
			failedCounter.add(1, labels);
			throw error;
		} finally {
			perOrgActiveCounter.add(-1, labels);
			perCustomerActiveCounter.add(-1, labels);
			completedCounter.add(1, labels);
		}
	};

	if (customerId) {
		// Resolve the org limiter inside the customer callback so a stale
		// LRU-evicted org limiter can't be used after a customer slot opens.
		return getCustomerLimiter({ orgId, env, customerId })(() =>
			getOrgLimiter({ orgId, env })(execute),
		);
	}
	return getOrgLimiter({ orgId, env })(execute);
};
