import { z } from "zod";
import { DiscountResponseSchema } from "../../rewardModels/rewardModels/rewardResponseModels.js";

export const UpcomingInvoiceResponseSchema = z.object({
	lines: z.array(
		z.object({
			product_id: z.string().nullish(),
			description: z.string(),
			amount: z.number(),
		}),
	),
	discounts: z.array(DiscountResponseSchema),
	subtotal: z.number(),
	total: z.number(),
	currency: z.string(),
});

export type UpcomingInvoiceResponse = z.infer<
	typeof UpcomingInvoiceResponseSchema
>;
