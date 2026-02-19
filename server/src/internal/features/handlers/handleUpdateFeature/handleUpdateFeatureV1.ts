import {
	AffectedResource,
	ApiVersion,
	dbToApiFeatureV1,
	FeatureNotFoundError,
	FeatureType,
	featureV1ToDbFeatureConfig,
	InternalError,
	nullish,
	RecaseError,
	UpdateFeatureV0ParamsSchema,
	UpdateFeatureV1ParamsSchema,
} from "@autumn/shared";

import { createRoute } from "@/honoMiddlewares/routeHandler";
import { updateFeature } from "@/internal/features/featureActions/updateFeature";

export const handleUpdateFeatureV1 = createRoute({
	versionedBody: {
		latest: UpdateFeatureV1ParamsSchema,
		[ApiVersion.V1_Beta]: UpdateFeatureV0ParamsSchema,
	},
	resource: AffectedResource.Feature,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { feature_id } = c.req.param();
		const originalFeature = ctx.features.find((f) => f.id === feature_id);
		if (!originalFeature) {
			throw new FeatureNotFoundError({ featureId: feature_id });
		}

		// If changing type and consumable not provided, throw error
		if (body.type === FeatureType.Metered && nullish(body.consumable)) {
			throw new RecaseError({
				message: "Consumable is required when changing type to metered",
			});
		}

		const newConfig = featureV1ToDbFeatureConfig({
			apiFeature: body,
			originalFeature,
		});

		const updatedFeature = await updateFeature({
			ctx,
			featureId: feature_id,
			updates: {
				id: body.id,
				name: body.name ?? undefined,
				type: body.type,

				config: newConfig,

				archived: body.archived,
				event_names: body.event_names,
				display: body.display,
			},
		});

		if (!updatedFeature) {
			throw new InternalError({ message: "Update feature returned null" });
		}

		return c.json(
			dbToApiFeatureV1({
				ctx,
				dbFeature: updatedFeature,
				targetVersion: ctx.apiVersion,
			}),
		);
	},
});
