import { ErrCode, InternalError, RecaseError } from "@autumn/shared";
import type { Redis } from "ioredis";
import {
	currentRegion,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/**
 * Atomically claims a lock receipt: pending → processing.
 *
 * Routes the claim to the Redis instance the receipt was originally written to
 * (identified by receipt.region) so that Active-Active replication cannot allow
 * two concurrent claims on separate regional instances.
 *
 * Returns the Redis instance that was used — callers must use it for all
 * subsequent operations (unwind deduction, delete) to stay on the same instance.
 *
 * Throws RecaseError for terminal/already-processing statuses.
 * Throws InternalError when Redis is unavailable.
 */
export const claimLockReceipt = async ({
	lockReceiptKey,
	receiptRegion,
}: {
	lockReceiptKey: string;
	receiptRegion?: string | null;
}): Promise<{ redisInstance: Redis }> => {
	const redisInstance =
		receiptRegion && receiptRegion !== currentRegion
			? getRegionalRedis(receiptRegion)
			: redis;

	const result = await tryRedisWrite(
		() => redisInstance.claimLockReceipt(lockReceiptKey),
		redisInstance,
	);

	if (result === null) {
		throw new InternalError({
			message: "Redis not ready for claimLockReceipt",
		});
	}

	if (result === "OK") {
		return { redisInstance };
	}

	throw new RecaseError({
		message: `Lock receipt not claimable: ${result}`,
		code: ErrCode.InvalidRequest,
		statusCode: 409,
		data: { blockingStatus: result },
	});
};
