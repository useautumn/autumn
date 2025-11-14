import { z } from "zod/v4";

export enum ApiFeatureType {
	Static = "static", // legacy (will deprecate)

	Boolean = "boolean",
	SingleUsage = "single_use",
	ContinuousUse = "continuous_use",
	CreditSystem = "credit_system",
}

export const FEATURE_EXAMPLE = {
	id: "tokens",
	name: "Tokens",
	type: "single_use",
	display: {
		singular: "token",
		plural: "tokens",
	},
	credit_schema: null,
	archived: false,
};

// Base schema without .meta() to avoid side effects during imports
export const ApiFeatureV0Schema = z.object({
	id: z.string().meta({
		description:
			"The ID of the feature, used to refer to it in other API calls like /track or /check.",
	}),
	name: z.string().nullish().meta({
		description: "The name of the feature.",
	}),
	type: z.enum(ApiFeatureType).meta({
		description: "The type of the feature",
	}),
	display: z
		.object({
			singular: z.string().meta({
				description: "The singular display name for the feature.",
			}),
			plural: z.string().meta({
				description: "The plural display name for the feature.",
			}),
		})
		.nullish()
		.meta({
			description: "Singular and plural display names for the feature.",
		}),

	credit_schema: z
		.array(
			z.object({
				metered_feature_id: z.string().meta({
					description:
						"The ID of the metered feature (should be a single_use feature).",
				}),
				credit_cost: z.number().meta({
					description: "The credit cost of the metered feature.",
				}),
			}),
		)
		.nullish()
		.meta({
			description: "Credit cost schema for credit system features.",
		}),

	archived: z.boolean().nullish().meta({
		description: "Whether or not the feature is archived.",
	}),
});

export type ApiFeatureV0 = z.infer<typeof ApiFeatureV0Schema>;
