import { redis } from "@/external/redis/initRedis.js";

export const releaseRedisIdempotencyKey = async ({
	storageKey,
}: {
	storageKey: string;
}): Promise<void> => {
	if (redis.status !== "ready") return;

	try {
		await redis.del(storageKey);
	} catch {
		return;
	}
};
