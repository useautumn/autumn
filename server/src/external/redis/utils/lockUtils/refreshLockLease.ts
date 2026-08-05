import { forEachMiscRedisTarget } from "@/external/redis/miscCache/resolveMiscRedis.js";

/** Best-effort one-shot lease extension for a still-owned lock, applied to
 *  every live instance during a ramp. */
export const refreshLockLease = async ({
	lockKey,
	token,
	ttlMs,
}: {
	lockKey: string;
	token: string;
	ttlMs: number;
}) => {
	try {
		await forEachMiscRedisTarget({
			operation: async ({ redis }) => {
				if (redis.status !== "ready") return;
				await redis.refreshOwnedLock(lockKey, token, ttlMs.toString());
			},
		});
	} catch {
		// Refresh is best-effort — worst case the original lease stands.
	}
};
