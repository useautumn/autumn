import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums.js";
import { z } from "zod/v4";

export const ApiFreeTrialSchema = z.object({
	duration: z.enum(FreeTrialDuration).meta({
		description: "The duration type of the free trial",
		example: "<string>",
	}),
	length: z.number().meta({
		description: "The length of the free trial",
		example: 123,
	}),
	unique_fingerprint: z.boolean().meta({
		description:
			"Whether the free trial is limited to one per customer fingerprint",
		example: true,
	}),
	card_required: z.boolean().meta({
		description: "Whether the free trial requires a card",
		example: true,
	}),

	// For Cus Product
	trial_available: z.boolean().nullish().default(true).meta({
		description: "Whether the free trial is available",
		example: true,
	}),
});

export type ApiFreeTrial = z.infer<typeof ApiFreeTrialSchema>;
