import {
	CouponDurationType,
	RewardType,
} from "@models/rewardModels/rewardModels/rewardEnums.js";
import { z } from "zod/v4";

export const ApiDiscountSchema = z.object({
	id: z.string(), // either from Autumn or Stripe
	name: z.string(),

	type: z.enum(RewardType),
	discount_value: z.number(),
	duration_type: z.enum(CouponDurationType),
	duration_value: z.number().nullish(),
	currency: z.string().nullish(),

	start: z.number().nullish(),
	end: z.number().nullish(),

	subscription_id: z.string().nullish(),
	total_discount_amount: z.number().nullish(),
});

export const ApiCusRewardsSchema = z.object({
	discounts: z.array(ApiDiscountSchema),
});

export type ApiDiscount = z.infer<typeof ApiDiscountSchema>;
export type ApiCusRewards = z.infer<typeof ApiCusRewardsSchema>;
