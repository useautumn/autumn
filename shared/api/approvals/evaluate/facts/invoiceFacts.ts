import type { FullCustomer } from "@models/cusModels/fullCusModel";

/** Every invoice action. Money is in major units. */
export type InvoiceFacts = {
	customer: FullCustomer;
	total: number;
	refund: { amount: number } | null;
};
