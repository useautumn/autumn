import { getMiscRedis } from "@/external/redis/initRedis";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

const STRIPE_SUBSCRIPTION_LOCK_TTL_SECONDS =
	process.env.NODE_ENV === "production" ? 60 : 3;

type StripeSubscriptionLock = {
	lockedAtMs: number;
};

const buildStripeSubscriptionLockKey = (stripeSubscriptionId: string) =>
	`sub:${stripeSubscriptionId}`;

export const setStripeSubscriptionLock = async ({
	stripeSubscriptionId,
	lockedAtMs,
}: {
	stripeSubscriptionId: string;
	lockedAtMs: number;
}) => {
	const miscRedis = getMiscRedis();
	const lockKey = buildStripeSubscriptionLockKey(stripeSubscriptionId);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				lockKey,
				JSON.stringify({ lockedAtMs }),
				"EX",
				STRIPE_SUBSCRIPTION_LOCK_TTL_SECONDS,
			),
		source: "stripe-subscription-lock:set",
		redisInstance: miscRedis,
	});
};

export const getStripeSubscriptionLock = async ({
	stripeSubscriptionId,
}: {
	stripeSubscriptionId: string;
}): Promise<StripeSubscriptionLock | null> => {
	const miscRedis = getMiscRedis();
	const lockKey = buildStripeSubscriptionLockKey(stripeSubscriptionId);

	const value = await tryRedisOp({
		operation: () => miscRedis.get(lockKey),
		source: "stripe-subscription-lock:get",
		redisInstance: miscRedis,
	});
	if (!value) return null;

	return JSON.parse(value) as StripeSubscriptionLock;
};
