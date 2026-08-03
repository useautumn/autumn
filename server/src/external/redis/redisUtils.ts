import { ErrCode, RecaseError } from "@autumn/shared";
import { getPrimaryRedis } from "./initRedis.js";

// Locks live on the primary Redis: regional instances are independent stores,
// so a region-local lock would not exclude a webhook processed in another region.
const OWNED_DELETE_SCRIPT = `local value = redis.call("GET", KEYS[1])
if not value then return 0 end
local ok, lock = pcall(cjson.decode, value)
if not ok or type(lock) ~= "table" or lock.token ~= ARGV[1] then return 0 end
return redis.call("DEL", KEYS[1])`;

const OWNED_REFRESH_SCRIPT = `local value = redis.call("GET", KEYS[1])
if not value then return 0 end
local ok, lock = pcall(cjson.decode, value)
if not ok or type(lock) ~= "table" or lock.token ~= ARGV[1] then return 0 end
return redis.call("PEXPIRE", KEYS[1], ARGV[2])`;

/** Best-effort: with `token`, deletes only if this holder still owns the lock; never throws (TTL reaps). */
export const clearLock = async ({
	lockKey,
	token,
}: {
	lockKey: string;
	token?: string;
}) => {
	try {
		const redis = getPrimaryRedis();
		if (redis.status !== "ready") return;

		if (token) {
			await redis.eval(OWNED_DELETE_SCRIPT, 1, lockKey, token);
		} else {
			await redis.del(lockKey);
		}
	} catch {
		// Release is best-effort — an uncleared lock expires by TTL.
	}
};

/** Best-effort one-shot lease extension for a still-owned lock. */
export const refreshLockLease = async ({
	lockKey,
	token,
	ttlMs,
}: {
	lockKey: string;
	token: string;
	ttlMs: number;
}) => {
	try {
		const redis = getPrimaryRedis();
		if (redis.status !== "ready") return;
		await redis.eval(OWNED_REFRESH_SCRIPT, 1, lockKey, token, ttlMs.toString());
	} catch {
		// Refresh is best-effort — worst case the original lease stands.
	}
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
	const redis = getPrimaryRedis();

	// If Redis not ready, allow operation to proceed
	if (redis.status !== "ready") {
		return true;
	}

	let conflict = false;
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
			conflict = true;
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

		// A known conflict must stay a conflict even if reading its message failed
		if (conflict) {
			throw new RecaseError({
				message: DEFAULT_ERROR_MESSAGE,
				code: ErrCode.LockAlreadyExists,
				statusCode: 423,
			});
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
