import type { EvictCommand } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerOwnerUnavailable } from "./balanceWorkerErrors.js";
import { requestContextToCommandBase } from "./requestContextToCommandBase.js";

const STALE_ROWS_MESSAGE =
	"[balance-worker] evict failed; worker rows may be stale";

/** Drops the owner's copy after another writer changed the rows, whatever the rollout says; a failure is logged, never fails the write.
 *  With no ready owner (a partition mid-handoff, as on every deploy) it goes on the command log its next owner reads in order. */
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
		if (!isBalanceWorkerOwnerUnavailable(error)) {
			ctx.logger.error(STALE_ROWS_MESSAGE, { error, data: { customerId } });
			return;
		}
		ctx.logger.warn(
			"[balance-worker] evict found no ready owner; queueing it",
			{
				type: "balance_worker_fail_open",
				fail_open_source: "evict",
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
