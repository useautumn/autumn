import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	dbToApiFeatureV1,
	FeatureNotFoundError,
	FeatureType,
	featureV1ToDbFeatureConfig,
	InternalError,
	nullish,
	RecaseError,
	UpdateFeatureV1ParamsSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateFeature } from "@/internal/features/featureActions/updateFeature.js";

const UpdateFeatureV1RpcParamsSchema = UpdateFeatureV1ParamsSchema.extend({
	feature_id: z.string(),
});

export const handleUpdateFeatureRpc = createRoute({
	body: UpdateFeatureV1RpcParamsSchema,
	resource: AffectedResource.Feature,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { feature_id } = body;
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
				targetVersion: new ApiVersionClass(ApiVersion.V2_1),
			}),
		);
	},
});
