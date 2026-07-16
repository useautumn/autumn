import { randomUUID } from "node:crypto";
import { ErrCode, RecaseError } from "@autumn/shared";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { redis } from "./initRedis.js";

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0
`;

const RENEW_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

interface LockData {
	errorMessage: string;
	ownerToken: string;
}

const DEFAULT_ERROR_MESSAGE =
	"Operation already in progress, try again in a few seconds";

export const clearLock = async ({
	lockKey,
	lockValue,
}: {
	lockKey: string;
	lockValue: string | null;
}): Promise<boolean> => {
	if (!lockValue || redis.status !== "ready") return false;

	try {
		const result = await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
		return result === 1;
	} catch {
		// The TTL still guarantees eventual release if Redis becomes unavailable.
		return false;
	}
};

const renewLock = async ({
	lockKey,
	lockValue,
	ttlMs,
}: {
	lockKey: string;
	lockValue: string;
	ttlMs: number;
}): Promise<boolean> => {
	if (redis.status !== "ready") return false;

	const result = await runRedisOp({
		operation: () =>
			redis.eval(RENEW_LOCK_SCRIPT, 1, lockKey, lockValue, ttlMs),
		source: "renewLock",
	});
	return result === 1;
};

/**
 * Acquire a distributed lock using Redis.
 * If Redis is not ready or errors, returns null by default to preserve the
 * existing fail-open behavior. Pass `failOpen: false` for correctness-critical
 * callers that must never proceed without serialization.
 */
export const acquireLock = async ({
	lockKey,
	ttlMs = 10000,
	errorMessage = DEFAULT_ERROR_MESSAGE,
	failOpen = true,
}: {
	lockKey: string;
	ttlMs?: number;
	errorMessage?: string;
	failOpen?: boolean;
}): Promise<string | null> => {
	// If Redis not ready, allow operation to proceed
	if (failOpen && redis.status !== "ready") {
		return null;
	}

	const lockData: LockData = {
		errorMessage,
		ownerToken: randomUUID(),
	};
	const lockValue = JSON.stringify(lockData);
	const setLock = () =>
		redis.set(lockKey, lockValue, "PX", ttlMs, "NX") as Promise<"OK" | null>;

	try {
		// NX = only set if key doesn't exist, PX = set expiry in milliseconds
		const result = failOpen
			? await setLock()
			: await runRedisOp({
					operation: setLock,
					source: "acquireLock",
				});

		// If result is null, lock already exists (NX failed)
		if (result === null) {
			const existingData = failOpen
				? await redis.get(lockKey)
				: await runRedisOp({
						operation: () => redis.get(lockKey),
						source: "acquireLock:existing",
					});
			const parsed = existingData
				? (JSON.parse(existingData) as LockData)
				: null;

			throw new RecaseError({
				message: parsed?.errorMessage || DEFAULT_ERROR_MESSAGE,
				code: ErrCode.LockAlreadyExists,
				statusCode: 423,
			});
		}

		return lockValue;
	} catch (error) {
		// Re-throw lock conflict errors
		if (error instanceof RecaseError || !failOpen) {
			throw error;
		}

		// Redis error - allow operation to proceed
		return null;
	}
};

const waitForLockRetry = ({ maxDelayMs }: { maxDelayMs: number }) =>
	new Promise<void>((resolve) => {
		const jitterMs = Math.floor(Math.random() * 50);
		setTimeout(resolve, Math.min(75 + jitterMs, maxDelayMs));
	});

const waitForLeaseRenewal = ({
	delayMs,
	signal,
}: {
	delayMs: number;
	signal: AbortSignal;
}): Promise<boolean> => {
	if (signal.aborted) return Promise.resolve(false);

	return new Promise((resolve) => {
		const onAbort = () => {
			clearTimeout(timeoutId);
			resolve(false);
		};
		const timeoutId = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve(true);
		}, delayMs);
		signal.addEventListener("abort", onAbort, { once: true });
	});
};

const createLockOwnershipLostError = () =>
	new RecaseError({
		message: "Lost ownership of operation lock while work was still running",
		code: ErrCode.LockAlreadyExists,
		statusCode: 423,
	});

const createLockWaitTimeoutError = ({ maxWaitMs }: { maxWaitMs: number }) =>
	new RecaseError({
		message: `Timed out after ${maxWaitMs}ms waiting for operation lock`,
		code: ErrCode.LockAlreadyExists,
		statusCode: 423,
	});

type OwnedLockContext = {
	assertLockOwned: () => void;
};

const runWithOwnedLock = async <T>({
	lockKey,
	lockValue,
	ttlMs,
	fn,
}: {
	lockKey: string;
	lockValue: string | null;
	ttlMs: number;
	fn: (context: OwnedLockContext) => Promise<T>;
}): Promise<T> => {
	if (!lockValue) {
		return fn({ assertLockOwned: () => undefined });
	}

	const renewalController = new AbortController();
	let ownershipError: unknown;
	const assertLockOwned = () => {
		if (ownershipError) throw ownershipError;
	};
	const renewalPromise = (async () => {
		const renewalIntervalMs = Math.max(1, Math.floor(ttlMs / 3));
		while (
			await waitForLeaseRenewal({
				delayMs: renewalIntervalMs,
				signal: renewalController.signal,
			})
		) {
			try {
				const renewed = await renewLock({ lockKey, lockValue, ttlMs });
				if (!renewed) {
					ownershipError = createLockOwnershipLostError();
					renewalController.abort();
				}
			} catch (error) {
				ownershipError = error;
				renewalController.abort();
			}
		}
	})();

	try {
		const result = await fn({ assertLockOwned });
		assertLockOwned();
		return result;
	} finally {
		renewalController.abort();
		await renewalPromise;
		await clearLock({ lockKey, lockValue });
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
	const lockValue = await acquireLock({ lockKey, ttlMs, errorMessage });

	try {
		return await fn();
	} finally {
		await clearLock({ lockKey, lockValue });
	}
};

/**
 * Execute a function after waiting for exclusive ownership of a lock.
 * Unlike `withLock`, this is fail-closed when Redis is unavailable, bounds
 * acquisition by `maxWaitMs`, and renews the owned lease until work settles.
 */
export const withWaitingLock = async <T>({
	lockKey,
	ttlMs,
	maxWaitMs,
	errorMessage = DEFAULT_ERROR_MESSAGE,
	fn,
}: {
	lockKey: string;
	ttlMs: number;
	maxWaitMs: number;
	errorMessage?: string;
	fn: (context: OwnedLockContext) => Promise<T>;
}): Promise<T> => {
	let lockValue: string | null = null;
	const deadlineMs = Date.now() + maxWaitMs;

	while (!lockValue) {
		try {
			lockValue = await acquireLock({
				lockKey,
				ttlMs,
				errorMessage,
				failOpen: false,
			});
		} catch (error) {
			if (
				error instanceof RecaseError &&
				error.code === ErrCode.LockAlreadyExists
			) {
				const remainingMs = deadlineMs - Date.now();
				if (remainingMs <= 0) {
					throw createLockWaitTimeoutError({ maxWaitMs });
				}
				await waitForLockRetry({ maxDelayMs: remainingMs });
				if (Date.now() >= deadlineMs) {
					throw createLockWaitTimeoutError({ maxWaitMs });
				}
				continue;
			}
			throw error;
		}
	}

	return runWithOwnedLock({ lockKey, lockValue, ttlMs, fn });
};
