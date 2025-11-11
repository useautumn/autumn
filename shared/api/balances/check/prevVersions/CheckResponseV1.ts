import { z } from "zod/v4";
import { CoreCusFeatureSchema } from "../../../customers/cusFeatures/previousVersions/apiCusFeatureV3.js";

export const CheckResponseV1Schema = z
	.object({
		allowed: z.boolean(),
		code: z.string(),
		customer_id: z.string(),
		feature_id: z.string(),
		entity_id: z.string().nullish(),
		required_balance: z.number().optional(), // not present for boolean features
	})
	.extend(CoreCusFeatureSchema.shape);

export type CheckResponseV1 = z.infer<typeof CheckResponseV1Schema>;
