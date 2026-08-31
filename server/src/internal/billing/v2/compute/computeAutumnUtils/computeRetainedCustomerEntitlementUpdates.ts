import {
	type AutumnBillingPlan,
	addCusProductToCusEnt,
	billingContextResetsUsage,
	cusProductToProduct,
	featureUtils,
	isBooleanEntitlement,
	isLifetimeEntitlement,
	isOneOffPrepaidConsumableCustomerEntitlement,
	isUnlimitedEntitlement,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { computeBillingCycleAnchorEntitlementUpdates } from "@/internal/billing/v2/compute/computeAutumnUtils/computeBillingCycleAnchorEntitlementUpdates";
import { initCustomerEntitlementBalance } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementBalance";

export const computeRetainedCustomerEntitlementUpdates = ({
	updateSubscriptionContext,
	finalCustomerProduct,
}: {
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	finalCustomerProduct: UpdateSubscriptionBillingContext["customerProduct"];
}): AutumnBillingPlan["updateCustomerEntitlements"] => {
	const billingCycleUpdates = computeBillingCycleAnchorEntitlementUpdates({
		billingContext: updateSubscriptionContext,
		customerProduct: finalCustomerProduct,
	});
	if (!billingContextResetsUsage(updateSubscriptionContext)) {
		return billingCycleUpdates;
	}

	const billingCycleUpdateByEntitlementId = new Map(
		billingCycleUpdates.map((update) => [
			update.customerEntitlement.id,
			update,
		]),
	);
	const finalFullProduct = cusProductToProduct({
		cusProduct: finalCustomerProduct,
	});
	const updates: NonNullable<AutumnBillingPlan["updateCustomerEntitlements"]> =
		[];

	const grantsOnlyCycleBoundBalances =
		updateSubscriptionContext.requestedBillingCycleAnchor === "now";

	for (const customerEntitlement of finalCustomerProduct.customer_entitlements) {
		const { entitlement } = customerEntitlement;
		const outlivesBillingCycle =
			grantsOnlyCycleBoundBalances && isLifetimeEntitlement({ entitlement });
		const resetsCustomerEntitlementUsage =
			!isBooleanEntitlement({ entitlement }) &&
			!isUnlimitedEntitlement({ entitlement }) &&
			!featureUtils.isAllocated(entitlement.feature) &&
			!outlivesBillingCycle &&
			!isOneOffPrepaidConsumableCustomerEntitlement(
				addCusProductToCusEnt({
					cusEnt: customerEntitlement,
					cusProduct: finalCustomerProduct,
				}),
			);
		const billingCycleUpdate = billingCycleUpdateByEntitlementId.get(
			customerEntitlement.id,
		);
		if (!billingCycleUpdate && !resetsCustomerEntitlementUsage) continue;

		const resetBalance = resetsCustomerEntitlementUsage
			? initCustomerEntitlementBalance({
					initContext: {
						fullCustomer: updateSubscriptionContext.fullCustomer,
						fullProduct: finalFullProduct,
						featureQuantities: updateSubscriptionContext.featureQuantities,
					},
					entitlement,
				})
			: undefined;
		updates.push({
			customerEntitlement,
			updates: {
				...billingCycleUpdate?.updates,
				...(resetBalance && {
					balance: resetBalance.balance,
					adjustment: 0,
					entities: resetBalance.entities ?? undefined,
				}),
			},
		});
	}

	return updates;
};
