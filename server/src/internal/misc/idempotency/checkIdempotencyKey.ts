import { ErrCode, ms, RecaseError } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils";
import { redis } from "@/external/redis/initRedis.js";

const IDEMPOTENCY_TTL_MS = ms.hours(24);

const hashIdempotencyKey = (key: string): string => {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(key);
	return hasher.digest("base64url");
};

const buildIdempotencyRedisKey = ({
	orgId,
	env,
	idempotencyKey,
}: {
	orgId: string;
	env: string;
	idempotencyKey: string;
}): string => {
	const hashedKey = hashIdempotencyKey(idempotencyKey);
	return `${orgId}:${env}:idempotency:${hashedKey}`;
};

/**
 * Releases (deletes) a previously-claimed idempotency key.
 *
 * Use this when the side-effecting operation guarded by the key FAILS, so the
 * caller can safely retry without hitting a 24-hour 409 wall on a deduction
 * that never actually committed. See bug #1138.
 *
 * Mirrors `checkIdempotencyKey`'s fail-open Redis-not-ready behavior — if the
 * delete itself fails or Redis is down, we don't surface that to the caller
 * (the original deduction error is what they care about).
 */
export const releaseIdempotencyKey = async ({
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
	if (redis.status !== "ready") return;
	const redisKey = buildIdempotencyRedisKey({ orgId, env, idempotencyKey });
	try {
		await redis.del(redisKey);
		logger.info(
			`[releaseIdempotencyKey] released idempotency key ${idempotencyKey}`,
		);
	} catch (error) {
		// Best-effort release. The caller already has a real error to report;
		// the worst case of a release failure is a 24h TTL on a key that's
		// safe to leave (won't double-charge anyone).
		logger.warn(
			`[releaseIdempotencyKey] failed to release ${idempotencyKey}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
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

	const redisKey = buildIdempotencyRedisKey({ orgId, env, idempotencyKey });

	try {
		// Use SET NX (set if not exists) for atomic check-and-set to prevent race conditions
		logger.info(
			`[checkIdempotencyKey] setting idempotency key ${idempotencyKey}`,
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
