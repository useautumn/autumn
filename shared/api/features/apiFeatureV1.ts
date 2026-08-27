import { z } from "zod/v4";
import {
	ModelMarkupsSchema,
	ProviderMarkupsSchema,
} from "../../models/featureModels/featureConfig/creditConfig";
import { FeatureType } from "../../models/featureModels/featureEnums";
import { ApiFeatureProcessorsSchema } from "./components/processors.js";
import { ApiCreditSchemaResponseItemSchema } from "./creditRateCard.js";

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
			"Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools, 'ai_credit_system' for model-based token pricing.",
	}),

	consumable: z.boolean().meta({
		description:
			"For metered features: true if usage resets periodically (API calls, credits), false if allocated persistently (seats, storage).",
	}),

	event_names: z.array(z.string()).optional().meta({
		description:
			"Event names that trigger this feature's balance. Allows multiple features to respond to a single event.",
	}),
	credit_schema: z.array(ApiCreditSchemaResponseItemSchema).optional().meta({
		description:
			"For classic credit systems: maps metered features to flat or graduated credit costs.",
	}),

	invoice_credit: z.boolean().optional().meta({
		description:
			"Whether usage of this classic credit system should be itemized as invoice credits.",
	}),

	model_markups: ModelMarkupsSchema.optional().meta({
		description: "Per-model markup overrides for AI credit systems.",
	}),

	default_markup: z.number().min(-100).optional().meta({
		description:
			"Default percentage markup for AI credit systems. Use -100 to make usage free.",
	}),

	provider_markups: ProviderMarkupsSchema.optional().meta({
		description:
			"Per-provider default markup percentages for AI credit systems.",
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

	processors: ApiFeatureProcessorsSchema.optional().meta({
		description:
			"Processor mappings for this feature. Present when a Stripe product or meter is set.",
	}),
});

export type ApiFeatureV1 = z.infer<typeof ApiFeatureV1Schema>;
