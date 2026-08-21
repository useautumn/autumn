import {
	type AutumnBillingPlan,
	addCusProductToCusEnt,
	cusProductToProduct,
	featureUtils,
	isBooleanEntitlement,
	isOneOffPrepaidConsumableCustomerEntitlement,
	isUnlimitedEntitlement,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
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
	const resetsUsage =
		updateSubscriptionContext.intent === UpdateSubscriptionIntent.UpdatePlan &&
		updateSubscriptionContext.carryOverUsages?.enabled === false;
	if (!resetsUsage) return billingCycleUpdates;

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

	for (const customerEntitlement of finalCustomerProduct.customer_entitlements) {
		const { entitlement } = customerEntitlement;
		const resetsCustomerEntitlementUsage =
			!isBooleanEntitlement({ entitlement }) &&
			!isUnlimitedEntitlement({ entitlement }) &&
			!featureUtils.isAllocated(entitlement.feature) &&
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
