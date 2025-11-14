import { z } from "zod/v4";
import { FeatureSchema } from "../../../models/featureModels/featureModels.js";
import { CusFeatureLegacyDataSchema } from "../../models.js";

export const CheckLegacyDataSchema = z.object({
	noCusEnts: z.boolean(),
	featureToUse: FeatureSchema,
	cusFeatureLegacyData: CusFeatureLegacyDataSchema,
});

export type CheckLegacyData = z.infer<typeof CheckLegacyDataSchema>;
