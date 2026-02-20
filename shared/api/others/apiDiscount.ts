import {
	CouponDurationType,
	RewardType,
} from "@models/rewardModels/rewardModels/rewardEnums";
import { z } from "zod/v4";

export const ApiDiscountSchema = z.object({
	id: z.string().meta({
		description: "The unique identifier for this discount",
		example: "disc_123456",
	}),
	name: z.string().meta({
		description: "The name of the discount or coupon",
		example: "SUMMER20",
	}),

	type: z.enum(RewardType).meta({
		description: "The type of reward",
		example: "percentage",
	}),
	discount_value: z.number().meta({
		description: "The discount value (percentage or fixed amount)",
		example: 20,
	}),
	duration_type: z.enum(CouponDurationType).meta({
		description: "How long the discount lasts",
		example: "forever",
	}),
	duration_value: z.number().nullish().meta({
		description:
			"Number of billing periods the discount applies for repeating durations",
		example: 3,
	}),
	currency: z.string().nullish().meta({
		description: "The currency code for fixed amount discounts",
		example: "usd",
	}),

	start: z.number().nullish().meta({
		description: "Timestamp when the discount becomes active",
		example: 1759247877000,
	}),
	end: z.number().nullish().meta({
		description: "Timestamp when the discount expires",
		example: 1761839877000,
	}),

	subscription_id: z.string().nullish().meta({
		description: "The Stripe subscription ID this discount is applied to",
		example: "sub_1A2B3C4D5E6F7G8H",
	}),
	total_discount_amount: z.number().nullish().meta({
		description: "Total amount saved from this discount",
		example: 599,
	}),
});

export const ApiCusRewardsSchema = z.object({
	discounts: z.array(ApiDiscountSchema).meta({
		description: "Array of active discounts applied to the customer",
		example: [
			{
				id: "disc_123456",
				name: "SUMMER20",
				type: "percentage",
				discount_value: 20,
			},
		],
	}),
});

export type ApiDiscount = z.infer<typeof ApiDiscountSchema>;
export type ApiCusRewards = z.infer<typeof ApiCusRewardsSchema>;
