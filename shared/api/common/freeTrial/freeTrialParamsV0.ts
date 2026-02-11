import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums.js";
import { z } from "zod/v4";

export const FreeTrialParamsV0Schema = z.object({
	length: z.number(),
	duration: z.enum(FreeTrialDuration),
	card_required: z.boolean().default(true),
});

export type FreeTrialParamsV0 = z.infer<typeof FreeTrialParamsV0Schema>;
