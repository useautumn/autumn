import type {
	CatalogPreviewUpdateResponse,
	CatalogUpdateParams,
	FullProduct,
	PlanUpdatePreview,
} from "@autumn/shared";
import { PlanUpdatePreviewSchema } from "@autumn/shared";
import { scopeExpandForCtx } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import {
	deriveReplaceFeatureIds,
	deriveReplacePlanIds,
} from "../deriveReplaceRemovals.js";
import { sortRemoveFeatureIds } from "../featureRemovalOrder.js";
import { previewFeature, previewRemoveFeature } from "./previewFeature.js";
import { previewCatalogPlanUpdate } from "./previewCatalogPlanUpdate.js";
import { setupPreviewCatalogContext } from "./setupPreviewCatalogContext.js";

const productUsesFeature = ({
	product,
	featureId,
}: {
	product: FullProduct;
	featureId: string;
}) =>
	product.entitlements.some((entitlement) => entitlement.feature.id === featureId) ||
	product.prices.some((price) => price.config?.feature_id === featureId);

const productsForFeatureRemovalPreview = ({
	featureId,
	products,
	plans,
	planResults,
	removePlanIds,
}: {
	featureId: string;
	products: FullProduct[];
	plans: CatalogUpdateParams["plans"];
	planResults: CatalogPreviewUpdateResponse["plan_changes"];
	removePlanIds: Set<string>;
}) => {
	const planParamsById = new Map(plans.map((plan) => [plan.plan_id, plan]));
	const planResultById = new Map(
		planResults.map((result) => [result.plan_id, result]),
	);

	return products.filter((product) => {
		if (removePlanIds.has(product.id)) {
			return false;
		}

		const planParams = planParamsById.get(product.id);
		if (!planParams?.items || !productUsesFeature({ product, featureId })) {
			return true;
		}

		const removesFeature = !planParams.items.some(
			(item) => item.feature_id === featureId,
		);
		const planVersions =
			planResultById.get(product.id)?.versionable ?? false;

		return !(removesFeature && !planVersions);
	});
};

const previewRemovePlan = ({
	product,
	hasCustomers,
}: {
	product: FullProduct;
	hasCustomers: boolean;
}): PlanUpdatePreview & { will_archive: boolean } => ({
	...PlanUpdatePreviewSchema.parse({
		plan_id: product.id,
		has_customers: hasCustomers,
		versionable: false,
		customize: null,
		previous_attributes: {
			id: product.id,
			name: product.name,
		},
		item_changes: [],
		variants: [],
	}),
	will_archive: hasCustomers,
});

/**
 * Resolve a proposed catalog change (features + plans) WITHOUT persisting, so a
 * live preview matches what `catalog.update` would apply. Reads and the virtual
 * feature upsert are batched up front by setupPreviewCatalogContext.
 */
export const previewUpdateCatalog = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
}): Promise<CatalogPreviewUpdateResponse> => {
	const { plans, features, skip_deletions } = params;
	const currency = ctx.org.default_currency ?? "usd";

	const { products, currents, withCustomers, proposedFeatures, planCtx } =
		await setupPreviewCatalogContext({ ctx, params });
	const planChangesCtx = scopeExpandForCtx({
		ctx: { ...planCtx, expand: params.expand ?? [] },
		prefix: "plan_changes",
	});
	const featureChangesCtx = scopeExpandForCtx({
		ctx: { ...ctx, expand: params.expand ?? [] },
		prefix: "feature_changes",
	});

	const missingPlanIds = skip_deletions
		? []
		: deriveReplacePlanIds({ products, plans });
	const missingFeatureIds = skip_deletions
		? []
		: deriveReplaceFeatureIds({
				features: ctx.features,
				desiredFeatures: features,
			});
	const missingProducts = products.filter((product) =>
		missingPlanIds.includes(product.id),
	);
	const missingPlanCustomerCounts = await Promise.all(
		missingProducts.map((product) =>
			CusProdReadService.getCountsForAllVersions({
				db: ctx.db,
				productId: product.id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		),
	);
	const missingPlanCustomers = new Set(
		missingProducts
			.filter((_, index) => Number(missingPlanCustomerCounts[index]?.all ?? 0) > 0)
			.map((product) => product.id),
	);

	const [planResults, featureResults] = await Promise.all([
		Promise.all(
			plans.map((planParams, index) => {
				const current = currents[index];
				return previewCatalogPlanUpdate({
					ctx: planChangesCtx,
					planParams,
					current,
					hasCustomers: current
						? withCustomers.has(current.internal_id)
						: false,
					currency,
				});
			}),
		),
		Promise.all(
			proposedFeatures.map(({ existing, dbFeature }) =>
				// Blockers are detected against the persisted catalog, so pass `ctx`.
				previewFeature({
					ctx: featureChangesCtx,
					dbFeature,
					existing,
					products,
				}),
			),
		),
	]);
	const removePlanResults = missingProducts.map((product) =>
		previewRemovePlan({
			product,
			hasCustomers: missingPlanCustomers.has(product.id),
		}),
	);
	const planChanges = planResults.map((planResult) => ({
		...planResult,
		will_archive: false,
	}));

	const removeFeatureResults = [];
	const removedFeatureIds = new Set<string>();
	for (const featureId of sortRemoveFeatureIds({
		features: ctx.features,
		featureIds: missingFeatureIds,
	})) {
		const removalCtx = {
			...featureChangesCtx,
			features: featureChangesCtx.features.filter(
				(feature) => !removedFeatureIds.has(feature.id),
			),
		};
		removeFeatureResults.push(
			await previewRemoveFeature({
				ctx: removalCtx,
				featureId,
				products: productsForFeatureRemovalPreview({
					featureId,
					products,
					plans,
					planResults: [...planChanges, ...removePlanResults],
					removePlanIds: new Set(missingPlanIds),
				}),
			}),
		);
		removedFeatureIds.add(featureId);
	}

	return {
		plan_changes: [...planChanges, ...removePlanResults],
		feature_changes: [...featureResults, ...removeFeatureResults],
	};
};
