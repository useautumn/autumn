import { z } from "zod/v4";
import { FeatureType } from "../../models/featureModels/featureEnums";

export const ApiFeatureV1Schema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.enum(FeatureType),

	consumable: z.boolean(),

	event_names: z.array(z.string()).optional(),
	credit_schema: z
		.array(
			z.object({
				metered_feature_id: z.string(),
				credit_cost: z.number(),
			}),
		)
		.optional(),

	display: z
		.object({
			singular: z.string().nullish(),
			plural: z.string().nullish(),
		})
		.optional(),

	archived: z.boolean(),
});

export type ApiFeatureV1 = z.infer<typeof ApiFeatureV1Schema>;
