import { ErrCode, InternalError, RecaseError } from "@autumn/shared";
import type { Redis } from "ioredis";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

export const saveLockReceipt = async ({
	redisInstance,
	lock,
	customerId,
	featureId,
	entityId,
	items,
}: {
	redisInstance: Redis;
	lock: {
		lock_id?: string;
		hashed_key?: string;
		expires_at?: number;
		redis_receipt_key: string;
		created_at: number;
		ttl_at: number;
	};
	customerId: string;
	featureId: string;
	entityId?: string;
	items: MutationLogItem[];
}) => {
	const existing = await redisInstance.call("EXISTS", lock.redis_receipt_key);
	if (existing === 1) {
		throw new RecaseError({
			message: "A lock with this ID already exists",
			code: ErrCode.LockAlreadyExists,
			statusCode: 409,
		});
	}

	const result = await tryRedisWrite(
		() =>
			redisInstance.call(
				"JSON.SET",
				lock.redis_receipt_key,
				"$",
				JSON.stringify({
					lock_id: lock.lock_id ?? null,
					hashed_key: lock.hashed_key ?? null,
					status: "pending",
					region: currentRegion,
					customer_id: customerId,
					feature_id: featureId,
					entity_id: entityId ?? null,
					expires_at: lock.expires_at ?? null,
					created_at: lock.created_at,
					items,
				}),
			) as Promise<"OK" | null>,
		redisInstance,
	);

	if (result === "OK") {
		await redisInstance.expireat(lock.redis_receipt_key, lock.ttl_at);
		return;
	}

	throw new InternalError({
		message: `Failed to save lock receipt for ID: ${lock.lock_id ?? lock.hashed_key}`,
	});
};
