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
	id: z.string(),
	name: z.string().nullish(),
	type: z.enum(ApiFeatureType),
	display: z
		.object({
			singular: z.string(),
			plural: z.string(),
		})
		.nullish(),

	credit_schema: z
		.array(
			z.object({
				metered_feature_id: z.string(),
				credit_cost: z.number(),
			}),
		)
		.nullish(),

	archived: z.boolean().nullish(),
});

export type ApiFeature = z.infer<typeof ApiFeatureSchema>;
