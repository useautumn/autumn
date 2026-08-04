import { getMiscRedis } from "@/external/redis/initRedis.js";

/** Best-effort one-shot lease extension for a still-owned lock. */
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
		const redis = getMiscRedis();
		if (redis.status !== "ready") return;
		await redis.refreshOwnedLock(lockKey, token, ttlMs.toString());
	} catch {
		// Refresh is best-effort — worst case the original lease stands.
	}
};
