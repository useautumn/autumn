import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { BALANCE_WORKER_FLUSH_TIMEOUT_MS } from "@autumn/env/balanceWorkerConstants";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { requestContextToCommandBase } from "./requestContextToCommandBase.js";

export async function flushBalanceWorkerCustomer({
	ctx,
	customerId,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	customerId: string;
	client?: Pick<BalanceWorkerClient, "flush">;
}): Promise<void> {
	try {
		await client.flush({
			command: {
				...requestContextToCommandBase({ ctx, customerId }),
				type: "flush",
			},
			signal: AbortSignal.timeout(BALANCE_WORKER_FLUSH_TIMEOUT_MS),
		});
	} catch (error) {
		ctx.logger.error(
			"[balance-worker] flush failed; Postgres may lag the worker's writes",
			{ error, data: { customerId } },
		);
	}
}
