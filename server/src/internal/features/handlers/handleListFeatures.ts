import { AffectedResource, dbToApiFeatureV1 } from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler";

export const handleListFeatures = createRoute({
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
