import {
	AffectedResource,
	dbToApiFeatureV1,
	findFeatureById,
	GetFeatureParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

export const handleGetFeatureV2 = createRoute({
	resource: AffectedResource.Feature,
	body: GetFeatureParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { feature_id } = c.req.valid("json");

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
