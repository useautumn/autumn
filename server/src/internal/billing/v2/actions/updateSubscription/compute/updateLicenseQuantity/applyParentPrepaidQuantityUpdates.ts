import type { AutumnBillingPlan } from "@autumn/shared";

export const applyParentPrepaidQuantityUpdates = ({
	licensePlan,
	quantityPlan,
}: {
	licensePlan: AutumnBillingPlan;
	quantityPlan: AutumnBillingPlan;
}): AutumnBillingPlan => ({
	...licensePlan,
	updateCustomerProduct: quantityPlan.updateCustomerProduct,
	updateCustomerEntitlements: [
		...(licensePlan.updateCustomerEntitlements ?? []),
		...(quantityPlan.updateCustomerEntitlements ?? []),
	],
	lineItems: [
		...(licensePlan.lineItems ?? []),
		...(quantityPlan.lineItems ?? []),
	],
	...(quantityPlan.pooledBalancePlan
		? { pooledBalancePlan: quantityPlan.pooledBalancePlan }
		: {}),
});
