import { z } from "zod/v4";
import { FeatureSchema } from "../../../models/featureModels/featureModels.js";

export const CheckLegacyDataSchema = z.object({
	noCusEnts: z.boolean(),
	featureToUse: FeatureSchema,
});

export type CheckLegacyData = z.infer<typeof CheckLegacyDataSchema>;
