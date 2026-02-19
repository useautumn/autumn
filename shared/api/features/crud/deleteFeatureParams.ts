import { z } from "zod/v4";

export const DeleteFeatureV1ParamsSchema = z.object({
	feature_id: z.string().meta({
		description: "The ID of the feature to delete.",
	}),
});

export type DeleteFeatureV1Params = z.infer<typeof DeleteFeatureV1ParamsSchema>;
