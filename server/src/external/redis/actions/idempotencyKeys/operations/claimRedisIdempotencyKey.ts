import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import {
	IDEMPOTENCY_TTL_MS,
	type IdempotencyClaimResult,
} from "@/internal/misc/idempotency/idempotencyKeyUtils.js";

export const claimRedisIdempotencyKey = async ({
	storageKey,
	ttlMs = IDEMPOTENCY_TTL_MS,
}: {
	storageKey: string;
	ttlMs?: number;
}): Promise<IdempotencyClaimResult> => {
	const miscRedis = getMiscRedis();

	// SET NX (set if not exists) for an atomic check-and-set.
	const wasSet = await tryRedisOp({
		operation: () => miscRedis.set(storageKey, "1", "PX", ttlMs, "NX"),
		source: "idempotency-key:claim",
		redisInstance: miscRedis,
	});

	if (wasSet === undefined) return "unavailable";
	return wasSet ? "claimed" : "duplicate";
};
