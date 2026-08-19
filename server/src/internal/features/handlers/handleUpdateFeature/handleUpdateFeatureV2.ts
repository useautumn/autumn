import {
	AffectedResource,
	ApiVersion,
	dbToApiFeatureV1,
	FeatureType,
	featureV1ToDbFeatureConfig,
	findFeatureById,
	InternalError,
	nullish,
	RecaseError,
	Scopes,
	UpdateFeatureRpcV2_3ParamsSchema,
	UpdateFeatureV2ParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateFeature } from "@/internal/features/featureActions/updateFeature.js";
import { validateInvoiceCreditFeatureType } from "../../featureUtils.js";

export const handleUpdateFeatureV2 = createRoute({
	scopes: [Scopes.Features.Write],
	versionedBody: {
		latest: UpdateFeatureV2ParamsSchema,
		[ApiVersion.V2_3]: UpdateFeatureRpcV2_3ParamsSchema,
	},
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
		validateInvoiceCreditFeatureType({
			invoiceCredit: body.invoice_credit,
			featureType: body.type ?? originalFeature.type,
		});

		// If changing type and consumable not provided, throw error
		if (body.type === FeatureType.Metered && nullish(body.consumable)) {
			throw new RecaseError({
				message: "Consumable is required when changing type to metered",
				statusCode: 400,
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
				model_markups: body.model_markups,
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
