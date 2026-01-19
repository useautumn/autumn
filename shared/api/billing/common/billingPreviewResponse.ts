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

	next_cycle: z
		.object({
			starts_at: z.number(),
			total: z.number(),
		})
		.optional(),
});

export type BillingPreviewResponse = z.infer<
	typeof BillingPreviewResponseSchema
>;
