import { z } from "zod/v4";
import { ApiFeatureGrantPromoCodeV0Schema } from "../components/apiFeatureGrantPromoCodeV0.js";
import { ApiGrantV0Schema } from "../components/apiGrantV0.js";

export const FEATURE_GRANT_V0_EXAMPLE = {
	id: "beta_credits_grant",
	name: "Beta Tester Credits",
	promo_codes: [{ code: "BETA2024", max_uses: 500 }],
	grants: [
		{
			feature_id: "credits",
			included: 1000,
			expiry: { type: "month", length: 1 },
		},
	],
	created_at: 1_718_000_000_000,
};

export const ApiFeatureGrantV0Schema = z
	.object({
		id: z.string().meta({
			description: "The unique identifier for the feature grant.",
		}),
		name: z.string().nullish().meta({
			description: "A human-readable name for the feature grant.",
		}),
		grants: z.array(ApiGrantV0Schema).meta({
			description: "The feature grants awarded when the grant is redeemed.",
		}),
		promo_codes: z.array(ApiFeatureGrantPromoCodeV0Schema).meta({
			description:
				"The promo codes customers can use to redeem the feature grant.",
		}),
		created_at: z.number().meta({
			description:
				"The Unix timestamp (in milliseconds) when the feature grant was created.",
		}),
	})
	.meta({
		examples: [FEATURE_GRANT_V0_EXAMPLE],
	});

export type ApiFeatureGrantV0 = z.infer<typeof ApiFeatureGrantV0Schema>;
