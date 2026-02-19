import {
	AffectedResource,
	dbToApiFeatureV1,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

export const handleGetFeatureRpc = createRoute({
	resource: AffectedResource.Feature,
	body: z.object({
		feature_id: z.string(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { feature_id } = c.req.valid("json");

		const feature = await FeatureService.get({
			db: ctx.db,
			id: feature_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		if (!feature) {
			throw new RecaseError({
				message: `Feature with id ${feature_id} not found`,
				code: ErrCode.FeatureNotFound,
				statusCode: 404,
			});
		}

		const apiFeature = dbToApiFeatureV1({
			ctx,
			dbFeature: feature,
			targetVersion: ctx.apiVersion,
		});

		return c.json(apiFeature);
	},
});
