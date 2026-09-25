import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { UpdateBalanceParamsV0 } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { updateBalanceParamsToCommand } from "./updateBalanceParamsToCommand.js";

type QueueClient = Pick<BalanceWorkerClient, "queue">;

/** The async contract on the worker path, as track's: the command is appended to the command log and nobody waits. */
export const runBalanceWorkerAsyncUpdateBalance = async ({
	ctx,
	params,
	targetBalance,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
	client?: QueueClient;
}): Promise<void> => {
	// The worker holds the write once it consumes the command; the route's refresh would evict ahead of it.
	ctx.testOptions = { ...ctx.testOptions, skipCacheDeletion: true };
	try {
		await client.queue.updateBalance({
			commands: [updateBalanceParamsToCommand({ ctx, params, targetBalance })],
		});
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
};
