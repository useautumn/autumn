import { z } from "zod/v4";

export const InvoiceItemResponseSchema = z.object({
	description: z.string(),
	period_start: z.number(),
	period_end: z.number(),

	feature_id: z.string().optional(),
	feature_name: z.string().optional(),
});

export const InvoiceResponseSchema = z.object({
	product_ids: z.array(z.string()),
	stripe_id: z.string(),
	status: z.string(),
	total: z.number(),
	currency: z.string(),
	created_at: z.number(),
	hosted_invoice_url: z.string().nullish(),
	// period_start: z.number().nullish(),
	// period_end: z.number().nullish(),
});

export const InvoiceResponseListSchema = z.array(InvoiceResponseSchema);
export type InvoiceResponse = z.infer<typeof InvoiceResponseSchema>;
