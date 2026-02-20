import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums.js";
import { z } from "zod/v4";

export const ApiFreeTrialV2Schema = z.object({
	duration_length: z.number().meta({
		description: "Number of duration_type periods the trial lasts.",
	}),
	duration_type: z.enum(FreeTrialDuration).meta({
		description:
			"Unit of time for the trial duration ('day', 'month', 'year').",
	}),
	card_required: z.boolean().meta({
		description:
			"Whether a payment method is required to start the trial. If true, customer will be charged after trial ends.",
	}),
});

export type ApiFreeTrialV2 = z.infer<typeof ApiFreeTrialV2Schema>;
