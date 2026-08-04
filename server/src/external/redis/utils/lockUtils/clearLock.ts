import { getMiscRedis } from "@/external/redis/initRedis.js";

/** Best-effort: with `token`, deletes only if this holder still owns the lock; never throws (TTL reaps). */
export const clearLock = async ({
	lockKey,
	token,
}: {
	lockKey: string;
	token?: string;
}) => {
	try {
		const redis = getMiscRedis();
		if (redis.status !== "ready") return;

		if (token) {
			await redis.deleteOwnedLock(lockKey, token);
		} else {
			await redis.del(lockKey);
		}
	} catch {
		// Release is best-effort — an uncleared lock expires by TTL.
	}
};
