import { z } from "zod/v4";
import { ApiBalanceV1Schema } from "../../customers/cusFeatures/apiBalanceV1.js";
import { CheckFeaturePreviewSchema } from "./checkFeaturePreview.js";

export const CheckResponseV3Schema = z.object({
	allowed: z.boolean(),
	customer_id: z.string(),
	entity_id: z.string().nullish(),
	required_balance: z.number().optional(),

	balance: ApiBalanceV1Schema.nullable(),

	preview: CheckFeaturePreviewSchema.optional(),
});

export type CheckResponseV3 = z.infer<typeof CheckResponseV3Schema>;
