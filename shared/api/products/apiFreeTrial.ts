import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums.js";
import { z } from "zod/v4";

export const ApiFreeTrialSchema = z.object({
	duration: z.enum(FreeTrialDuration).meta({
		description: "The duration type of the free trial",
	}),
	length: z.number().meta({
		description: "The length of the duration type specified",
	}),
	unique_fingerprint: z.boolean().meta({
		description:
			"Whether the free trial is limited to one per customer fingerprint",
	}),

	card_required: z.boolean().meta({
		description:
			"Whether the free trial requires a card. If false, the customer can attach the product without going through a checkout flow or having a card on file.",
	}),

	// For Cus Product
	trial_available: z.boolean().nullish().default(true).meta({
		description:
			"Used in customer context. Whether the free trial is available for the customer if they were to attach the product.",
	}),
});

export type ApiFreeTrial = z.infer<typeof ApiFreeTrialSchema>;
