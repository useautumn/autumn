import { z } from "zod/v4";
import { ApiCouponPromoCodeV0Schema } from "./components/apiCouponPromoCodeV0.js";
import { ApiFeatureGrantPromoCodeV0Schema } from "./components/apiFeatureGrantPromoCodeV0.js";
import { ApiGrantV0Schema } from "./components/apiGrantV0.js";
import { ApiCouponV0Schema, COUPON_V0_EXAMPLE } from "./coupons/apiCouponV0.js";
import {
	ApiFeatureGrantV0Schema,
	FEATURE_GRANT_V0_EXAMPLE,
} from "./featureGrants/apiFeatureGrantV0.js";

export const GetRewardParamsSchema = z
	.object({
		id: z.string().min(1).meta({
			description: "The ID of the coupon or feature grant to fetch.",
		}),
	})
	.strict()
	.meta({ title: "GetRewardParams" });

/** Exactly one of coupon or feature_grant is returned, matching the reward's type */
export const GetRewardResponseSchema = z
	.object({
		coupon: ApiCouponV0Schema.optional(),
		feature_grant: ApiFeatureGrantV0Schema.optional(),
	})
	.strict()
	.meta({
		title: "GetRewardResponse",
		examples: [{ coupon: COUPON_V0_EXAMPLE }],
	});

const UpdateCouponSchema = z
	.object({
		name: z.string().min(1).optional(),
		plan_ids: z.array(z.string().min(1)).min(1).nullish().meta({
			description: "Plan IDs must be unique. Null applies the coupon to all plans.",
		}),
		promo_codes: z
			.array(
				z
					.object({
						code: z.string().min(1),
						global_max_redemption: z.number().int().positive().nullish(),
						first_time_transaction: z.boolean().nullish(),
					})
					.strict(),
			)
			.optional()
			.meta({ description: "Replaces the existing promo codes when provided." }),
	})
	.strict()
	.meta({ title: "UpdateRewardCouponRequest" });

const UpdateFeatureGrantSchema = z
	.object({
		name: z.string().min(1).optional(),
		grants: z
			.array(
				z
					.object({
						feature_id: z.string().min(1),
						included: z.number().positive().nullable(),
						expiry: ApiGrantV0Schema.shape.expiry,
					})
					.strict(),
			)
			.min(1)
			.optional()
			.meta({ description: "Replaces the existing grants when provided." }),
		promo_codes: z
			.array(
				z
					.object({
						code: z.string().min(1),
						max_uses: z.number().int().positive().nullable(),
					})
					.strict(),
			)
			.min(1)
			.optional()
			.meta({ description: "Replaces the existing promo codes when provided." }),
	})
	.strict()
	.meta({ title: "UpdateRewardFeatureGrantRequest" });

/** Omitted fields keep their current value; the body must match the reward's type */
export const UpdateRewardParamsSchema = z
	.object({
		id: z.string().min(1).meta({
			description: "The ID of the coupon or feature grant to update.",
		}),
		coupon: UpdateCouponSchema.optional(),
		feature_grant: UpdateFeatureGrantSchema.optional(),
	})
	.strict()
	.superRefine(({ coupon, feature_grant }, ctx) => {
		if (Boolean(coupon) === Boolean(feature_grant)) {
			ctx.addIssue({
				code: "custom",
				message: "Provide exactly one of coupon or feature_grant",
			});
		}
	})
	.meta({ title: "UpdateRewardParams" });

export const UpdateRewardResponseSchema = z
	.object({
		coupon: ApiCouponV0Schema.extend({
			promo_codes: z.array(ApiCouponPromoCodeV0Schema),
		}).optional(),
		feature_grant: ApiFeatureGrantV0Schema.extend({
			grants: z.array(ApiGrantV0Schema),
			promo_codes: z.array(ApiFeatureGrantPromoCodeV0Schema),
		}).optional(),
	})
	.strict()
	.meta({
		title: "UpdateRewardResponse",
		examples: [{ feature_grant: FEATURE_GRANT_V0_EXAMPLE }],
	});

export const DeleteRewardParamsSchema = z
	.object({
		id: z.string().min(1).meta({
			description: "The ID of the coupon or feature grant to delete.",
		}),
	})
	.strict()
	.meta({ title: "DeleteRewardParams" });

export const DeleteRewardResponseSchema = z
	.object({
		id: z.string(),
		deleted: z.literal(true),
	})
	.meta({
		title: "DeleteRewardResponse",
		examples: [{ id: "summer_sale", deleted: true }],
	});

export type GetRewardParams = z.infer<typeof GetRewardParamsSchema>;
export type GetRewardResponse = z.infer<typeof GetRewardResponseSchema>;
export type UpdateRewardParams = z.infer<typeof UpdateRewardParamsSchema>;
export type UpdateRewardResponse = z.infer<typeof UpdateRewardResponseSchema>;
export type DeleteRewardParams = z.infer<typeof DeleteRewardParamsSchema>;
export type DeleteRewardResponse = z.infer<typeof DeleteRewardResponseSchema>;
