import { z } from "zod/v4";
import { ApiBalanceSchema } from "../../models.js";
import { CheckFeaturePreviewSchema } from "./checkFeaturePreview.js";

export const CheckResponseV2Schema = z.object({
	allowed: z.boolean(),
	customer_id: z.string(),
	entity_id: z.string().nullish(),
	required_balance: z.number().optional(),

	balance: ApiBalanceSchema.nullable(),

	preview: CheckFeaturePreviewSchema.optional(),
});

export type CheckResponseV2 = z.infer<typeof CheckResponseV2Schema>;
