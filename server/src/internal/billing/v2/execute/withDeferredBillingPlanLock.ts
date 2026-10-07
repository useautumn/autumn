import type { AppEnv } from "@autumn/shared";
import { acquireLock } from "@/external/redis/utils/lockUtils/acquireLock";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock";

// Outlives a normal execution; a crashed holder's lock expires so a retry can resume.
const DEFERRED_PLAN_LOCK_TTL_MS = 5 * 60 * 1000;

/** Serializes activation and expiry of one deferred plan; a contender throws a lock conflict. */
export const withDeferredBillingPlanLock = async <T>({
	orgId,
	env,
	metadataId,
	fn,
}: {
	orgId: string;
	env: AppEnv;
	metadataId: string;
	fn: () => Promise<T>;
}): Promise<T> => {
	const lockKey = `lock:deferred-billing-plan:${orgId}:${env}:${metadataId}`;
	const token = crypto.randomUUID();
	await acquireLock({
		lockKey,
		token,
		ttlMs: DEFERRED_PLAN_LOCK_TTL_MS,
		errorMessage: `Deferred billing plan ${metadataId} is already being processed`,
		failOpen: false,
	});

	try {
		return await fn();
	} finally {
		await clearLock({ lockKey, token });
	}
};
