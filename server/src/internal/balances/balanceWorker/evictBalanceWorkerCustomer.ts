import type { EvictCommand } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerUnconfirmed } from "./balanceWorkerErrors.js";
import { requestContextToCommandBase } from "./requestContextToCommandBase.js";

const STALE_ROWS_MESSAGE =
	"[balance-worker] evict failed; worker rows may be stale";

/** Drops the owner's copy after another writer changed the rows, whatever the rollout says; a failure is logged, never fails the write.
 *  One the worker never confirmed (a partition mid-handoff, as on every deploy) goes on the command log its next owner reads in order. */
export async function evictBalanceWorkerCustomer({
	ctx,
	customerId,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	customerId: string;
	client?: Pick<BalanceWorkerClient, "evict"> & {
		queue: Pick<BalanceWorkerClient["queue"], "evict">;
	};
}): Promise<void> {
	const command: EvictCommand = {
		...requestContextToCommandBase({ ctx, customerId }),
		type: "evict",
	};
	try {
		await client.evict({ command });
		return;
	} catch (error) {
		if (!isBalanceWorkerUnconfirmed(error)) {
			ctx.logger.error(STALE_ROWS_MESSAGE, { error, data: { customerId } });
			return;
		}
		ctx.logger.warn(
			"[balance-worker] evict unavailable or unconfirmed; queueing it",
			{
				type: "balance_worker_fail_open",
				fail_open_source: "evict",
				worker_failure: {
					clientCode: error.code,
					workerCode: error.workerCode,
					outcome: error.outcome,
				},
				data: { customerId },
				error,
			},
		);
	}
	try {
		await client.queue.evict({ commands: [command] });
	} catch (error) {
		ctx.logger.error(STALE_ROWS_MESSAGE, { error, data: { customerId } });
	}
}
