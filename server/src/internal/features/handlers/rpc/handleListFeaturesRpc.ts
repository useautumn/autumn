import { AffectedResource, dbToApiFeatureV1 } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

export const handleListFeaturesRpc = createRoute({
	body: z.object({}),
	resource: AffectedResource.Feature,
	handler: async (c) => {
		c.req.valid("json");
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
