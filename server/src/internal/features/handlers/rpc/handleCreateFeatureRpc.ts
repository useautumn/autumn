import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	CreateFeatureV1ParamsSchema,
	dbToApiFeatureV1,
	featureV1ToDbFeature,
	InternalError,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";

export const handleCreateFeatureRpc = createRoute({
	body: CreateFeatureV1ParamsSchema,
	resource: AffectedResource.Feature,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		// Get backend feature
		const feature = featureV1ToDbFeature({
			apiFeature: body,
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
				targetVersion: new ApiVersionClass(ApiVersion.V2_1),
			}),
		);
	},
});
