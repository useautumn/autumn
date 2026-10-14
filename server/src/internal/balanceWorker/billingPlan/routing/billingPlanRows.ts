import type {
	AutumnBillingPlan,
	FullCusProduct,
	FullCustomerEntitlement,
	InsertCustomerEntitlement,
} from "@autumn/shared";
import {
	getDeleteCustomerProducts,
	getPatchCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";

export const billingPlanCustomerProducts = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): FullCusProduct[] => [
	...autumnBillingPlan.insertCustomerProducts,
	...getPatchCustomerProducts({ autumnBillingPlan }).map(
		({ customerProduct }) => customerProduct,
	),
	...getUpdateCustomerProducts({ autumnBillingPlan }).map(
		({ customerProduct }) => customerProduct,
	),
	...getDeleteCustomerProducts({ autumnBillingPlan }),
];

export const billingPlanCustomerEntitlements = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): (FullCustomerEntitlement | InsertCustomerEntitlement)[] => [
	...(autumnBillingPlan.insertCustomerEntitlements ?? []),
	...getPatchCustomerProducts({ autumnBillingPlan }).flatMap(
		({ insertCustomerEntitlements }) => insertCustomerEntitlements,
	),
	...(autumnBillingPlan.updateCustomerEntitlements ?? []).map(
		({ customerEntitlement }) => customerEntitlement,
	),
];
