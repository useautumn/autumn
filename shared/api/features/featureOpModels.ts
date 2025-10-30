import { z } from "zod/v4";
import { ApiFeatureType } from "./apiFeature.js";

const featureDescriptions = {
	id: "The ID of the feature. This is used to refer to it in other API calls like /track or /check.",
	name: "The name of the feature.",
	type: "The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.",
	display:
		"Singular and plural display names for the feature in your user interface.",

	credit_schema:
		"A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features.",

	archived:
		"Whether the feature is archived. Archived features are hidden from the dashboard and list features endpoint.",
};

// Create Feature Params
export const CreateFeatureParamsSchema = z.object({
	id: z.string().meta({ description: featureDescriptions.id }),
	name: z.string().nullish().meta({ description: featureDescriptions.name }),
	type: z.enum(ApiFeatureType).meta({ description: featureDescriptions.type }),
	display: z
		.object({
			singular: z.string(),
			plural: z.string(),
		})
		.nullish()
		.meta({ description: featureDescriptions.display }),

	credit_schema: z
		.array(
			z.object({
				metered_feature_id: z.string(),
				credit_cost: z.number(),
			}),
		)
		.nullish()
		.meta({ description: featureDescriptions.credit_schema }),
});

// Update Feature Params
export const UpdateFeatureParamsSchema = z.object({
	id: z.string().optional().meta({ description: featureDescriptions.id }),
	name: z.string().optional().meta({ description: featureDescriptions.name }),
	type: z
		.enum(ApiFeatureType)
		.optional()
		.meta({ description: featureDescriptions.type }),
	display: z
		.object({
			singular: z.string(),
			plural: z.string(),
		})
		.optional()
		.meta({ description: featureDescriptions.display }),

	credit_schema: z
		.array(
			z.object({
				metered_feature_id: z.string(),
				credit_cost: z.number(),
			}),
		)
		.optional()
		.meta({ description: featureDescriptions.credit_schema }),
	archived: z
		.boolean()
		.optional()
		.meta({ description: featureDescriptions.archived }),
});

export type CreateFeatureParams = z.infer<typeof CreateFeatureParamsSchema>;
export type UpdateFeatureParams = z.infer<typeof UpdateFeatureParamsSchema>;
