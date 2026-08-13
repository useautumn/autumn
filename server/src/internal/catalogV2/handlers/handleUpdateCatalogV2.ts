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
			plans: [],
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
