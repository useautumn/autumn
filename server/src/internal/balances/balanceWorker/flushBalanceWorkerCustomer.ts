import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { BALANCE_WORKER_FLUSH_TIMEOUT_MS } from "@autumn/env/balanceWorkerConstants";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { requestContextToCommandBase } from "./requestContextToCommandBase.js";

/**
 * A decision is about to be computed from Postgres: the worker lands the customer's accepted writes first.
 * Fails fast: past BALANCE_WORKER_FLUSH_TIMEOUT_MS the read goes ahead on what Postgres has, and a failure is logged.
 */
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
		ctx.logger.warn(
			"[balance-worker] flush failed; Postgres may lag the worker's writes",
			{ error, data: { customerId } },
		);
	}
}
