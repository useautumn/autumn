import {
	AffectedResource,
	ApiVersion,
	CreateFeatureV0ParamsSchema,
	dbToApiFeatureV1,
	featureV1ToDbFeature,
	InternalError,
} from "@autumn/shared";
import { CreateFeatureV1ParamsSchema } from "@autumn/shared/api/features/crud/createFeatureParams";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { createFeature } from "../../featureActions/createFeature";

export const handleCreateFeatureV1 = createRoute({
	versionedBody: {
		latest: CreateFeatureV1ParamsSchema,
		[ApiVersion.V1_Beta]: CreateFeatureV0ParamsSchema,
	},
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
			dbToApiFeatureV1({ ctx, dbFeature, targetVersion: ctx.apiVersion }),
		);
	},
});
