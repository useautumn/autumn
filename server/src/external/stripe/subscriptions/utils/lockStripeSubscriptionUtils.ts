import { getMiscRedis } from "@/external/redis/initRedis";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils";

export const setStripeSubscriptionLock = async ({
	stripeSubscriptionId,
	lockedAtMs,
}: {
	stripeSubscriptionId: string;
	lockedAtMs: number;
}) => {
	const primaryRedis = getMiscRedis();
	await tryRedisWrite(
		async () =>
			primaryRedis.set(
				`sub:${stripeSubscriptionId}`,
				JSON.stringify({ lockedAtMs }),
				"EX",
				process.env.NODE_ENV === "production" ? 60 : 3,
			),
		primaryRedis,
	);
};

type StripeSubscriptionLock = {
	lockedAtMs: number;
};

export const getStripeSubscriptionLock = async ({
	stripeSubscriptionId,
}: {
	stripeSubscriptionId: string;
}): Promise<StripeSubscriptionLock | null> => {
	const primaryRedis = getMiscRedis();
	return tryRedisRead(async () => {
		const value = await primaryRedis.get(`sub:${stripeSubscriptionId}`);
		if (!value) return null;
		return JSON.parse(value) as StripeSubscriptionLock;
	}, primaryRedis);
};
