import { ErrCode, RecaseError } from "@autumn/shared";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { redis } from "./initRedis.js";

/** With `token`, deletes only if this holder still owns the lock (expired-lease safety). */
export const clearLock = async ({
	lockKey,
	token,
}: {
	lockKey: string;
	token?: string;
}) => {
	if (!token) {
		await tryRedisWrite(() => redis.del(lockKey));
		return;
	}

	await tryRedisWrite(() =>
		redis.eval(
			`local value = redis.call("GET", KEYS[1])
			if not value then return 0 end
			local ok, lock = pcall(cjson.decode, value)
			if not ok or lock.token ~= ARGV[1] then return 0 end
			return redis.call("DEL", KEYS[1])`,
			1,
			lockKey,
			token,
		),
	);
};

interface LockData {
	errorMessage: string;
	token?: string;
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
	token,
}: {
	lockKey: string;
	ttlMs?: number;
	errorMessage?: string;
	token?: string;
}): Promise<boolean> => {
	// If Redis not ready, allow operation to proceed
	if (redis.status !== "ready") {
		return true;
	}

	try {
		// NX = only set if key doesn't exist, PX = set expiry in milliseconds
		// Store as JSON for future extensibility
		const lockData: LockData = { errorMessage, token };
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
	fn,
}: {
	lockKey: string;
	ttlMs?: number;
	errorMessage?: string;
	fn: () => Promise<T>;
}): Promise<T> => {
	const token = crypto.randomUUID();
	await acquireLock({ lockKey, ttlMs, errorMessage, token });

	try {
		return await fn();
	} finally {
		await clearLock({ lockKey, token });
	}
};
