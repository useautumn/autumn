import {
	type AutoTopupMaxPurchases,
	billingIntervalToSeconds,
} from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

const buildRateLimitKey = ({
	orgId,
	env,
	customerId,
	featureId,
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
}) => {
	return `auto_topup_count:${orgId}:${env}:${customerId}:${featureId}`;
};

/** Check if auto top-up is within the max_purchases rate limit */
export const checkAutoTopUpRateLimit = async ({
	orgId,
	env,
	customerId,
	featureId,
	maxPurchases,
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	maxPurchases: AutoTopupMaxPurchases;
}): Promise<boolean> => {
	if (redis.status !== "ready") {
		return true;
	}

	const key = buildRateLimitKey({ orgId, env, customerId, featureId });
	const current = await redis.get(key);

	if (current === null) {
		return true;
	}

	return Number.parseInt(current, 10) < maxPurchases.limit;
};

/** Increment the auto top-up purchase counter. Sets TTL on first increment. */
export const incrementAutoTopUpCounter = async ({
	orgId,
	env,
	customerId,
	featureId,
	maxPurchases,
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	maxPurchases: AutoTopupMaxPurchases;
}): Promise<void> => {
	const key = buildRateLimitKey({ orgId, env, customerId, featureId });
	const ttl = billingIntervalToSeconds({ interval: maxPurchases.interval });

	await tryRedisWrite(async () => {
		const count = await redis.incr(key);

		if (count === 1) {
			await redis.expire(key, ttl);
		}
	});
};
