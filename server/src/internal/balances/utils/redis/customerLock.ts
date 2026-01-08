import { redis } from "@/external/redis/initRedis.js";

const LOCK_TTL_MS = 5000; // 5 second max lock hold
const LOCK_RETRY_DELAY_MS = 10;
const LOCK_MAX_RETRIES = 500; // 5 seconds total wait

const acquireLock = async (lockKey: string): Promise<boolean> => {
	const result = await redis.set(lockKey, "1", "PX", LOCK_TTL_MS, "NX");
	return result === "OK";
};

const releaseLock = async (lockKey: string): Promise<void> => {
	await redis.del(lockKey);
};

/**
 * Execute a function while holding a lock for a specific customer.
 * Ensures only one operation runs at a time per customer to prevent race conditions.
 */
export const withCustomerLock = async <T>({
	orgId,
	env,
	customerId,
	fn,
}: {
	orgId: string;
	env: string;
	customerId: string;
	fn: () => Promise<T>;
}): Promise<T> => {
	const lockKey = `lock:${orgId}:${env}:${customerId}`;

	// Acquire lock with retry
	let acquired = false;
	for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
		acquired = await acquireLock(lockKey);
		if (acquired) break;
		await new Promise((r) => setTimeout(r, LOCK_RETRY_DELAY_MS));
	}

	if (!acquired) {
		throw new Error(`Failed to acquire customer lock for ${customerId}`);
	}

	try {
		return await fn();
	} finally {
		await releaseLock(lockKey);
	}
};
