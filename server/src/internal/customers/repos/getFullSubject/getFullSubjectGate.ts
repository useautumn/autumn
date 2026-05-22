import type { AppEnv } from "@autumn/shared";
import { RecaseError } from "@autumn/shared";
import { metrics } from "@opentelemetry/api";
import { LRUCache } from "lru-cache";
import pLimit, { type LimitFunction } from "p-limit";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { getRuntimeFullSubjectGateConfig } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";

const GATE_LOG_WAIT_MS_THRESHOLD = 50;
const LIMITER_CACHE_MAX = 5000;
const LIMITER_CACHE_TTL_MS = 30 * 60 * 1000;

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
	orgId,
	env,
	customerId,
	limit,
}: {
	orgId: string;
	env: AppEnv;
	customerId: string;
	limit: number;
}): LimitFunction =>
	getOrUpdateLimiter(
		perCustomerLimiters,
		`${orgId}:${env}:${customerId}`,
		limit,
	);

const getOrgLimiter = ({
	orgId,
	env,
	limit,
}: {
	orgId: string;
	env: AppEnv;
	limit: number;
}): LimitFunction =>
	getOrUpdateLimiter(perOrgLimiters, `${orgId}:${env}`, limit);

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

const attrs = ({ orgId, env }: { orgId: string; env: AppEnv }) => ({
	org_id: orgId,
	env,
});

const rejectOverloaded = ({
	reason,
	labels,
}: {
	reason: string;
	labels: Record<string, string>;
}): never => {
	rejectedCounter.add(1, { ...labels, reason });
	throw new RecaseError({
		message: `FullSubject concurrency gate overloaded (${reason})`,
		code: "full_subject_gate_overloaded",
		statusCode: 429,
	});
};

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
	const {
		per_customer_limit,
		per_org_limit,
		max_wait_ms,
		per_customer_pending_max,
		per_org_pending_max,
	} = getRuntimeFullSubjectGateConfig();
	const enqueuedAt = Date.now();
	const labels = attrs({ orgId, env });
	startedCounter.add(1, labels);

	const orgLimiter = getOrgLimiter({ orgId, env, limit: per_org_limit });
	if (orgLimiter.pendingCount >= per_org_pending_max) {
		rejectOverloaded({ reason: "per_org_queue_full", labels });
	}

	let customerLimiter: LimitFunction | undefined;
	if (customerId) {
		customerLimiter = getCustomerLimiter({
			orgId,
			env,
			customerId,
			limit: per_customer_limit,
		});
		if (customerLimiter.pendingCount >= per_customer_pending_max) {
			rejectOverloaded({ reason: "per_customer_queue_full", labels });
		}
	}

	const execute = async (): Promise<T> => {
		const waitMs = Date.now() - enqueuedAt;
		waitHistogram.record(waitMs, labels);
		if (waitMs >= max_wait_ms) {
			rejectOverloaded({ reason: "wait_timeout", labels });
		}
		if (waitMs >= GATE_LOG_WAIT_MS_THRESHOLD) {
			logger?.info(
				`[full_subject_gate] queued ${waitMs}ms customer=${customerId ?? "unknown"} org=${orgId} env=${env}`,
			);
		}
		activeCounter.add(1, labels);
		try {
			return await queryFn();
		} catch (error) {
			failedCounter.add(1, labels);
			throw error;
		} finally {
			activeCounter.add(-1, labels);
			completedCounter.add(1, labels);
		}
	};

	if (customerLimiter) {
		return customerLimiter(() => orgLimiter(execute));
	}
	return orgLimiter(execute);
};
