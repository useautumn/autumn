import { acquireLock, DEFAULT_LOCK_ERROR_MESSAGE } from "./acquireLock.js";
import { clearLock } from "./clearLock.js";

/**
 * Execute a function with a distributed lock. Acquires lock, runs the function, then releases the lock.
 * Ensures lock is always released even if the function throws an error.
 */
export const withLock = async <T>({
	lockKey,
	ttlMs = 10000,
	errorMessage = DEFAULT_LOCK_ERROR_MESSAGE,
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
