import { withLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildBillingLockKey } from "./buildBillingLockKey.js";

/**
 * Entry-point helper: runs fn under the customer billing lock. Locks are
 * acquired at entry points only (route lock config or this wrapper) — shared
 * functions assume the lock is held, never re-acquire.
 */
export const runWithBillingLock = async <T>({
	ctx,
	customerId,
	ttlMs = 120000,
	errorMessage,
	fn,
}: {
	ctx: AutumnContext;
	customerId: string;
	ttlMs?: number;
	errorMessage?: string;
	fn: () => Promise<T>;
}): Promise<T> => {
	if (process.env.NODE_ENV === "development") return await fn();

	return await withLock({
		lockKey: buildBillingLockKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		}),
		ttlMs,
		errorMessage,
		fn,
	});
};
