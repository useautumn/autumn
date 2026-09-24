import type { AutumnBillingPlan } from "@autumn/shared";
import { autoTopupRebalanceToPurchase } from "../planOps/customerEntitlements/rebalancesToPlanOps.js";
import {
	billingPlanCustomerEntitlements,
	billingPlanCustomerProducts,
} from "./billingPlanRows.js";

/** A top-up the worker sizes: its purchase alone is a write of the customer's. */
const billingPlanNamesAPurchase = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean => {
	const { autoTopupRebalance, customerId } = autumnBillingPlan;
	if (!autoTopupRebalance || !customerId) return false;
	return autoTopupRebalanceToPurchase({ autoTopupRebalance }) !== null;
};

/** The external id of the one customer the plan writes; null when a row has none or two customers appear. */
export const billingPlanToWorkerCustomerId = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): string | null => {
	const { insertCustomer, updateCustomer } = autumnBillingPlan;
	// A customer or product row without an id is an id-less customer, which the worker cannot key.
	const requiredIds = [
		...(insertCustomer ? [insertCustomer.id] : []),
		...(updateCustomer ? [updateCustomer.customer.id] : []),
		...billingPlanCustomerProducts({ autumnBillingPlan }).map(
			({ customer_id }) => customer_id ?? null,
		),
	];
	// A grant's customer id is a debugging column older rows lack: it only has to agree when present.
	const grantIds = billingPlanCustomerEntitlements({
		autumnBillingPlan,
	}).flatMap(({ customer_id }) => (customer_id ? [customer_id] : []));
	// A top-up whose price lost the prepaid tie-break writes no row of the customer's, only its purchase.
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
