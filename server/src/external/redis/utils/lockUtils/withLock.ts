import { acquireLock, DEFAULT_LOCK_ERROR_MESSAGE } from "./acquireLock.js";
import { clearLock } from "./clearLock.js";

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
