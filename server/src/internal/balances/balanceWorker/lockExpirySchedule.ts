import type { LockParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { workflows } from "@/queue/workflows.js";
import { buildLockScheduleName } from "../utils/lock/buildLockScheduleName.js";
import { cancelLockExpiry } from "../utils/lock/cancelLockExpiry.js";

/**
 * Only a caller-supplied expiry gets an EventBridge timer; every other lock is settled by the sweep.
 * Both are best effort: the sweep picks up a lock whose timer was never created or never fired.
 */
export async function scheduleLockExpiry({
	ctx,
	customerId,
	lock,
}: {
	ctx: AutumnContext;
	customerId: string;
	lock: Pick<LockParams, "lock_id" | "expires_at">;
}): Promise<void> {
	if (lock.expires_at === undefined) return;
	// The same key the legacy path derives, so either path can cancel the other's timer.
	const hashedKey = Bun.hash(lock.lock_id).toString();
	try {
		await workflows.triggerExpireLockReceipt(
			{
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				lockId: lock.lock_id,
				hashedKey,
			},
			{
				scheduleAt: new Date(lock.expires_at),
				scheduleName: buildLockScheduleName({
					orgId: ctx.org.id,
					env: ctx.env,
					hashedKey,
				}),
			},
		);
	} catch (error) {
		ctx.logger.error("[balance-worker] failed to schedule lock expiry", {
			error,
			data: { lockId: lock.lock_id },
		});
	}
}

/** A settled lock has nothing left to expire. */
export async function cancelLockExpirySchedule({
	ctx,
	lockId,
}: {
	ctx: AutumnContext;
	lockId: string;
}): Promise<void> {
	try {
		await cancelLockExpiry({
			orgId: ctx.org.id,
			env: ctx.env,
			hashedKey: Bun.hash(lockId).toString(),
		});
	} catch (error) {
		ctx.logger.error("[balance-worker] failed to cancel lock expiry", {
			error,
			data: { lockId },
		});
	}
}
