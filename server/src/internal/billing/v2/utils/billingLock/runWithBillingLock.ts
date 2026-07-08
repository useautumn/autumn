import { withLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildBillingLockKey } from "./buildBillingLockKey.js";

type LockAwareContext = AutumnContext & {
	heldBillingLockKeys?: Set<string>;
};

export const markBillingLockHeld = ({
	ctx,
	lockKey,
}: {
	ctx: AutumnContext;
	lockKey: string;
}) => {
	const lockCtx = ctx as LockAwareContext;
	lockCtx.heldBillingLockKeys ??= new Set();
	lockCtx.heldBillingLockKeys.add(lockKey);
};

export const unmarkBillingLockHeld = ({
	ctx,
	lockKey,
}: {
	ctx: AutumnContext;
	lockKey: string;
}) => {
	(ctx as LockAwareContext).heldBillingLockKeys?.delete(lockKey);
};

/**
 * Runs fn under the customer billing lock, reentrantly: when the lock is
 * already held on this request (stamped on ctx by the route lock middleware or
 * a prior wrapper), fn runs inline instead of deadlocking on re-acquisition.
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

	const lockKey = buildBillingLockKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});
	if ((ctx as LockAwareContext).heldBillingLockKeys?.has(lockKey)) {
		return await fn();
	}

	markBillingLockHeld({ ctx, lockKey });
	try {
		return await withLock({ lockKey, ttlMs, errorMessage, fn });
	} finally {
		unmarkBillingLockHeld({ ctx, lockKey });
	}
};
