import { z } from "zod/v4";

export const BillingPreviewResponseSchema = z.object({
	customer_id: z.string(),
	line_items: z.array(
		z.object({
			description: z.string(),
			amount: z.number(),
		}),
	),

	total: z.number(),
	currency: z.string(),
});

export type BillingPreviewResponse = z.infer<
	typeof BillingPreviewResponseSchema
>;
