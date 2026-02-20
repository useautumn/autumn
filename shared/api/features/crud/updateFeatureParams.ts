import { z } from "zod/v4";
import { BaseFeatureV1ParamsSchema } from "./common/baseFeatureParamsV1";

export const UpdateFeatureV1ParamsSchema =
	BaseFeatureV1ParamsSchema.partial().extend({
		archived: z.boolean().optional().meta({
			description:
				"Whether the feature is archived. Archived features are hidden from the dashboard.",
		}),
	});

export const UpdateFeatureV2ParamsSchema = UpdateFeatureV1ParamsSchema.omit({
	id: true,
}).extend({
	feature_id: z.string().meta({
		description: "The ID of the feature to update.",
	}),
	new_feature_id: z.string().optional().meta({
		description:
			"The new ID of the feature. Feature ID can only be updated if it's not being used by any customers.",
	}),
});

export type UpdateFeatureV1Params = z.infer<typeof UpdateFeatureV1ParamsSchema>;
export type UpdateFeatureV2Params = z.infer<typeof UpdateFeatureV2ParamsSchema>;
