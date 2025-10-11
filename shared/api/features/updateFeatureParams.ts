import { z } from "zod/v4";
import { ApiFeatureType } from "./apiFeature.js";

export const UpdateFeatureParamsSchema = z.object({
	id: z.string().optional(),
	name: z.string().nullish(),
	type: z.enum(ApiFeatureType).optional(),
	archived: z.boolean().optional(),

	credit_schema: z
		.array(
			z.object({
				metered_feature_id: z.string(),
				credit_cost: z.number(),
			}),
		)
		.nullish(),

	display: z
		.object({
			singular: z.string(),
			plural: z.string(),
		})
		.optional(),

	event_names: z.array(z.string()).optional(),
});

export type UpdateFeatureParams = z.infer<typeof UpdateFeatureParamsSchema>;
