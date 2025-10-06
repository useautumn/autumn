import {
	CouponDurationType,
	RewardType,
} from "@models/rewardModels/rewardModels/rewardEnums.js";
import { z } from "zod/v4";

export const APIDiscountSchema = z.object({
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

export const APICusRewardsSchema = z.object({
	discounts: z.array(APIDiscountSchema),
});

export type APIDiscount = z.infer<typeof APIDiscountSchema>;
export type APIDiscountList = z.infer<typeof APICusRewardsSchema>;
