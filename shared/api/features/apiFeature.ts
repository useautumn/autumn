import { z } from "zod/v4";

export enum ApiFeatureType {
	Static = "static", // legacy (will deprecate)

	Boolean = "boolean",
	SingleUsage = "single_use",
	ContinuousUse = "continuous_use",
	CreditSystem = "credit_system",
}

// Base schema without .meta() to avoid side effects during imports
export const ApiFeatureSchema = z.object({
	id: z.string().meta({
		description: "The unique identifier of the feature",
		example: "<string>",
	}),
	name: z.string().nullish().meta({
		description: "The name of the feature",
		example: "<string>",
	}),
	type: z.enum(ApiFeatureType).meta({
		description: "The type of the feature",
		example: "<string>",
	}),
	display: z
		.object({
			singular: z.string(),
			plural: z.string(),
		})
		.nullish()
		.meta({
			description: "Display names for the feature",
			example: { singular: "<string>", plural: "<string>" },
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
			description: "Credit cost schema for credit system features",
			example: [{ metered_feature_id: "<string>", credit_cost: 123 }],
		}),

	archived: z.boolean().nullish().meta({
		description: "Whether or not the feature is archived",
		example: false,
	}),
});

export type ApiFeature = z.infer<typeof ApiFeatureSchema>;
