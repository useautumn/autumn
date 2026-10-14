import { logger } from "@/external/logtail/logtailUtils.js";
import {
	forEachMiscRedisTarget,
	resolveMiscRedis,
} from "@/external/redis/miscCache/resolveMiscRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

/** An attached clock never detaches, so a clock id is safe to keep for long. */
const ATTACHED_CLOCK_TTL_SECONDS = 7 * 24 * 3600;
/** "No clock" can change (attach), so it is short-lived and cleared on attach. */
const NO_CLOCK_TTL_SECONDS = 600;
const NO_CLOCK = "none";

export const buildStripeTestClockCacheKey = (stripeCustomerId: string) =>
	`stripe_test_clock:${stripeCustomerId}`;

/** The customer's clock id, `null` when it has none, `undefined` on a miss. */
export const getCachedStripeTestClockId = async ({
	stripeCustomerId,
	requestId,
}: {
	stripeCustomerId: string;
	requestId?: string;
}): Promise<string | null | undefined> => {
	const miscRedis = resolveMiscRedis({ requestId });
	const cached = await tryRedisOp({
		operation: () =>
			miscRedis.get(buildStripeTestClockCacheKey(stripeCustomerId)),
		source: "stripe-test-clock-cache:get",
		redisInstance: miscRedis,
	});
	if (!cached) return undefined;
	return cached === NO_CLOCK ? null : cached;
};

export const setCachedStripeTestClockId = async ({
	stripeCustomerId,
	testClockId,
	requestId,
}: {
	stripeCustomerId: string;
	testClockId: string | null;
	requestId?: string;
}) => {
	const miscRedis = resolveMiscRedis({ requestId });
	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				buildStripeTestClockCacheKey(stripeCustomerId),
				testClockId ?? NO_CLOCK,
				"EX",
				testClockId ? ATTACHED_CLOCK_TTL_SECONDS : NO_CLOCK_TTL_SECONDS,
			),
		source: "stripe-test-clock-cache:set",
		redisInstance: miscRedis,
	});
};

export const clearStripeTestClockCache = async ({
	stripeCustomerId,
}: {
	stripeCustomerId: string;
}) => {
	const cacheKey = buildStripeTestClockCacheKey(stripeCustomerId);
	await forEachMiscRedisTarget({
		operation: ({ redis }) =>
			tryRedisOp({
				operation: () => redis.del(cacheKey),
				source: "stripe-test-clock-cache:clear",
				redisInstance: redis,
			}),
		onError: ({ target }) => {
			logger.warn(
				`[stripeTestClockCache] clear failed on "${target.instanceName}"`,
			);
		},
	});
};
