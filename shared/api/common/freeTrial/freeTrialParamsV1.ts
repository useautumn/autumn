import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums";
import { z } from "zod/v4";

export const FreeTrialParamsV1Schema = z.object({
	duration_length: z.number(),
	duration_type: z.enum(FreeTrialDuration).default(FreeTrialDuration.Month),
	card_required: z.boolean().default(true),
});

export type FreeTrialParamsV1 = z.infer<typeof FreeTrialParamsV1Schema>;
