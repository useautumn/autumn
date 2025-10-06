import { z } from "zod/v4";
import { ApiFeatureType } from "./apiFeature.js";

// Create Feature Params
export const CreateFeatureParamsSchema = z.object({
	id: z.string().meta({
		description: "The ID of the feature",
		example: "feature_123",
	}),
	name: z.string().nullish().meta({
		description: "The name of the feature",
		example: "API Calls",
	}),
	type: z.enum(ApiFeatureType).meta({
		description: "The type of the feature",
		example: "single_use",
	}),
	display: z
		.object({
			singular: z.string(),
			plural: z.string(),
		})
		.nullish()
		.meta({
			description: "Display names for the feature",
			example: { singular: "API Call", plural: "API Calls" },
		}),
	credit_schema: z
		.array(
			z.object({
				metered_feature_id: z.string(),
				credit_cost: z.number(),
			}),
		)
		.nullish()
		.meta({
			description:
				"Credit schema for credit system features (only applicable when type is credit_system)",
			example: [{ metered_feature_id: "api_calls", credit_cost: 10 }],
		}),
});

// Update Feature Params
export const UpdateFeatureParamsSchema = z.object({
	id: z.string().optional().meta({
		description: "The ID of the feature",
		example: "feature_123",
	}),
	name: z.string().optional().meta({
		description: "The name of the feature",
		example: "API Calls",
	}),
	type: z.enum(ApiFeatureType).optional().meta({
		description: "The type of the feature",
		example: "single_use",
	}),
	display: z
		.object({
			singular: z.string(),
			plural: z.string(),
		})
		.optional()
		.meta({
			description: "Display names for the feature",
			example: { singular: "API Call", plural: "API Calls" },
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
				"Credit schema for credit system features (only applicable when type is credit_system)",
			example: [{ metered_feature_id: "api_calls", credit_cost: 10 }],
		}),
	archived: z.boolean().optional().meta({
		description: "Whether the feature is archived",
		example: false,
	}),
});

export type CreateFeatureParams = z.infer<typeof CreateFeatureParamsSchema>;
export type UpdateFeatureParams = z.infer<typeof UpdateFeatureParamsSchema>;
