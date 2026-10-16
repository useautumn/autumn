import { buildFilterSchema, type FilterOf } from "./buildFilterSchema";
import { MoneyMatcherSchema, sharedFilterFields } from "./filterFields";

/** Every invoice action: the invoice preview total and the refund or credit amount. */
export const invoiceFilterShape = {
	customer: sharedFilterFields.customer,
	total: MoneyMatcherSchema.optional(),
	refund: sharedFilterFields.refund,
};

export const InvoiceFilterSchema = buildFilterSchema({
	shape: invoiceFilterShape,
});
export type InvoiceFilter = FilterOf<typeof invoiceFilterShape>;
