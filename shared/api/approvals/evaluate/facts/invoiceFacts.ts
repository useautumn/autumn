import type { ApprovalCustomerFacts } from "./customerFacts";

/** Every invoice action. Money is in major units. */
export type InvoiceFacts = {
	customer: ApprovalCustomerFacts;
	total: number;
	refund: { amount: number } | null;
};
