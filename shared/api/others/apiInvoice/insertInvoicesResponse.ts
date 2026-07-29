import { z } from "zod/v4";
import { ApiInvoiceV1Schema } from "./apiInvoiceV1.js";

export const ApiInsertedInvoiceSchema = ApiInvoiceV1Schema.extend({
	id: z.string().meta({ description: "The Autumn invoice ID." }),
	customer_id: z.string().meta({
		description: "The customer this invoice belongs to.",
	}),
	amount_paid: z.number().nullable().meta({
		description: "The amount paid in major currency units.",
	}),
	refunded_amount: z.number().meta({
		description: "The refunded amount in major currency units.",
	}),
});

export const InsertInvoicesResponseSchema = z.object({
	invoices: z.array(ApiInsertedInvoiceSchema).meta({
		description: "Inserted or updated invoices in request order.",
	}),
});

export type ApiInsertedInvoice = z.infer<typeof ApiInsertedInvoiceSchema>;
export type InsertInvoicesResponse = z.infer<
	typeof InsertInvoicesResponseSchema
>;
