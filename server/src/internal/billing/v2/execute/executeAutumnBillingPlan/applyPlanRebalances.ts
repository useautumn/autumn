import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutoTopupRebalance } from "@/internal/billing/v2/execute/executeAutumnActions/executeAutoTopupRebalance";
import { executeOneOffPurchaseRebalance } from "@/internal/billing/v2/execute/executeAutumnActions/executeOneOffPurchaseRebalance";

/** Balance moves the balance worker does not apply yet, straight to Postgres once the plan's rows committed. */
export const applyPlanRebalances = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<void> => {
	const { customerId, oneOffPurchaseRebalance, autoTopupRebalance } =
		autumnBillingPlan;

	// Reads the customer back, so it must see the committed rows.
	if (oneOffPurchaseRebalance) {
		await executeOneOffPurchaseRebalance({
			ctx,
			customerId,
			rebalance: oneOffPurchaseRebalance,
		});
	}

	// Pre-computed paydown and remainder deltas, each an atomic `balance + delta`.
	if (autoTopupRebalance) {
		await executeAutoTopupRebalance({
			ctx,
			customerId,
			deltas: autoTopupRebalance.deltas,
		});
	}
};
