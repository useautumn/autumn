import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums.js";
import { z } from "zod/v4";

export const APIFreeTrialSchema = z.object({
	duration: z.enum(FreeTrialDuration),
	length: z.number(),
	unique_fingerprint: z.boolean(),
	card_required: z.boolean(),

	// For Cus Product
	trial_available: z.boolean().nullish().default(true),
});

export type APIFreeTrial = z.infer<typeof APIFreeTrialSchema>;
