import { z } from "zod/v4";
import { FeatureType } from "../../models/featureModels/featureEnums";

export const ApiFeatureV1Schema = z.object({
	id: z.string().meta({
		description:
			"The unique identifier for this feature, used in /check and /track calls.",
	}),
	name: z.string().meta({
		description:
			"Human-readable name displayed in the dashboard and billing UI.",
	}),
	type: z.enum(FeatureType).meta({
		description:
			"Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.",
	}),

	consumable: z.boolean().meta({
		description:
			"For metered features: true if usage resets periodically (API calls, credits), false if allocated persistently (seats, storage).",
	}),

	event_names: z.array(z.string()).optional().meta({
		description:
			"Event names that trigger this feature's balance. Allows multiple features to respond to a single event.",
	}),
	credit_schema: z
		.array(
			z.object({
				metered_feature_id: z.string().meta({
					description:
						"ID of the metered feature that draws from this credit system.",
				}),
				credit_cost: z.number().meta({
					description: "Credits consumed per unit of the metered feature.",
				}),
			}),
		)
		.optional()
		.meta({
			description:
				"For credit_system features: maps metered features to their credit costs.",
		}),

	display: z
		.object({
			singular: z.string().nullish().meta({
				description: "Singular form for UI display (e.g., 'API call', 'seat').",
			}),
			plural: z.string().nullish().meta({
				description: "Plural form for UI display (e.g., 'API calls', 'seats').",
			}),
		})
		.optional()
		.meta({
			description:
				"Display names for the feature in billing UI and customer-facing components.",
		}),

	archived: z.boolean().meta({
		description:
			"Whether the feature is archived and hidden from the dashboard.",
	}),
});

export type ApiFeatureV1 = z.infer<typeof ApiFeatureV1Schema>;
