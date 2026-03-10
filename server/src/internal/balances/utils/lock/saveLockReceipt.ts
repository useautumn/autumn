import { InternalError } from "@autumn/shared";
import { currentRegion, redis } from "@/external/redis/initRedis.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

export const saveLockReceipt = async ({
	lock,
	customerId,
	featureId,
	entityId,
	items,
}: {
	lock: {
		key?: string;
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
	const result = await tryRedisWrite(
		() =>
			redis.call(
				"JSON.SET",
				lock.redis_receipt_key,
				"$",
				JSON.stringify({
					lock_key: lock.key ?? null,
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
	);

	if (result === "OK") {
		await redis.expireat(lock.redis_receipt_key, lock.ttl_at);
		return;
	}

	throw new InternalError({
		message: `Failed to save lock receipt for key: ${lock.key ?? lock.hashed_key}`,
	});
};
