import { EntitlementDuration } from "@models/productModels/entModels/entModels.js";
import {
	CouponDurationType,
	RewardType,
} from "@models/rewardModels/rewardModels/rewardEnums.js";
import { z } from "zod/v4";
import { ApiCouponV0Schema } from "./coupons/apiCouponV0.js";
import { ApiFeatureGrantV0Schema } from "./featureGrants/apiFeatureGrantV0.js";

const CouponDurationSchema = z
	.union([
		z.object({
			type: z.literal(CouponDurationType.OneOff),
			length: z.literal(null),
		}),
		z.object({
			type: z.literal(CouponDurationType.Months),
			length: z.number().int().positive(),
		}),
		z.object({
			type: z.literal(CouponDurationType.Forever),
			length: z.literal(null),
		}),
	])
	.meta({
		description:
			"Use a positive integer length for months, and null for one_off or forever.",
	});

const CreateCouponBaseSchema = ApiCouponV0Schema.omit({
	created_at: true,
	type: true,
	value: true,
})
	.extend({
		id: z.string().min(1),
		name: z.string().min(1),
		duration: CouponDurationSchema,
		plan_ids: z
			.array(z.string().min(1))
			.min(1)
			.nullable()
			.meta({ description: "Plan IDs must be unique." }),
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
			.meta({ description: "Promo code values must be unique." }),
	})
	.strict();

const CreateCouponSchema = z
	.discriminatedUnion("type", [
		CreateCouponBaseSchema.extend({
			type: z.literal(RewardType.PercentageDiscount),
			value: z.number().positive().max(100).meta({
				description:
					"Percentage discounts must be at most 100; fixed discounts must be positive.",
			}),
		}),
		CreateCouponBaseSchema.extend({
			type: z.literal(RewardType.FixedDiscount),
			value: z.number().positive().meta({
				description:
					"Percentage discounts must be at most 100; fixed discounts must be positive.",
			}),
		}),
	])
	.superRefine((coupon, ctx) => {
		const codes = coupon.promo_codes.map(({ code }) => code);
		if (new Set(codes).size !== codes.length) {
			ctx.addIssue({
				code: "custom",
				message: "Promo codes must be unique",
				path: ["promo_codes"],
			});
		}
		if (
			coupon.plan_ids &&
			new Set(coupon.plan_ids).size !== coupon.plan_ids.length
		) {
			ctx.addIssue({
				code: "custom",
				message: "Plan IDs must be unique",
				path: ["plan_ids"],
			});
		}
	});

const GrantExpirySchema = z
	.object({
		type: z.enum(EntitlementDuration),
		length: z.number().int().positive(),
	})
	.strict()
	.nullable();

const CreateFeatureGrantSchema = ApiFeatureGrantV0Schema.omit({
	created_at: true,
})
	.extend({
		id: z.string().min(1),
		name: z.string().min(1),
		grants: z
			.array(
				z
					.object({
						feature_id: z.string().min(1),
						included: z.number().positive().nullable(),
						expiry: GrantExpirySchema,
					})
					.strict(),
			)
			.min(1)
			.meta({ description: "Feature IDs must be unique." }),
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
			.meta({ description: "Promo code values must be unique." }),
	})
	.strict()
	.superRefine((featureGrant, ctx) => {
		for (const [path, values] of [
			["grants", featureGrant.grants.map(({ feature_id }) => feature_id)],
			["promo_codes", featureGrant.promo_codes.map(({ code }) => code)],
		] as const) {
			if (new Set(values).size !== values.length) {
				ctx.addIssue({
					code: "custom",
					message: `${path === "grants" ? "Feature grants" : "Promo codes"} must be unique`,
					path: [path],
				});
			}
		}
	});

export const CreateRewardParamsSchema = z.union([
	z.object({ coupon: CreateCouponSchema }).strict(),
	z.object({ feature_grant: CreateFeatureGrantSchema }).strict(),
]);

export const CreateRewardResponseSchema = z.union([
	z.object({ coupon: ApiCouponV0Schema }).strict(),
	z.object({ feature_grant: ApiFeatureGrantV0Schema }).strict(),
]);

export type CreateRewardParams = z.infer<typeof CreateRewardParamsSchema>;
export type CreateRewardResponse = z.infer<typeof CreateRewardResponseSchema>;
