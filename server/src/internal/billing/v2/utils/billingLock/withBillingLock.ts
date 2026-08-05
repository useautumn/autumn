import { acquireLockWithWait } from "@/external/redis/utils/lockUtils/acquireLockWithWait.js";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock.js";
import { refreshLockLease } from "@/external/redis/utils/lockUtils/refreshLockLease.js";

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
	// One deadline across ALL keys — it outlives any legitimately-held lease, so
	// a waiter can only time out under continuous reacquisition by others.
	const deadline = Date.now() + BILLING_LOCK_WAIT_MS;
	const heldKeys: string[] = [];

	try {
		for (const lockKey of sortedKeys) {
			await acquireLockWithWait({
				lockKey,
				ttlMs: BILLING_LOCK_TTL_MS,
				token,
				maxWaitMs: deadline - Date.now(),
				retryMs: BILLING_LOCK_RETRY_MS,
			});
			heldKeys.push(lockKey);
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
