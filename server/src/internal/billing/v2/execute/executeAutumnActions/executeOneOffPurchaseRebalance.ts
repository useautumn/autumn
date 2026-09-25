import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeRebalancedAutoTopUp } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp.js";
import { CusService } from "@/internal/customers/CusService.js";
import { executeAutoTopupRebalance } from "./executeAutoTopupRebalance.js";

type OneOffPurchaseRebalance = NonNullable<
	AutumnBillingPlan["oneOffPurchaseRebalance"]
>;

/** Each purchase is sized against the balances the one before it left, as the worker sizes them. */
export const executeOneOffPurchaseRebalance = async ({
	ctx,
	customerId,
	rebalance,
}: {
	ctx: AutumnContext;
	customerId: string;
	rebalance: OneOffPurchaseRebalance;
}): Promise<void> => {
	for (const {
		customerEntitlementId,
		featureId,
		quantity,
	} of rebalance.purchases) {
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId,
			quantity,
			prepaidCustomerEntitlementId: customerEntitlementId,
		});
		await executeAutoTopupRebalance({ ctx, customerId, deltas });
	}
};
