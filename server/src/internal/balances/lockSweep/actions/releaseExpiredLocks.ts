import type { CronContext } from "@/cron/utils/CronContext.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type { ExpireLockReceiptPayload } from "@/queue/workflows.js";
import type { DueBalanceLock } from "../repos/balanceLocks.js";

/** The job a lock's EventBridge timer delivers, for that lock row: the same key, so the same expiry runs either way. */
export const dueLockToExpireLockPayload = ({
	lock,
}: {
	lock: DueBalanceLock;
}): ExpireLockReceiptPayload => ({
	orgId: lock.org_id,
	env: lock.env,
	customerId: lock.customer_id,
	lockId: lock.lock_id,
	hashedKey: Bun.hash(lock.id).toString(),
	lockRowId: lock.id,
});

/**
 * A lock that releases on expiry and outlived its timer's grace: its timer was never created or never fired, so the
 * sweep queues the job the timer would have sent. Releasing a lock already settled is a no-op (expireLock).
 */
export const releaseExpiredLocks = async ({
	ctx,
	locks,
}: {
	ctx: CronContext;
	locks: DueBalanceLock[];
}): Promise<void> => {
	const results = await Promise.allSettled(
		locks.map((lock) =>
			addTaskToQueue({
				jobName: JobName.ExpireLockReceipt,
				payload: dueLockToExpireLockPayload({ lock }),
				messageDeduplicationId: `lock-sweep-release:${lock.id}`,
			}),
		),
	);
	const failed = results.filter((result) => result.status === "rejected");
	if (failed.length > 0)
		ctx.logger.warn(
			"[lock-sweep] some expired locks could not be queued for release",
			{
				data: { failed: failed.length, locks: locks.length },
			},
		);
};
