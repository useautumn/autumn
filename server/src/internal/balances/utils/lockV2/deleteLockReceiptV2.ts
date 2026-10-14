import type { Redis } from "ioredis";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildClaimMarkerKey } from "./buildClaimMarkerKey.js";

export const deleteLockReceiptV2 = async ({
	lockReceiptKey,
	redisInstance,
}: {
	lockReceiptKey: string;
	redisInstance: Redis;
}) => {
	await tryRedisWrite(
		() =>
			redisInstance.del(lockReceiptKey, buildClaimMarkerKey(lockReceiptKey)),
		redisInstance,
	);
};
