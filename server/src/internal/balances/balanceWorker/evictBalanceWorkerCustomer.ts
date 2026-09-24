import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { requestContextToCommandBase } from "./requestContextToCommandBase.js";

/**
 * Another writer just changed the customer's rows, so the owning worker must forget its copy.
 * Returns once the copy is gone and the worker's earlier writes are in Postgres; a failure is logged and never fails the write.
 * Not gated on the rollout: invalidation reaches both caches so a flip in either direction finds nothing stale.
 */
export async function evictBalanceWorkerCustomer({
	ctx,
	customerId,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	customerId: string;
	client?: Pick<BalanceWorkerClient, "evict">;
}): Promise<void> {
	try {
		await client.evict({
			command: {
				...requestContextToCommandBase({ ctx, customerId }),
				type: "evict",
			},
		});
	} catch (error) {
		ctx.logger.warn("[balance-worker] evict failed; worker rows may be stale", {
			error,
			data: { customerId },
		});
	}
}
