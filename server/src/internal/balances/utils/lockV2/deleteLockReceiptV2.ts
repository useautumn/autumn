import type { Redis } from "ioredis";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildClaimMarkerKey } from "./buildClaimMarkerKey.js";

/**
 * V2 delete-lock-receipt. Removes both the receipt key and its claim marker
 * in a single variadic DEL — one Redis round trip.
 */
export const deleteLockReceiptV2 = async ({
	lockReceiptKey,
	redisInstance,
}: {
	lockReceiptKey: string;
	redisInstance: Redis;
}) => {
	await tryRedisWrite(
		() => redisInstance.del(lockReceiptKey, buildClaimMarkerKey(lockReceiptKey)),
		redisInstance,
	);
};
