import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	apiPlan,
	buildMigrationDraft,
	CatalogUpdateParamsSchema,
	type CreateProductV2Params,
	dbToApiFeatureV1,
	diffPlanV1,
	featureV1ToDbFeature,
	type MigrationDraft,
	Scopes,
	type UpdateProductV2Params,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { updateFeature } from "@/internal/features/featureActions/updateFeature.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { updateProduct } from "@/internal/product/actions/updateProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

/**
 * Apply a batch catalog change (features + plans) in one call. Plans upsert by
 * id; versioning is handled by updateProduct via `disable_version`. When an
 * in-place update changes a plan with customers and `create_migration` is set,
 * a migration draft is created (NOT run) from the diff.
 */
export const handleUpdateCatalog = createRoute({
	scopes: { ALL: [Scopes.Plans.Write, Scopes.Features.Write] },
	body: CatalogUpdateParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const { features, plans, create_migration } = c.req.valid("json");
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;

		// 1. Upsert features (creates first so plans can reference them).
		for (const feature of features) {
			const existing = await FeatureService.get({
				db,
				orgId: org.id,
				env,
				id: feature.feature_id,
			});
			const dbFeature = featureV1ToDbFeature({
				apiFeature: { id: feature.feature_id, ...feature },
				originalFeature: existing ?? undefined,
			});
			if (existing) {
				await updateFeature({
					ctx,
					featureId: feature.feature_id,
					updates: dbFeature,
				});
			} else {
				await createFeature({ ctx, data: dbFeature });
			}
		}

		// 2. Upsert plans; create migration drafts for in-place customer changes.
		const migrations: MigrationDraft[] = [];
		for (const planParams of plans) {
			const { plan_id, new_plan_id, disable_version, version, ...rest } =
				planParams;
			const current = await ProductService.getFull({
				db,
				idOrInternalId: plan_id,
				orgId: org.id,
				env,
				version,
				allowNotFound: true,
			});

			if (!current) {
				const createParams = apiPlan.map.paramsV1ToProductV2({
					ctx,
					params: {
						id: plan_id,
						...rest,
						add_on: rest.add_on ?? false,
						auto_enable: rest.auto_enable ?? false,
					},
				}) as CreateProductV2Params;
				await createProduct({ ctx, data: createParams });
				continue;
			}

			const fromPlan =
				create_migration && disable_version
					? await getPlanResponse({
							ctx,
							product: current,
							features: ctx.features,
						})
					: null;

			const updateParams = apiPlan.map.paramsV1ToProductV2({
				ctx,
				currentFullProduct: current,
				params: { id: new_plan_id ?? plan_id, ...rest },
			}) as UpdateProductV2Params;
			await updateProduct({
				ctx,
				productId: plan_id,
				query: { version, disable_version },
				updates: updateParams,
				initialFullProduct: current,
			});

			if (fromPlan) {
				const after = await ProductService.getFull({
					db,
					idOrInternalId: new_plan_id ?? plan_id,
					orgId: org.id,
					env,
					version: current.version,
				});
				const toPlan = await getPlanResponse({
					ctx,
					product: after,
					features: ctx.features,
				});
				const cusProducts = await CusProductService.getByInternalProductId({
					db,
					internalProductId: current.internal_id,
				});
				const hasDiff =
					Object.keys(diffPlanV1({ from: fromPlan, to: toPlan })).length > 0;
				if (cusProducts.length > 0 && hasDiff) {
					const draft = buildMigrationDraft({
						from: fromPlan,
						to: toPlan,
						planId: plan_id,
						version: current.version,
						scope: "all_customers",
					});
					await migrationRepo.insert({ ctx, insert: draft });
					migrations.push(draft);
				}
			}
		}

		// 3. Resolve the latest catalog for the response.
		const resolvedPlans = await Promise.all(
			plans.map(async (planParams) => {
				const product = await ProductService.getFull({
					db,
					idOrInternalId: planParams.new_plan_id ?? planParams.plan_id,
					orgId: org.id,
					env,
					allowNotFound: true,
				});
				return product
					? getPlanResponse({ ctx, product, features: ctx.features })
					: null;
			}),
		);

		const resolvedFeatures = await Promise.all(
			features.map(async (feature) => {
				const dbFeature = await FeatureService.get({
					db,
					orgId: org.id,
					env,
					id: feature.feature_id,
				});
				return dbFeature
					? dbToApiFeatureV1({
							ctx,
							dbFeature,
							targetVersion: new ApiVersionClass(ApiVersion.V2_1),
						})
					: null;
			}),
		);

		return c.json({
			plans: resolvedPlans.filter((plan) => plan !== null),
			features: resolvedFeatures.filter((feature) => feature !== null),
			migrations,
		});
	},
});
