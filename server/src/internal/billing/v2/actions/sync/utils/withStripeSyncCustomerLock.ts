import { ErrCode, ms, RecaseError } from "@autumn/shared";
import { acquireLock, clearLock } from "@/external/redis/redisUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { timeout } from "@/utils/genUtils";

const LOCK_TIMEOUT_MS = ms.seconds(30);

/** Serializes initial imports with subscription-created webhooks and waits for the winner. */
export const withStripeSyncCustomerLock = async <T>({
	ctx,
	customerId,
	run,
}: {
	ctx: AutumnContext;
	customerId: string;
	run: () => Promise<T>;
}) => {
	const lockKey = `lock:stripe-sync:${ctx.org.id}:${ctx.env}:${customerId}`;
	const deadline = Date.now() + LOCK_TIMEOUT_MS;
	while (true) {
		try {
			await acquireLock({ lockKey, ttlMs: LOCK_TIMEOUT_MS });
			break;
		} catch (error) {
			if (
				!(error instanceof RecaseError) ||
				error.code !== ErrCode.LockAlreadyExists ||
				Date.now() >= deadline
			) {
				throw error;
			}
			await timeout(50);
		}
	}

	try {
		return await run();
	} finally {
		await clearLock({ lockKey });
	}
};
