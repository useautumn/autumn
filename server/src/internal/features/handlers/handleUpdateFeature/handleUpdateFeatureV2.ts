import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	dbToApiFeatureV1,
	FeatureType,
	featureV1ToDbFeatureConfig,
	findFeatureById,
	InternalError,
	nullish,
	RecaseError,
	UpdateFeatureV2ParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateFeature } from "@/internal/features/featureActions/updateFeature.js";

export const handleUpdateFeatureV2 = createRoute({
	body: UpdateFeatureV2ParamsSchema,
	resource: AffectedResource.Feature,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { feature_id } = body;
		const originalFeature = findFeatureById({
			features: ctx.features,
			featureId: feature_id,
			errorOnNotFound: true,
		});

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
				id: body.new_feature_id,
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
				targetVersion: new ApiVersionClass(ApiVersion.V2_1),
			}),
		);
	},
});
