import { z } from "zod/v4";
import { LineItemContextSchema } from "./lineItemContext";

export const LineItemDiscountSchema = z.object({
	amountOff: z.number(),
	percentOff: z.number().optional(),
	stripeCouponId: z.string().optional(),
});

export const LineItemSchema = z
	.object({
		amount: z.number(),

		discounts: z.array(LineItemDiscountSchema).default([]),
		finalAmount: z.number().default(0),

		description: z.string(),

		context: LineItemContextSchema,

		stripePriceId: z.string().optional(),
		stripeProductId: z.string().optional(),

		// Optional - for testing
		chargeImmediately: z.boolean().default(true),
	})
	.transform((data) => {
		return {
			...data,
			finalAmount: data.amount,
		};
	});

export type LineItemCreate = z.input<typeof LineItemSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type LineItemDiscount = z.infer<typeof LineItemDiscountSchema>;
