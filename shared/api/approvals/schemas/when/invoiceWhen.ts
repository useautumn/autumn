import { buildWhenSchema, type WhenOf } from "./buildWhenSchema";
import { MoneyMatcherSchema, sharedWhenFields } from "./whenFields";

/** Every invoice action: the invoice preview total and the refund or credit amount. */
export const invoiceWhenShape = {
	customer: sharedWhenFields.customer,
	total: MoneyMatcherSchema.optional(),
	refund: sharedWhenFields.refund,
};

export const InvoiceWhenSchema = buildWhenSchema({ shape: invoiceWhenShape });
export type InvoiceWhen = WhenOf<typeof invoiceWhenShape>;
