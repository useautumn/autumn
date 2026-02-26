import { z } from "zod/v4";
import { LineItemContextSchema } from "./lineItemContext";

export const LineItemDiscountSchema = z.object({
	amountOff: z.number(),
	percentOff: z.number().optional(),
	stripeCouponId: z.string().optional(),
	couponName: z.string().optional(),
});

// Will be renamed to BillingLineItemSchema (used in the billing actions, different)
export const LineItemSchema = z
	.object({
		id: z.string(),
		amount: z.number(),

		discounts: z.array(LineItemDiscountSchema).default([]),
		amountAfterDiscounts: z.number().default(0),

		description: z.string(),

		context: LineItemContextSchema,

		stripePriceId: z.string().optional(),
		stripeProductId: z.string().optional(),

		// Quantity tracking
		totalQuantity: z.number().optional(), // Total usage (e.g., 500 messages used)
		paidQuantity: z.number().optional(), // Quantity being charged (overage)

		// Optional - for testing
		chargeImmediately: z.boolean().default(true),

		// Trial deferral - item will be charged after trial ends
		deferredForTrial: z.boolean().optional(),

		// Whether this line item was prorated (mid-cycle change)
		prorated: z.boolean().default(false),
	})
	.transform((data) => {
		return {
			...data,
			amountAfterDiscounts: data.amount,
		};
	});

export type LineItemCreate = z.input<typeof LineItemSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type LineItemDiscount = z.infer<typeof LineItemDiscountSchema>;
