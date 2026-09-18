import { z } from "zod/v4";
import { ApiListInvoiceV1Schema } from "./apiListInvoiceV1.js";

export const ReissueInvoiceParamsSchema = z.object({
	invoice_id: z.string().meta({
		description: "The Autumn invoice ID to void and replace.",
		example: "inv_2b3c4d5e6f7g8h",
	}),
	invoice_template_id: z.string().optional().meta({
		description:
			"ID of an invoice template (configured in billing settings) whose footer and memo are applied to the replacement invoice.",
	}),
	net_terms_days: z.number().int().positive().optional().meta({
		description:
			"Number of days the customer has to pay the replacement invoice. Defaults to the original invoice's due date; required when that date has already passed.",
	}),
	update_customer_email: z.email().optional().meta({
		description:
			"Updates the customer's billing email before the replacement is issued, so Stripe sends the new invoice to this address.",
	}),
});

export const ReissueInvoiceResponseSchema = z.object({
	invoice: ApiListInvoiceV1Schema.meta({
		description: "The replacement invoice.",
	}),
	voided_invoice_id: z.string().meta({
		description: "The Autumn ID of the original invoice, now void.",
	}),
});

export type ReissueInvoiceParams = z.infer<typeof ReissueInvoiceParamsSchema>;
export type ReissueInvoiceResponse = z.infer<
	typeof ReissueInvoiceResponseSchema
>;
