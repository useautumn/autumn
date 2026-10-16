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
import { checkCatalogEditApprovals } from "@/internal/approvals/enforce/checkCatalogEditApprovals.js";
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

		await checkCatalogEditApprovals({
			ctx,
			planIds: [
				...(params.plans ?? []).flatMap(({ plan_id, new_plan_id }) => [
					plan_id,
					new_plan_id,
				]),
				...params.remove_plans.map(({ plan_id }) => plan_id),
			],
			featureIds: [
				...(params.features ?? []).flatMap(
					({ feature_id, new_feature_id, internal_id }) => [
						feature_id,
						new_feature_id,
						ctx.features.find((feature) => feature.internal_id === internal_id)
							?.id,
					],
				),
				...params.remove_features.map(({ feature_id }) => feature_id),
			],
			includeExisting: !params.skip_deletions,
		});

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
				rewards: catalogResult?.rewards ?? [],
				referral_programs: catalogResult?.referralPrograms ?? [],
			},
			...(catalogResult?.migrations.length
				? { migrations: catalogResult.migrations }
				: {}),
		});
		return c.json(response);
	},
});
