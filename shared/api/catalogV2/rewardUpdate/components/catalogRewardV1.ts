import { ApiReferralProgramV0Schema } from "@api/referralPrograms/components/apiReferralProgramV0.js";
import { ApiCouponV0Schema } from "@api/rewards/coupons/apiCouponV0.js";
import { ApiFeatureGrantV0Schema } from "@api/rewards/featureGrants/apiFeatureGrantV0.js";
import { z } from "zod/v4";

const internalId = z.string().meta({
	description: "Stable id of the row, unchanged by edits.",
	internal: true,
});

/**
 * A reward as the catalog returns it: the same one-branch shape the config
 * states, so a pulled row is fixture source without reshaping.
 */
export const CatalogRewardV1Schema = z.union([
	z
		.object({ coupon: ApiCouponV0Schema.extend({ internal_id: internalId }) })
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
