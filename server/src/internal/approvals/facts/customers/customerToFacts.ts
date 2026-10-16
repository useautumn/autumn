import type { FullCustomer } from "@autumn/shared";
import type { CustomerFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

/** Update or delete a customer: rules read the customer as it is before the change. */
export const customerToFacts = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): CustomerFacts => ({ customer: fullCustomer });
