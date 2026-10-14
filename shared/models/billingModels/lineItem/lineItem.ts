import { z } from "zod/v4";
import { LineItemContextSchema } from "./lineItemContext";

export const LineItemDiscountSchema = z.object({
	amountOff: z.number(),
	percentOff: z.number().optional(),
	stripeCouponId: z.string().optional(),
	couponName: z.string().optional(),
});

export const LineItemSchema = z
	.object({
		id: z.string(),
		amount: z.number(),

		discounts: z.array(LineItemDiscountSchema).default([]),
		amountAfterDiscounts: z.number().optional(),
		amountAfterDiscountsFinalized: z.boolean().optional(),

		description: z.string(),

		context: LineItemContextSchema,

		stripePriceId: z.string().optional(),
		stripeProductId: z.string().optional(),

		totalQuantity: z.number().optional(),
		paidQuantity: z.number().optional(),
		chargeImmediately: z.boolean().default(true),

		prorated: z.boolean().default(false),
	})
	.transform((data) => {
		return {
			...data,
			amountAfterDiscounts: data.amountAfterDiscounts ?? data.amount,
		};
	});

export type LineItemCreate = z.input<typeof LineItemSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type LineItemDiscount = z.infer<typeof LineItemDiscountSchema>;
