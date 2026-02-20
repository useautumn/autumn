import { z } from "zod/v4";
import { FeatureType } from "../../../../models/featureModels/featureEnums";
import { idRegex } from "../../../../utils/utils";

export const BaseFeatureV1ParamsSchema = z.object({
	id: z.string().nonempty().regex(idRegex).meta({
		description:
			"The ID of the feature. This is used to refer to it in other API calls like /track or /check.",
	}),
	name: z
		.string()
		.nonempty()
		.optional()
		.meta({ description: "The name of the feature." }),
	type: z.enum(FeatureType).meta({
		description:
			"The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.",
	}),

	consumable: z.boolean().optional().meta({
		description:
			"Whether this feature is consumable. A consumable feature is one that periodically resets and is consumed rather than allocated (like credits, API requests, etc.). Applicable only for 'metered' features.",
	}),

	display: z
		.object({
			singular: z.string(),
			plural: z.string(),
		})
		.optional()
		.meta({
			description:
				"Singular and plural display names for the feature in your user interface.",
		}),

	credit_schema: z
		.array(
			z.object({
				metered_feature_id: z.string(),
				credit_cost: z.number(),
			}),
		)
		.optional()
		.meta({
			description:
				"A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features.",
		}),

	event_names: z.array(z.string()).optional(),
});
