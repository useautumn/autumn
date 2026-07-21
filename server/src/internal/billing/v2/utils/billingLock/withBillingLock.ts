import { setTimeout as sleep } from "node:timers/promises";
import { ErrCode, RecaseError } from "@autumn/shared";
import {
	acquireLock,
	clearLock,
	refreshLockLease,
} from "@/external/redis/redisUtils";

// Bounded lease, never heartbeat-renewed: a wedged holder must not lock a customer out forever.
// Past-lease overlap is still safe — the checkout reservation clears only after materialization.
const BILLING_LOCK_TTL_MS = 300_000;
const BILLING_LOCK_WAIT_MS = BILLING_LOCK_TTL_MS + 5_000;
const BILLING_LOCK_RETRY_MS = 250;

/** Background-only (early-acked webhooks — HTTP routes 423 instantly instead of waiting).
 * Waits (bounded) for every key, runs fn, then releases only locks this call still owns. */
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
	// Outlives any legitimately-held lease, so a waiter can only time out under
	// continuous reacquisition by others — never against a single stuck holder.
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

		// Earlier keys' leases burned down while waiting for later ones — re-arm
		// once so every lease covers the full critical section.
		for (const lockKey of heldKeys) {
			await refreshLockLease({ lockKey, token, ttlMs: BILLING_LOCK_TTL_MS });
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
