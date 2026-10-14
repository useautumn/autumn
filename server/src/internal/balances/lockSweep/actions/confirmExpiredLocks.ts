import type { ConfirmExpiredLockCommand } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { CronContext } from "@/cron/utils/CronContext.js";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { DueBalanceLock } from "../repos/balanceLocks.js";

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

const isAlreadyClosed = (reason: unknown): boolean =>
	reason instanceof BalanceWorkerClientError &&
	reason.workerCode === "LOCK_NOT_FOUND";

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
