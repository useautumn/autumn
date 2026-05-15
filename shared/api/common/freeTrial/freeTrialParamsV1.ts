import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums";
import { z } from "zod/v4";

export const FreeTrialParamsV1Schema = z
	.object({
		duration_length: z.number().meta({
			description: "Number of duration_type periods the trial lasts.",
		}),
		duration_type: z
			.enum(FreeTrialDuration)
			.default(FreeTrialDuration.Month)
			.meta({
				description: "Unit of time for the trial ('day', 'month', 'year').",
			}),
		card_required: z.boolean().default(true).meta({
			description:
				"If true, payment method required to start trial. Customer is charged after trial ends.",
		}),
		on_end: z
			.enum(["bill", "revert"])
			.optional()
			.meta({
				description:
					"Behavior when the trial ends. 'bill' charges the customer (default). 'revert' expires the trial and restores the customer's previous plan.",
			}),
	})
	.meta({
		title: "FreeTrialParams",
		description: "Free trial configuration for a plan.",
	});

export type FreeTrialParamsV1 = z.infer<typeof FreeTrialParamsV1Schema>;
