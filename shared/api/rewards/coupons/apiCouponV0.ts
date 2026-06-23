import { makeDurationSchema } from "@api/common/duration/durationSchema.js";
import {
	CouponDurationType,
	RewardType,
} from "@models/rewardModels/rewardModels/rewardEnums.js";
import { z } from "zod/v4";
import { ApiCouponPromoCodeV0Schema } from "../components/apiCouponPromoCodeV0.js";

/** Discount-category reward types surfaced as coupons (excludes feature_grant / free_product). */
const COUPON_TYPES = [
	RewardType.PercentageDiscount,
	RewardType.FixedDiscount,
	RewardType.InvoiceCredits,
] as const;

export const COUPON_V0_EXAMPLE = {
	id: "summer_sale",
	name: "Summer Sale",
	type: "percentage_discount",
	value: 20,
	duration: { type: "months", length: 3 },
	plan_ids: ["pro", "starter"],
	promo_codes: [
		{
			code: "SUMMER20",
			global_max_redemption: 100,
			first_time_transaction: false,
		},
	],
	created_at: 1_718_000_000_000,
};

export const ApiCouponV0Schema = z
	.object({
		id: z.string().meta({
			description: "The unique identifier for the coupon.",
		}),
		name: z.string().nullish().meta({
			description: "A human-readable name for the coupon.",
		}),
		type: z.enum(COUPON_TYPES).meta({
			description:
				"The type of discount: percentage_discount, fixed_discount, or invoice_credits.",
		}),
		value: z.number().meta({
			description:
				"The discount value. A percentage for percentage_discount, or an amount for fixed_discount / invoice_credits.",
		}),
		duration: makeDurationSchema(CouponDurationType).meta({
			description: "How long the coupon applies once redeemed.",
		}),
		plan_ids: z.array(z.string()).nullable().meta({
			description:
				"The plan IDs the coupon applies to, or null when it applies to all plans.",
		}),
		promo_codes: z.array(ApiCouponPromoCodeV0Schema).meta({
			description: "The promo codes customers can use to redeem the coupon.",
		}),
		created_at: z.number().meta({
			description:
				"The Unix timestamp (in milliseconds) when the coupon was created.",
		}),
	})
	.meta({
		examples: [COUPON_V0_EXAMPLE],
	});

export type ApiCouponV0 = z.infer<typeof ApiCouponV0Schema>;
