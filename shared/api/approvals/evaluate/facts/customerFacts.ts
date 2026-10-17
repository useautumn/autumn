import type { FullCustomer } from "../../../../models/cusModels/fullCusModel";

/** The customer a request acts on. `has_paid` comes from its own query, never a truncated invoice list. */
export type ApprovalCustomerFacts = Pick<
	FullCustomer,
	"id" | "customer_products"
> & {
	has_paid: boolean;
};
