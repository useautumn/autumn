import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { UpdateBalanceParamsV0 } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { updateBalanceParamsToCommand } from "./updateBalanceParamsToCommand.js";

type QueueClient = Pick<BalanceWorkerClient, "queue">;

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
	ctx.testOptions = { ...ctx.testOptions, skipCacheDeletion: true };
	try {
		await client.queue.updateBalance({
			commands: [updateBalanceParamsToCommand({ ctx, params, targetBalance })],
		});
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
};
