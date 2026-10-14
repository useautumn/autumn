import { forEachMiscRedisTarget } from "@/external/redis/miscCache/resolveMiscRedis.js";

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
	} catch {}
};
