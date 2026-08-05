import { miscRedis } from "@/external/redis/initRedis.js";
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
	if (miscRedis.status !== "ready") return "unavailable";

	try {
		// SET NX (set if not exists) for an atomic check-and-set.
		const wasSet = await miscRedis.set(storageKey, "1", "PX", ttlMs, "NX");
		return wasSet ? "claimed" : "duplicate";
	} catch {
		return "unavailable";
	}
};
