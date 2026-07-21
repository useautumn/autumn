import { setTimeout as sleep } from "node:timers/promises";
import { ErrCode, RecaseError } from "@autumn/shared";
import { acquireLock, clearLock } from "@/external/redis/redisUtils";

const BILLING_LOCK_TTL_MS = 120_000;
const BILLING_LOCK_WAIT_MS = BILLING_LOCK_TTL_MS + 5_000;
const BILLING_LOCK_RETRY_MS = 100;

export const withBillingLock = async <T>({
	lockKey,
	fn,
}: {
	lockKey: string;
	fn: () => Promise<T>;
}): Promise<T> => {
	const deadline = Date.now() + BILLING_LOCK_WAIT_MS;

	while (true) {
		try {
			await acquireLock({ lockKey, ttlMs: BILLING_LOCK_TTL_MS });
			break;
		} catch (error) {
			if (!isBillingLockConflict(error) || Date.now() >= deadline) throw error;
			await sleep(BILLING_LOCK_RETRY_MS);
		}
	}

	try {
		return await fn();
	} finally {
		await clearLock({ lockKey });
	}
};

const isBillingLockConflict = (error: unknown) =>
	error instanceof RecaseError && error.code === ErrCode.LockAlreadyExists;
