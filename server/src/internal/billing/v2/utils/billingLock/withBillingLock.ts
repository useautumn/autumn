import { setTimeout as sleep } from "node:timers/promises";
import { ErrCode, RecaseError } from "@autumn/shared";
import { acquireLock, clearLock } from "@/external/redis/redisUtils";

const BILLING_LOCK_TTL_MS = 120_000;
const BILLING_LOCK_WAIT_MS = BILLING_LOCK_TTL_MS + 5_000;
const BILLING_LOCK_RETRY_MS = 100;

/** Waits (bounded) for every key, runs fn, then releases only locks this call still owns. */
export const withBillingLock = async <T>({
	lockKeys,
	fn,
}: {
	lockKeys: string[];
	fn: () => Promise<T>;
}): Promise<T> => {
	const token = crypto.randomUUID();
	// Sorted so concurrent multi-key holders acquire in the same order (no deadlock).
	const sortedKeys = [...new Set(lockKeys)].sort();
	const deadline = Date.now() + BILLING_LOCK_WAIT_MS;
	const heldKeys: string[] = [];

	try {
		for (const lockKey of sortedKeys) {
			while (true) {
				try {
					await acquireLock({ lockKey, ttlMs: BILLING_LOCK_TTL_MS, token });
					heldKeys.push(lockKey);
					break;
				} catch (error) {
					if (!isBillingLockConflict(error) || Date.now() >= deadline) {
						throw error;
					}
					await sleep(BILLING_LOCK_RETRY_MS);
				}
			}
		}

		return await fn();
	} finally {
		for (const lockKey of heldKeys) {
			await clearLock({ lockKey, token });
		}
	}
};

const isBillingLockConflict = (error: unknown) =>
	error instanceof RecaseError && error.code === ErrCode.LockAlreadyExists;
