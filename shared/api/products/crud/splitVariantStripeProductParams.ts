import { z } from "zod/v4";

export const SplitVariantStripeProductParamsSchema = z.object({
	variant_plan_id: z.string().nonempty().meta({
		description:
			"The variant plan to move onto its own Stripe product, so coupons can target it alone.",
	}),
});

export type SplitVariantStripeProductParams = z.infer<
	typeof SplitVariantStripeProductParamsSchema
>;
