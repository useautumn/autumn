import { z } from "zod/v4";

export const ApiCouponPromoCodeV0Schema = z.object({
	code: z.string().meta({
		description: "The promo code customers enter to redeem the coupon.",
	}),
	global_max_redemption: z.number().nullish().meta({
		description:
			"Maximum number of times this promo code can be redeemed across all customers, or null for unlimited.",
	}),
	first_time_transaction: z.boolean().nullish().meta({
		description:
			"Whether this promo code can only be applied to a customer's first transaction.",
	}),
});

export type ApiCouponPromoCodeV0 = z.infer<typeof ApiCouponPromoCodeV0Schema>;
