import { forEachMiscRedisTarget } from "@/external/redis/miscCache/resolveMiscRedis.js";

/** Best-effort: with `token`, deletes only if this holder still owns the lock.
 *  Releases on every live instance during a ramp; never throws (TTL reaps). */
export const clearLock = async ({
	lockKey,
	token,
}: {
	lockKey: string;
	token?: string;
}) => {
	try {
		await forEachMiscRedisTarget({
			operation: async ({ redis }) => {
				if (redis.status !== "ready") return;

				if (token) {
					await redis.deleteOwnedLock(lockKey, token);
				} else {
					await redis.del(lockKey);
				}
			},
		});
	} catch {
		// Release is best-effort — an uncleared lock expires by TTL.
	}
};
