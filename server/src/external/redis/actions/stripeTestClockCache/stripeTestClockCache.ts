import { logger } from "@/external/logtail/logtailUtils.js";
import {
	forEachMiscRedisTarget,
	resolveMiscRedis,
} from "@/external/redis/miscCache/resolveMiscRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

/** An attached clock never detaches, so a clock id is safe to keep for long. */
const ATTACHED_CLOCK_TTL_SECONDS = 7 * 24 * 3600;
/** "No clock" can change on attach, so it is short-lived and never overwrites a clock id. */
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
	const cacheKey = buildStripeTestClockCacheKey(stripeCustomerId);
	await tryRedisOp({
		operation: () =>
			testClockId
				? miscRedis.set(cacheKey, testClockId, "EX", ATTACHED_CLOCK_TTL_SECONDS)
				: // NX: a lookup that read Stripe before an attach must not hide the new clock.
					miscRedis.set(cacheKey, NO_CLOCK, "EX", NO_CLOCK_TTL_SECONDS, "NX"),
		source: "stripe-test-clock-cache:set",
		redisInstance: miscRedis,
	});
};

/** Records a newly attached clock on every instance, replacing any cached "no clock". */
export const setAttachedStripeTestClock = async ({
	stripeCustomerId,
	testClockId,
}: {
	stripeCustomerId: string;
	testClockId: string;
}) => {
	const cacheKey = buildStripeTestClockCacheKey(stripeCustomerId);
	// Fail open: resolving the targets throws when no misc cache is configured, and a cache
	// write must never fail the attach itself.
	await forEachMiscRedisTarget({
		operation: ({ redis }) =>
			tryRedisOp({
				operation: () =>
					redis.set(cacheKey, testClockId, "EX", ATTACHED_CLOCK_TTL_SECONDS),
				source: "stripe-test-clock-cache:attach",
				redisInstance: redis,
			}),
		onError: ({ target }) => {
			logger.warn(
				`[stripeTestClockCache] attach write failed on "${target.instanceName}"`,
			);
		},
	}).catch((error) => {
		logger.warn("[stripeTestClockCache] attach write skipped", { error });
	});
};
