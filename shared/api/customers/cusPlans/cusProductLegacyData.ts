import { FeatureOptionsSchema } from "@models/cusProductModels/cusProductModels";
import { z } from "zod/v4";
import { FeatureSchema } from "../../../models/featureModels/featureModels";

// export const CusProductLegacyDataWithoutFeaturesSchema = z.object({
// 	subscription_id: z.string().optional(),
// 	options: z.array(FeatureOptionsSchema),
// });

export const CusProductLegacyDataSchema = z.object({
	subscription_id: z.string().optional(),
	options: z.array(FeatureOptionsSchema),
	// features: z.array(FeatureSchema),
});

export const CusProductLegacyDataWithFeaturesSchema =
	CusProductLegacyDataSchema.extend({
		features: z.array(FeatureSchema),
	});

export type CusProductLegacyData = z.infer<typeof CusProductLegacyDataSchema>;
