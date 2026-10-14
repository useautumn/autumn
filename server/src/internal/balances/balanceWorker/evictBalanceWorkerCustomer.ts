import type { EvictCommand } from "@autumn/balance-engine";
import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { requestContextToCommandBase } from "./requestContextToCommandBase.js";

const STALE_ROWS_MESSAGE =
	"[balance-worker] evict failed; worker rows may be stale";

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
		refreshSnapshots: isBalanceWorkerRolloutEnabled({ ctx, customerId }),
	};
	try {
		await client.evict({ command });
		return;
	} catch (error) {
		ctx.logger.warn(
			"[balance-worker] evict unavailable or unconfirmed; queueing it",
			{
				type: "balance_worker_fail_open",
				fail_open_source: "evict",
				worker_failure:
					error instanceof BalanceWorkerClientError
						? {
								clientCode: error.code,
								workerCode: error.workerCode,
								outcome: error.outcome,
							}
						: undefined,
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
