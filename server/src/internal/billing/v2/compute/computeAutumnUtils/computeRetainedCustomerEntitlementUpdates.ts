import {
	addCusProductToCusEnt,
	type AutumnBillingPlan,
	cusProductToProduct,
	featureUtils,
	getCycleEnd,
	isBooleanEntitlement,
	isOneOffPrepaidConsumableCustomerEntitlement,
	isResettingEntitlement,
	isUnlimitedEntitlement,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
} from "@autumn/shared";
import { entitlementToResetCycleAnchor } from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";
import { initCustomerEntitlementBalance } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementBalance";

export const computeRetainedCustomerEntitlementUpdates = ({
	updateSubscriptionContext,
	finalCustomerProduct,
}: {
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	finalCustomerProduct: UpdateSubscriptionBillingContext["customerProduct"];
}): AutumnBillingPlan["updateCustomerEntitlements"] => {
	const resetsBillingCycle =
		updateSubscriptionContext.requestedBillingCycleAnchor === "now";
	const resetsUsage =
		updateSubscriptionContext.intent === UpdateSubscriptionIntent.UpdatePlan &&
		updateSubscriptionContext.carryOverUsages?.enabled === false;
	if (!resetsBillingCycle && !resetsUsage) return [];

	const finalFullProduct = resetsUsage
		? cusProductToProduct({ cusProduct: finalCustomerProduct })
		: undefined;

	return finalCustomerProduct.customer_entitlements
		.map((customerEntitlement) => {
			const { entitlement } = customerEntitlement;
			const resetsEntitlementBillingCycle =
				resetsBillingCycle && isResettingEntitlement({ entitlement });
			const resetsCustomerEntitlementUsage =
				resetsUsage &&
				!isBooleanEntitlement({ entitlement }) &&
				!isUnlimitedEntitlement({ entitlement }) &&
				!featureUtils.isAllocated(entitlement.feature) &&
				!isOneOffPrepaidConsumableCustomerEntitlement(
					addCusProductToCusEnt({
						cusEnt: customerEntitlement,
						cusProduct: finalCustomerProduct,
					}),
				);
			if (!resetsEntitlementBillingCycle && !resetsCustomerEntitlementUsage)
				return undefined;

			const resetBalance = resetsCustomerEntitlementUsage
				? initCustomerEntitlementBalance({
						initContext: {
							fullCustomer: updateSubscriptionContext.fullCustomer,
							fullProduct: finalFullProduct!,
							featureQuantities: updateSubscriptionContext.featureQuantities,
						},
						entitlement: customerEntitlement.entitlement,
					})
				: undefined;

			return {
				customerEntitlement,
				updates: {
					...(resetBalance
						? {
								balance: resetBalance.balance,
								adjustment: 0,
								entities: resetBalance.entities ?? undefined,
							}
						: {}),
					...(resetsEntitlementBillingCycle
						? {
								reset_cycle_anchor: entitlementToResetCycleAnchor({
									entitlement: customerEntitlement.entitlement,
									resetCycleAnchor:
										updateSubscriptionContext.resetCycleAnchorMs,
									now: updateSubscriptionContext.currentEpochMs,
								}),
								next_reset_at: getCycleEnd({
									anchor: updateSubscriptionContext.resetCycleAnchorMs,
									interval: customerEntitlement.entitlement.interval!,
									intervalCount:
										customerEntitlement.entitlement.interval_count,
									now: updateSubscriptionContext.currentEpochMs,
								}),
							}
						: {}),
				},
			};
		})
		.filter((update) => update !== undefined);
};
