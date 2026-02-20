import { z } from "zod/v4";

export const GetFeatureParamsSchema = z.object({
	feature_id: z.string().meta({
		description: "The ID of the feature.",
	}),
});

export type GetFeatureParams = z.infer<typeof GetFeatureParamsSchema>;
