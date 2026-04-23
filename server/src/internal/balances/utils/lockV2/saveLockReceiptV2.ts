import { ErrCode, RecaseError } from "@autumn/shared";
import type { Redis } from "ioredis";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/**
 * V2 save-lock-receipt. Stores the receipt as a plain JSON string via a single
 * `SET key value NX EXAT ttl_at` call — one Redis round trip instead of the
 * V1 `EXISTS` + `JSON.SET` + `EXPIREAT` sequence, and closes the EXISTS/SET
 * race since the atomic NX guards against concurrent creates.
 */
export const saveLockReceiptV2 = async ({
	lock,
	customerId,
	featureId,
	entityId,
	items,
	redisInstance,
}: {
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
	redisInstance: Redis;
}) => {
	const payload = JSON.stringify({
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
	});

	const result = await tryRedisWrite(
		() =>
			redisInstance.call(
				"SET",
				lock.redis_receipt_key,
				payload,
				"NX",
				"EXAT",
				lock.ttl_at,
			) as Promise<"OK" | null>,
		redisInstance,
	);

	if (result === "OK") return;

	throw new RecaseError({
		message: "A lock with this ID already exists",
		code: ErrCode.LockAlreadyExists,
		statusCode: 409,
	});
};
