import { ErrCode, RecaseError } from "@autumn/shared";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { redis } from "./initRedis.js";

export const clearLock = async ({ lockKey }: { lockKey: string }) => {
	await tryRedisWrite(() => redis.del(lockKey));
};

interface LockData {
	errorMessage: string;
}

const DEFAULT_ERROR_MESSAGE =
	"Operation already in progress, try again in a few seconds";

/**
 * Acquire a distributed lock using Redis.
 * If Redis is not ready or errors, returns true to allow the operation to proceed.
 * @returns true if lock was acquired (or Redis unavailable), throws if lock already exists
 */
export const acquireLock = async ({
	lockKey,
	ttlMs = 10000,
	errorMessage = DEFAULT_ERROR_MESSAGE,
}: {
	lockKey: string;
	ttlMs?: number;
	errorMessage?: string;
}): Promise<boolean> => {
	// If Redis not ready, allow operation to proceed
	if (redis.status !== "ready") {
		return true;
	}

	try {
		// NX = only set if key doesn't exist, PX = set expiry in milliseconds
		// Store as JSON for future extensibility
		const lockData: LockData = { errorMessage };
		const result = await redis.set(
			lockKey,
			JSON.stringify(lockData),
			"PX",
			ttlMs,
			"NX",
		);

		// If result is null, lock already exists (NX failed)
		if (result === null) {
			const existingData = await redis.get(lockKey);
			const parsed = existingData
				? (JSON.parse(existingData) as LockData)
				: null;

			throw new RecaseError({
				message: parsed?.errorMessage || DEFAULT_ERROR_MESSAGE,
				code: ErrCode.InvalidRequest,
				statusCode: 429,
			});
		}

		return true;
	} catch (error) {
		// Re-throw lock conflict errors
		if (error instanceof RecaseError) {
			throw error;
		}

		// Redis error - allow operation to proceed
		return true;
	}
};

/**
 * Execute a function with a distributed lock. Acquires lock, runs the function, then releases the lock.
 * Ensures lock is always released even if the function throws an error.
 */
export const withLock = async <T>({
	lockKey,
	ttlMs = 10000,
	errorMessage = DEFAULT_ERROR_MESSAGE,
	fn,
}: {
	lockKey: string;
	ttlMs?: number;
	errorMessage?: string;
	fn: () => Promise<T>;
}): Promise<T> => {
	await acquireLock({ lockKey, ttlMs, errorMessage });

	try {
		return await fn();
	} finally {
		await clearLock({ lockKey });
	}
};
