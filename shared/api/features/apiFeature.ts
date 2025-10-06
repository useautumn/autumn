import { z } from "zod/v4";

export enum APIFeatureType {
	Boolean = "boolean",
	SingleUsage = "single_use",
	ContinuousUse = "continuous_use",
	CreditSystem = "credit_system",
}

export const APIFeatureSchema = z
	.object({
		id: z.string(),
		name: z.string().nullish(),
		type: z.nativeEnum(APIFeatureType),
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
	})
	.meta({
		id: "Feature",
		description: "Feature object returned by the API",
	});

export type APIFeature = z.infer<typeof APIFeatureSchema>;
