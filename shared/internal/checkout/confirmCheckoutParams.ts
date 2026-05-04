import { FeatureOptionsSchema } from "@models/cusProductModels/cusProductModels";
import { z } from "zod/v4";
import { AttachDiscountSchema } from "../../api/billing/attachV2/attachDiscount";

export const ConfirmCheckoutParamsSchema = z.object({
	feature_quantities: z
		.array(
			FeatureOptionsSchema.pick({
				feature_id: true,
				quantity: true,
			}),
		)
		.optional(),
	discounts: z.array(AttachDiscountSchema).optional(),
});

export type ConfirmCheckoutParams = z.infer<typeof ConfirmCheckoutParamsSchema>;
