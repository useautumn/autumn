import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums.js";
import { z } from "zod/v4";

export const ApiFreeTrialV2Schema = z.object({
	duration_type: z.enum(FreeTrialDuration),
	duration_length: z.number(),
	card_required: z.boolean(),
});

export type ApiFreeTrialV2 = z.infer<typeof ApiFreeTrialV2Schema>;
