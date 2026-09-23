import type { AutumnBillingPlan } from "@autumn/shared";
import {
	billingPlanCustomerEntitlements,
	billingPlanCustomerProducts,
} from "./billingPlanRows.js";

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
	const [customerId] = [...requiredIds, ...grantIds];
	if (!customerId || requiredIds.includes(null)) return null;
	const namesOneCustomer = [...requiredIds, ...grantIds].every(
		(candidate) => candidate === customerId,
	);
	return namesOneCustomer ? customerId : null;
};
