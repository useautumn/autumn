import { InvoicePaymentMethodSchema } from "@models/orgModels/orgConfig.js";
import { z } from "zod/v4";
import { ApiListInvoiceV1Schema } from "./apiListInvoiceV1.js";

export const UpdateInvoiceParamsSchema = z.object({
	invoice_id: z.string().meta({
		description: "The Autumn invoice ID to update.",
		example: "inv_2b3c4d5e6f7g8h",
	}),
	payment_method_types: z.array(InvoicePaymentMethodSchema).min(1).meta({
		description:
			"Payment method types the customer can pay the invoice with. Only draft and open Stripe invoices can be updated.",
	}),
});

export const UpdateInvoiceResponseSchema = z.object({
	invoice: ApiListInvoiceV1Schema,
});

export type UpdateInvoiceParams = z.infer<typeof UpdateInvoiceParamsSchema>;
export type UpdateInvoiceResponse = z.infer<typeof UpdateInvoiceResponseSchema>;
