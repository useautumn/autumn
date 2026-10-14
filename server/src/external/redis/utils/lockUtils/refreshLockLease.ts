import { forEachMiscRedisTarget } from "@/external/redis/miscCache/resolveMiscRedis.js";

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
	} catch {}
};
