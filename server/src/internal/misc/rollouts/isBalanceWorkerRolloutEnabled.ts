import { getBalanceWorkerRolloutOverride } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ACTIVE_ROLLOUT_ID, isRolloutEnabled } from "./rolloutUtils.js";

/** Whether one customer's balances and billing plans go through the balance worker. */
export const resolveBalanceWorkerRouting = ({
	orgId,
	customerId,
}: {
	orgId: string;
	customerId?: string;
}): boolean =>
	getBalanceWorkerRolloutOverride() ??
	isRolloutEnabled({ rolloutId: ACTIVE_ROLLOUT_ID, orgId, customerId });

export const isBalanceWorkerRolloutEnabled = ({
	ctx,
	customerId,
}: {
	ctx: Pick<AutumnContext, "org">;
	customerId: string;
}): boolean => resolveBalanceWorkerRouting({ orgId: ctx.org.id, customerId });
