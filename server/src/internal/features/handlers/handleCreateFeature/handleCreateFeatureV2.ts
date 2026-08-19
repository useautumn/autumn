import {
	AffectedResource,
	ApiVersion,
	CreateFeatureRpcV2_3ParamsSchema,
	CreateFeatureV2ParamsSchema,
	dbToApiFeatureV1,
	featureV1ToDbFeature,
	InternalError,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";

export const handleCreateFeatureV2 = createRoute({
	scopes: [Scopes.Features.Write],
	versionedBody: {
		latest: CreateFeatureV2ParamsSchema,
		[ApiVersion.V2_3]: CreateFeatureRpcV2_3ParamsSchema,
	},
	resource: AffectedResource.Feature,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		// Get backend feature
		const feature = featureV1ToDbFeature({
			apiFeature: {
				id: body.feature_id,
				...body,
			},
			originalFeature: undefined,
		});

		// Body is now always in the latest V1 format, regardless of API version
		const dbFeature = await createFeature({
			ctx,
			data: feature,
		});

		if (!dbFeature) {
			throw new InternalError({ message: "Insert feature returned null" });
		}

		return c.json(
			dbToApiFeatureV1({
				ctx,
				dbFeature,
				targetVersion: ctx.apiVersion,
			}),
		);
	},
});
