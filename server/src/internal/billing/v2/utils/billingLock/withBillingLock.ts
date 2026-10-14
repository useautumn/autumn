import { acquireLockWithWait } from "@/external/redis/utils/lockUtils/acquireLockWithWait.js";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock.js";
import { refreshLockLease } from "@/external/redis/utils/lockUtils/refreshLockLease.js";

const BILLING_LOCK_TTL_MS = 300_000;
const BILLING_LOCK_WAIT_MS = BILLING_LOCK_TTL_MS + 5_000;
const BILLING_LOCK_RETRY_MS = 250;

export const withBillingLock = async <T>({
	lockKeys,
	fn,
}: {
	lockKeys: string[];
	fn: () => Promise<T>;
}): Promise<T> => {
	const token = crypto.randomUUID();
	const sortedKeys = [...new Set(lockKeys)].sort();
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
