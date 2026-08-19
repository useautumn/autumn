import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	dbToApiFeatureV1,
	Scopes,
	UpdateCatalogParamsSchema,
	UpdateCatalogResponseSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange";
import { catalogV2Actions } from "@/internal/catalogV2/actions/index.js";

const FEATURE_TARGET_VERSION = new ApiVersionClass(ApiVersion.V2_1);

export const handleUpdateCatalogV2 = createRoute({
	scopes: { ALL: [Scopes.Plans.Write, Scopes.Features.Write] },
	body: UpdateCatalogParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const { updateCatalogPlan, catalogResult } =
			await catalogV2Actions.updateCatalog({ ctx, params });

		const response = UpdateCatalogResponseSchema.parse({
			plans: updateCatalogPlan.upsertProducts.flatMap((upsert) =>
				upsert.row.source !== "direct"
					? []
					: [
							fullProductToApiPlanV1Sync({
								product: upsert.row.nextFullProduct,
								features: updateCatalogPlan.projected.features,
							}),
						],
			),
			features: [
				...updateCatalogPlan.insertFeatures,
				...updateCatalogPlan.updateFeatures.map(
					(updateFeaturePlan) => updateFeaturePlan.next,
				),
			].map((feature) =>
				dbToApiFeatureV1({
					ctx,
					dbFeature: feature,
					targetVersion: FEATURE_TARGET_VERSION,
				}),
			),
			results: {
				plans: catalogResult?.plans ?? [],
				features: catalogResult?.features ?? [],
			},
			...(catalogResult?.migrations.length
				? { migrations: catalogResult.migrations }
				: {}),
		});
		return c.json(response);
	},
});
