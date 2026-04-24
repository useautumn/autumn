import { AffectedResource, dbToApiFeatureV1, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

export const handleListFeaturesV1 = createRoute({
	scopes: [Scopes.Features.Read],
	resource: AffectedResource.Feature,
	handler: async (c) => {
		const ctx = c.get("ctx");

		const apiFeatures = ctx.features.map((feature) =>
			dbToApiFeatureV1({
				ctx,
				dbFeature: feature,
				targetVersion: ctx.apiVersion,
			}),
		);

		return c.json({ list: apiFeatures });
	},
});
