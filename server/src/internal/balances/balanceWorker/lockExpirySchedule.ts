import type { LockParams } from "@autumn/shared";
import { ConflictException } from "@aws-sdk/client-scheduler";
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
	lockRowId,
}: {
	ctx: AutumnContext;
	customerId: string;
	lock: Pick<LockParams, "lock_id" | "expires_at">;
	/** Names the timer for this lock row, so a lock id taken again gets its own timer. */
	lockRowId?: string;
}): Promise<void> {
	if (lock.expires_at === undefined) return;
	// Without a row, the same key the legacy path derives, so either path can cancel the other's timer.
	const hashedKey = Bun.hash(lockRowId ?? lock.lock_id).toString();
	try {
		await workflows.triggerExpireLockReceipt(
			{
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				lockId: lock.lock_id,
				hashedKey,
				...(lockRowId && { lockRowId }),
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
		// A resent hand-in finds its lock row's timer already armed.
		if (lockRowId && error instanceof ConflictException) return;
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
