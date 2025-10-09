import { z } from "zod/v4";

export const ApiInvoiceItemSchema = z.object({
	description: z.string(),
	period_start: z.number(),
	period_end: z.number(),

	feature_id: z.string().optional(),
	feature_name: z.string().optional(),
});

export const ApiInvoiceSchema = z.object({
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

export type ApiInvoice = z.infer<typeof ApiInvoiceSchema>;
