import { z } from "zod/v4";
import {
	EntitlementExpirySchema,
	EntitlementSchema,
} from "../../productModels/entModels/entModels";
import { CouponDurationType, RewardType } from "./rewardEnums";

const PromoCodeSchema = z.object({
	code: z.string(),
	global_max_redemption: z.number().positive().optional(),
	/** Only redeemable by customers with no prior successful payments or invoices */
	first_time_transaction: z.boolean().optional(),
	/** @deprecated Use global_max_redemption. */
	max_redemptions: z.number().positive().optional(),
});

const RewardEntitlementSchema = z.object({
	internal_feature_id: z.string().min(1),
	allowance: z.number().positive(),
	expiry: EntitlementExpirySchema.optional(),
});

export const DiscountConfigSchema = z.object({
	discount_value: z.number(),
	duration_type: z.nativeEnum(CouponDurationType),
	duration_value: z.number(),
	should_rollover: z.boolean().optional(),
	apply_to_all: z.boolean().optional(),
	price_ids: z.array(z.string()).optional(),
});

export const FreeProductConfigSchema = z.object({
	duration_type: z.nativeEnum(CouponDurationType),
	duration_value: z.number(),
});

const RewardSchema = z.object({
	name: z.string().nullish(),

	promo_codes: z.array(PromoCodeSchema),
	id: z.string(),
	type: z.nativeEnum(RewardType),

	free_product_id: z.string().nullish(),
	discount_config: DiscountConfigSchema.nullish(),
	free_product_config: FreeProductConfigSchema.nullish(),
	entitlements: z.array(EntitlementSchema).nullish(),

	internal_id: z.string(),
	org_id: z.string(),
	env: z.string(),
	created_at: z.number(),
});

const FullRewardSchema = RewardSchema.extend({
	entitlements: z.array(EntitlementSchema),
});

export const CreateRewardSchema = z
	.object({
		name: z.string(),
		promo_codes: z.array(PromoCodeSchema),
		id: z.string(),
		type: z.nativeEnum(RewardType).nullish(),
		discount_config: DiscountConfigSchema.nullish(),
		free_product_config: FreeProductConfigSchema.nullish(),
		free_product_id: z.string().nullish(),
		entitlements: z.array(RewardEntitlementSchema).nullish(),
	})
	.refine(
		(data) => {
			if (data.type !== RewardType.FeatureGrant) return true;
			return data.entitlements && data.entitlements.length > 0;
		},
		{ message: "Feature grant rewards require at least one entitlement" },
	)
	.refine(
		(data) => {
			if (data.type !== RewardType.FeatureGrant) return true;
			return data.promo_codes.some((pc) => pc.code.length > 0);
		},
		{ message: "Feature grant rewards require at least one promo code" },
	);

export type PromoCode = z.infer<typeof PromoCodeSchema>;
export type CreateReward = z.infer<typeof CreateRewardSchema>;
export type Reward = z.infer<typeof RewardSchema>;
export type FullReward = z.infer<typeof FullRewardSchema>;
export type DiscountConfig = z.infer<typeof DiscountConfigSchema>;
export type FreeProductConfig = z.infer<typeof FreeProductConfigSchema>;
export type RewardEntitlement = z.infer<typeof RewardEntitlementSchema>;
