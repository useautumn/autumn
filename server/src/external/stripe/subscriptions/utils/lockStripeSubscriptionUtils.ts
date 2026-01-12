import { redis } from "@/external/redis/initRedis";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils";

export const setStripeSubscriptionLock = async ({
	stripeSubscriptionId,
	lockedAtMs,
}: {
	stripeSubscriptionId: string;
	lockedAtMs: number;
}) => {
	await tryRedisWrite(async () => {
		await redis.set(
			`sub:${stripeSubscriptionId}`,
			JSON.stringify({ lockedAtMs }),
			"EX",
			process.env.NODE_ENV === "production" ? 30 : 3,
		); // 10 seconds
	});
};

export type StripeSubscriptionLock = {
	lockedAtMs: number;
};

export const getStripeSubscriptionLock = async ({
	stripeSubscriptionId,
}: {
	stripeSubscriptionId: string;
}): Promise<StripeSubscriptionLock | null> => {
	return await tryRedisRead(async () => {
		const value = await redis.get(`sub:${stripeSubscriptionId}`);
		if (!value) return null;
		return JSON.parse(value) as StripeSubscriptionLock;
	});
};
