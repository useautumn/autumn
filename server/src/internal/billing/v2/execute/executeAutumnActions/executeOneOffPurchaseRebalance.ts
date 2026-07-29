import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeRebalancedAutoTopUp } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp.js";
import { CusService } from "@/internal/customers/CusService.js";
import { executeAutoTopupRebalance } from "./executeAutoTopupRebalance.js";

type OneOffPurchaseRebalance = NonNullable<
	AutumnBillingPlan["oneOffPurchaseRebalance"]
>;

export const executeOneOffPurchaseRebalance = async ({
	ctx,
	customerId,
	rebalance,
}: {
	ctx: AutumnContext;
	customerId: string;
	rebalance: OneOffPurchaseRebalance;
}): Promise<void> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const deltas = rebalance.purchases.flatMap(
		({ customerEntitlementId, featureId, quantity }) =>
			computeRebalancedAutoTopUp({
				fullCustomer,
				featureId,
				quantity,
				prepaidCustomerEntitlementId: customerEntitlementId,
			}).deltas,
	);

	await executeAutoTopupRebalance({ ctx, customerId, deltas });
};
