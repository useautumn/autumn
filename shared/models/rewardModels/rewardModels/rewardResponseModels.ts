import { z } from "zod";
import { RewardType } from "./rewardEnums.js";
import { CouponDurationType } from "./rewardEnums.js";

export const DiscountResponseSchema = z.object({
	id: z.string(), // either from Autumn or Stripe
	name: z.string(),

	type: z.nativeEnum(RewardType),
	discount_value: z.number(),
	// stripe_coupon_id: z.string(), // coupon ID
	// stripe_discount_id: z.string(), // stripe discount ID
	duration_type: z.nativeEnum(CouponDurationType),
	duration_value: z.number().nullish(),
	currency: z.string().nullish(),

	start: z.number().nullish(),
	end: z.number().nullish(),

	subscription_id: z.string().nullable(),
});

export const RewardResponseSchema = z.object({
	discounts: z.array(DiscountResponseSchema),
});

export type RewardResponse = z.infer<typeof RewardResponseSchema>;
