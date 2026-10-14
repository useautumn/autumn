import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutoTopupRebalance } from "@/internal/billing/v2/execute/executeAutumnActions/executeAutoTopupRebalance";
import { executeOneOffPurchaseRebalance } from "@/internal/billing/v2/execute/executeAutumnActions/executeOneOffPurchaseRebalance";

export const applyPlanRebalances = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<void> => {
	const { customerId, oneOffPurchaseRebalance, autoTopupRebalance } =
		autumnBillingPlan;

	if (oneOffPurchaseRebalance) {
		await executeOneOffPurchaseRebalance({
			ctx,
			customerId,
			rebalance: oneOffPurchaseRebalance,
		});
	}

	if (autoTopupRebalance) {
		await executeAutoTopupRebalance({
			ctx,
			customerId,
			deltas: autoTopupRebalance.deltas,
		});
	}
};
