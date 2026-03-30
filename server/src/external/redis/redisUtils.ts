import { ErrCode, RecaseError } from "@autumn/shared";
import type { Redis } from "ioredis";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { redis } from "./initRedis.js";

export const clearLock = async ({
	lockKey,
	redisInstance,
}: {
	lockKey: string;
	redisInstance?: Redis;
}) => {
	const targetRedis = redisInstance ?? redis;
	await tryRedisWrite(() => targetRedis.del(lockKey), targetRedis);
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
	redisInstance,
}: {
	lockKey: string;
	ttlMs?: number;
	errorMessage?: string;
	redisInstance?: Redis;
}): Promise<boolean> => {
	const targetRedis = redisInstance ?? redis;

	// If Redis not ready, allow operation to proceed
	if (targetRedis.status !== "ready") {
		return true;
	}

	try {
		const lockData: LockData = { errorMessage };
		const result = await targetRedis.set(
			lockKey,
			JSON.stringify(lockData),
			"PX",
			ttlMs,
			"NX",
		);

		// If result is null, lock already exists (NX failed)
		if (result === null) {
			const existingData = await targetRedis.get(lockKey);
			const parsed = existingData
				? (JSON.parse(existingData) as LockData)
				: null;

			throw new RecaseError({
				message: parsed?.errorMessage || DEFAULT_ERROR_MESSAGE,
				code: ErrCode.LockAlreadyExists,
				statusCode: 423,
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
	redisInstance,
	fn,
}: {
	lockKey: string;
	ttlMs?: number;
	errorMessage?: string;
	redisInstance?: Redis;
	fn: () => Promise<T>;
}): Promise<T> => {
	await acquireLock({ lockKey, ttlMs, errorMessage, redisInstance });

	try {
		return await fn();
	} finally {
		await clearLock({ lockKey, redisInstance });
	}
};
