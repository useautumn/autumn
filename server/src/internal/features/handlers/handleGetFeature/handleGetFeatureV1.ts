import {
	AffectedResource,
	dbToApiFeatureV1,
	findFeatureById,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

export const handleGetFeatureV1 = createRoute({
	resource: AffectedResource.Feature,
	params: z.object({
		feature_id: z.string(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { feature_id } = c.req.param();

		const feature = findFeatureById({
			features: ctx.features,
			featureId: feature_id,
			errorOnNotFound: true,
		});

		const apiFeature = dbToApiFeatureV1({
			ctx,
			dbFeature: feature,
			targetVersion: ctx.apiVersion,
		});

		return c.json(apiFeature);
	},
});
