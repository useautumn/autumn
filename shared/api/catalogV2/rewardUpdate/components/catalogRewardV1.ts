import { ApiReferralProgramV0Schema } from "@api/referralPrograms/components/apiReferralProgramV0.js";
import { ApiCouponV0Schema } from "@api/rewards/coupons/apiCouponV0.js";
import { ApiFeatureGrantV0Schema } from "@api/rewards/featureGrants/apiFeatureGrantV0.js";
import { RewardType } from "@models/rewardModels/rewardModels/rewardEnums.js";
import { z } from "zod/v4";

const CatalogCouponV1Schema = ApiCouponV0Schema.extend({
	type: z
		.enum([RewardType.PercentageDiscount, RewardType.FixedDiscount])
		.meta({ description: "The type of discount: percentage or fixed." }),
	value: ApiCouponV0Schema.shape.value.meta({
		description:
			"The discount value: a percentage for percentage_discount, or an amount for fixed_discount.",
	}),
});

const internalId = z.string().meta({
	description: "Stable id of the row, unchanged by edits.",
	internal: true,
});

export const CatalogRewardV1Schema = z.union([
	z
		.object({
			coupon: CatalogCouponV1Schema.extend({ internal_id: internalId }),
		})
		.strict(),
	z
		.object({
			feature_grant: ApiFeatureGrantV0Schema.extend({
				internal_id: internalId,
			}),
		})
		.strict(),
]);

export const CatalogReferralProgramV1Schema = ApiReferralProgramV0Schema.extend(
	{
		internal_id: internalId,
	},
);

export type CatalogRewardV1 = z.infer<typeof CatalogRewardV1Schema>;
export type CatalogReferralProgramV1 = z.infer<
	typeof CatalogReferralProgramV1Schema
>;
