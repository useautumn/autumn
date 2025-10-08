import { z } from "zod/v4";

export const ChatFeatureCreditSchema = z.object({
	metered_feature_id: z.string().nonempty(),
	credit_cost: z.number().gt(0),
});

export const ChatResultFeatureSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.enum(["boolean", "single_use", "continuous_use", "credit_system"]),

	display: z.object({
		singular: z.string(),
		plural: z.string(),
	}),

	credit_schema: z
		.array(
			z.object({
				metered_feature_id: z.string(),
				credit_cost: z.number(),
			}),
		)
		.nullish(),
});

export type ChatResultFeature = z.infer<typeof ChatResultFeatureSchema>;
