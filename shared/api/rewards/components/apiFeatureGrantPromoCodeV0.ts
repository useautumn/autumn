import { z } from "zod/v4";

export const ApiFeatureGrantPromoCodeV0Schema = z.object({
	code: z.string().meta({
		description: "The promo code customers enter to redeem the feature grant.",
	}),
	max_uses: z.number().nullable().meta({
		description:
			"Maximum number of times this promo code can be redeemed, or null for unlimited.",
	}),
});

export type ApiFeatureGrantPromoCodeV0 = z.infer<
	typeof ApiFeatureGrantPromoCodeV0Schema
>;
