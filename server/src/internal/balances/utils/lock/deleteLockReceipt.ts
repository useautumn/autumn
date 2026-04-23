import type { Redis } from "ioredis";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/** Removes a lock receipt from Redis after successful finalize or expiry. */
export const deleteLockReceipt = async ({
	lockReceiptKey,
	redisInstance,
}: {
	lockReceiptKey: string;
	redisInstance: Redis;
}): Promise<void> => {
	await tryRedisWrite(
		() => redisInstance.del(lockReceiptKey) as Promise<number>,
		redisInstance,
	);
};
