import { z } from "zod/v4";
import { CouponDurationType, RewardType } from "./rewardEnums";

export const DiscountResponseSchema = z.object({
	id: z.string(),
	name: z.string(),

	type: z.nativeEnum(RewardType),
	discount_value: z.number(),
	duration_type: z.nativeEnum(CouponDurationType),
	duration_value: z.number().nullish(),
	currency: z.string().nullish(),

	start: z.number().nullish(),
	end: z.number().nullish(),

	subscription_id: z.string().nullish(),
	total_discount_amount: z.number().nullish(),
});

export const RewardResponseSchema = z.object({
	discounts: z.array(DiscountResponseSchema),
});

export type RewardResponse = z.infer<typeof RewardResponseSchema>;
