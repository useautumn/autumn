import { DocsLinks, ErrCode, RecaseError } from "@autumn/shared";
import type { Redis } from "ioredis";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/**
 * Atomically claims a lock receipt: pending → processing.
 *
 * Throws RecaseError for terminal/already-processing statuses.
 * Throws a retryable 503 RecaseError when Redis is unavailable.
 */
export const claimLockReceipt = async ({
	lockReceiptKey,
	redisInstance,
}: {
	lockReceiptKey: string;
	redisInstance: Redis;
}): Promise<void> => {
	const result = await tryRedisWrite(
		() => redisInstance.claimLockReceipt(lockReceiptKey),
		redisInstance,
	);

	if (result === null) {
		throw new RecaseError({
			message: "Redis is temporarily unavailable, please retry.",
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}

	if (result === "OK") {
		return;
	}

	throw new RecaseError({
		message: `Lock receipt not claimable: ${result}`,
		code: ErrCode.InvalidRequest,
		statusCode: 409,
		data: { blockingStatus: result },
		docsUrl: DocsLinks.ConcurrentRequests,
	});
};
