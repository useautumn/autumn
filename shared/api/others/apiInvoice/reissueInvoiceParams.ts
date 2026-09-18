import { z } from "zod/v4";
import { ApiListInvoiceV1Schema } from "./apiListInvoiceV1.js";
import { CreateInvoicePreviewSchema } from "./createInvoiceParams.js";

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
	preview: z.boolean().optional().meta({
		description:
			"If true, returns the replacement invoice's lines and totals without voiding anything or issuing it.",
	}),
	update_customer_email: z.email().optional().meta({
		description:
			"Updates the customer's billing email before the replacement is issued, so Stripe sends the new invoice to this address.",
	}),
});

export const ReissueInvoiceResponseSchema = z.object({
	invoice: ApiListInvoiceV1Schema.nullable().meta({
		description: "The replacement invoice. Null when preview is true.",
	}),
	voided_invoice_id: z.string().nullable().meta({
		description:
			"The Autumn ID of the original invoice, now void. Null when preview is true.",
	}),
	preview: CreateInvoicePreviewSchema.meta({
		description: "The replacement's lines and totals.",
	}),
});

export type ReissueInvoiceParams = z.infer<typeof ReissueInvoiceParamsSchema>;
export type ReissueInvoiceResponse = z.infer<
	typeof ReissueInvoiceResponseSchema
>;
