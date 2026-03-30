import { ErrCode, InternalError, RecaseError } from "@autumn/shared";
import type { Redis } from "ioredis";
import { resolveRedisForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/**
 * Atomically claims a lock receipt: pending → processing.
 *
 * Uses resolveRedisForCustomer with region to handle both cases:
 * - Orgs with dedicated Redis: per-customer bucket routing (region ignored)
 * - Orgs on master Redis: routes to the receipt's origin region for Active-Active
 *
 * Returns the Redis instance used — callers must use it for all subsequent
 * operations (unwind deduction, delete) to stay on the same instance.
 */
export const claimLockReceipt = async ({
	ctx,
	lockReceiptKey,
	receiptRegion,
}: {
	ctx: AutumnContext;
	lockReceiptKey: string;
	receiptRegion?: string | null;
}): Promise<{ redisInstance: Redis }> => {
	const redisInstance = resolveRedisForCustomer({
		org: ctx.org,
		customerId: ctx.customerId,
		region: receiptRegion,
	});

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
