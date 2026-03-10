import { FeatureOptionsSchema } from "@models/cusProductModels/cusProductModels";
import { z } from "zod/v4";

export const ConfirmCheckoutParamsSchema = z.object({
	options: z.array(
		FeatureOptionsSchema.pick({
			feature_id: true,
			quantity: true,
		}),
	),
});

export type ConfirmCheckoutParams = z.infer<typeof ConfirmCheckoutParamsSchema>;
