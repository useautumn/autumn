import { getFromMiscRedisTargets } from "@/external/redis/miscCache/getFromMiscRedisTargets.js";
import { setOnMiscRedisTargets } from "@/external/redis/miscCache/setOnMiscRedisTargets.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const STRIPE_SUBSCRIPTION_LOCK_TTL_SECONDS =
	process.env.NODE_ENV === "production" ? 60 : 3;

type StripeSubscriptionLock = {
	lockedAtMs: number;
};

const buildStripeSubscriptionLockKey = (stripeSubscriptionId: string) =>
	`sub:${stripeSubscriptionId}`;

export const setStripeSubscriptionLock = async ({
	ctx,
	stripeSubscriptionId,
	lockedAtMs,
}: {
	ctx: AutumnContext;
	stripeSubscriptionId: string;
	lockedAtMs: number;
}) => {
	const lockKey = buildStripeSubscriptionLockKey(stripeSubscriptionId);

	await setOnMiscRedisTargets({
		key: lockKey,
		value: JSON.stringify({ lockedAtMs }),
		ttlMs: STRIPE_SUBSCRIPTION_LOCK_TTL_SECONDS * 1000,
		source: "stripe-subscription-lock:set",
		onError: (error) =>
			ctx.logger.warn("[stripeSubscriptionLock] set failed", {
				data: { stripeSubscriptionId },
				error,
			}),
	});
};

export const getStripeSubscriptionLock = async ({
	ctx,
	stripeSubscriptionId,
}: {
	ctx: AutumnContext;
	stripeSubscriptionId: string;
}): Promise<StripeSubscriptionLock | null> => {
	const value = await getFromMiscRedisTargets({
		key: buildStripeSubscriptionLockKey(stripeSubscriptionId),
		source: "stripe-subscription-lock:get",
		onError: (error) =>
			ctx.logger.warn("[stripeSubscriptionLock] get failed", {
				data: { stripeSubscriptionId },
				error,
			}),
	});
	if (!value) return null;

	return JSON.parse(value) as StripeSubscriptionLock;
};
