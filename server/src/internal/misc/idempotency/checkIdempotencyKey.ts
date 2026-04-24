import { ErrCode, ms, RecaseError } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils";
import { redis } from "@/external/redis/initRedis.js";

const IDEMPOTENCY_TTL_MS = ms.hours(24);

const hashIdempotencyKey = (key: string): string => {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(key);
	return hasher.digest("base64url");
};

/**
 * Checks and sets an idempotency key in Redis using atomic SET NX operation.
 * If Redis is not ready, allows the request to proceed (fail-open).
 * Throws if the key already exists (duplicate request).
 */
export const checkIdempotencyKey = async ({
	orgId,
	env,
	idempotencyKey,
	logger,
}: {
	orgId: string;
	env: string;
	idempotencyKey: string;
	logger: Logger;
}): Promise<void> => {
	// Fail-open: if Redis is not ready, allow the request
	if (redis.status !== "ready") {
		return;
	}

	const hashedKey = hashIdempotencyKey(idempotencyKey);
	const redisKey = `${orgId}:${env}:idempotency:${hashedKey}`;

	try {
		// Use SET NX (set if not exists) for atomic check-and-set to prevent race conditions
		logger.info(
			`[checkIdempotencyKey] setting idempotency key ${idempotencyKey}, hash: ${hashedKey}`,
		);

		const wasSet = await redis.set(
			redisKey,
			"1",
			"PX",
			IDEMPOTENCY_TTL_MS,
			"NX",
		);

		if (!wasSet) {
			throw new RecaseError({
				message: `Another request with idempotency key ${idempotencyKey} has already been received`,
				code: ErrCode.DuplicateIdempotencyKey,
				statusCode: 409,
			});
		}
	} catch (error) {
		// Re-throw RecaseError (duplicate key)
		if (error instanceof RecaseError) {
			throw error;
		}
		// For other Redis errors, fail-open (allow request)
		return;
	}
};
