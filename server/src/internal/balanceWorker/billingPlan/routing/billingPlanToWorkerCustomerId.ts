import type { AutumnBillingPlan } from "@autumn/shared";
import { autoTopupRebalanceToPurchase } from "../planOps/customerEntitlements/rebalancesToPlanOps.js";
import {
	billingPlanCustomerEntitlements,
	billingPlanCustomerProducts,
} from "./billingPlanRows.js";

const billingPlanNamesAPurchase = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean => {
	const { autoTopupRebalance, customerId } = autumnBillingPlan;
	if (!autoTopupRebalance || !customerId) return false;
	return autoTopupRebalanceToPurchase({ autoTopupRebalance }) !== null;
};

export const billingPlanToWorkerCustomerId = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): string | null => {
	const { insertCustomer, updateCustomer } = autumnBillingPlan;
	const requiredIds = [
		...(insertCustomer ? [insertCustomer.id] : []),
		...(updateCustomer ? [updateCustomer.customer.id] : []),
		...billingPlanCustomerProducts({ autumnBillingPlan }).map(
			({ customer_id }) => customer_id ?? null,
		),
	];
	const grantIds = billingPlanCustomerEntitlements({
		autumnBillingPlan,
	}).flatMap(({ customer_id }) => (customer_id ? [customer_id] : []));
	const purchaseIds = billingPlanNamesAPurchase({ autumnBillingPlan })
		? [autumnBillingPlan.customerId]
		: [];
	const optionalIds = [...grantIds, ...purchaseIds];
	const [customerId] = [...requiredIds, ...optionalIds];
	if (!customerId || requiredIds.includes(null)) return null;
	const namesOneCustomer = [...requiredIds, ...optionalIds].every(
		(candidate) => candidate === customerId,
	);
	return namesOneCustomer ? customerId : null;
};
