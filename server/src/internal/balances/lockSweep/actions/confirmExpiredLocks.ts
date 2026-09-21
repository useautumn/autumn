import type { ConfirmExpiredLockCommand } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { CronContext } from "@/cron/utils/CronContext.js";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { DueBalanceLock } from "../repos/balanceLocks.js";

/** Keyed on the lock's row id, so a lock still open on the next pass retries as the same command. */
export const dueLockToConfirmExpiredLockCommand = ({
	lock,
	now,
}: {
	lock: DueBalanceLock;
	now: number;
}): ConfirmExpiredLockCommand => ({
	schemaVersion: 1,
	type: "confirmExpiredLock",
	commandId: `lock-sweep:${lock.id}`,
	requestId: `lock-sweep:${lock.id}`,
	occurredAt: now,
	identity: {
		orgId: lock.org_id,
		env: lock.env,
		customerId: lock.customer_id,
		entityId: null,
	},
	lock: { id: lock.id, lock_id: lock.lock_id },
});

/** Finalized between the sweep's read and its command: already closed, which is all the sweep wanted. */
const isAlreadyClosed = (reason: unknown): boolean =>
	reason instanceof BalanceWorkerClientError &&
	reason.workerCode === "LOCK_NOT_FOUND";

/**
 * A lock that confirms on expiry keeps what it took, so closing it moves no balance. The worker owns the
 * table and the lock ids in memory, so it does the deleting; one that fails is simply due again next pass.
 */
export const confirmExpiredLocks = async ({
	ctx,
	locks,
}: {
	ctx: CronContext;
	locks: DueBalanceLock[];
}): Promise<void> => {
	const client = getBalanceWorkerClient();
	const now = Date.now();
	const results = await Promise.allSettled(
		locks.map((lock) =>
			client.confirmExpiredLock({
				command: dueLockToConfirmExpiredLockCommand({ lock, now }),
			}),
		),
	);
	const failed = results.filter(
		(result) => result.status === "rejected" && !isAlreadyClosed(result.reason),
	);
	if (failed.length > 0)
		ctx.logger.warn("[lock-sweep] some locks could not be expired", {
			data: { failed: failed.length, locks: locks.length },
		});
};
