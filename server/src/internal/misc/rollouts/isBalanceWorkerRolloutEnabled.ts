import { getBalanceWorkerRolloutOverride } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resolveRolloutOrgId } from "./resolveRolloutOrgId.js";
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
}): boolean =>
	resolveBalanceWorkerRouting({
		orgId: resolveRolloutOrgId({ org: ctx.org }),
		customerId,
	});

/** Every customer of the org routes to the worker: no customer id means only a 100% rollout (or the override) matches. */
export const isOrgFullyOnWorker = ({
	ctx,
}: {
	ctx: Pick<AutumnContext, "org">;
}): boolean =>
	resolveBalanceWorkerRouting({ orgId: resolveRolloutOrgId({ org: ctx.org }) });
