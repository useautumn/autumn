import type { Redis } from "ioredis";
import { redis } from "@/external/redis/initRedis.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/** Removes a lock receipt from Redis after successful finalize or expiry. */
export const deleteLockReceipt = async ({
	lockReceiptKey,
	redisInstance,
}: {
	lockReceiptKey: string;
	redisInstance?: Redis;
}): Promise<void> => {
	const targetRedis = redisInstance ?? redis;
	await tryRedisWrite(
		() => targetRedis.del(lockReceiptKey) as Promise<number>,
		redisInstance,
	);
};
