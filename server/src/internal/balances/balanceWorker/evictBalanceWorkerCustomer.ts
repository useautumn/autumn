import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { requestContextToCommandBase } from "./requestContextToCommandBase.js";

/**
 * Another writer just changed the customer's rows, so the owning worker must forget its copy.
 * Waited on so the caller's next request sees fresh rows; a failure is logged and never fails the write.
 */
export async function evictBalanceWorkerCustomer({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<void> {
	if (!isBalanceWorkerRolloutEnabled()) return;
	try {
		await getBalanceWorkerClient().evict({
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
