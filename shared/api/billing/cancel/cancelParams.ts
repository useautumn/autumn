import { z } from "zod/v4";
// Cancel Schemas
export const CancelParamsSchema = z.object({
	customer_id: z.string(),
	product_id: z.string(),
	entity_id: z.string().optional(),
	cancel_immediately: z.boolean().optional(),
	prorate: z.boolean().optional().default(true),
	filters: z
		.object({
			customer_product_id: z.string().optional(),
		})
		.optional(),
});
