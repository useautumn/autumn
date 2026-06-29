import type {
	CatalogMigrationPreview,
	CatalogPreviewUpdateResponse,
	CatalogPlanPreview,
	CatalogUpdateParams,
	FullProduct,
	PlanUpdatePreview,
} from "@autumn/shared";
import {
	buildAllVersionsUpdateMigrationDraft,
	buildCombinedVariantMigrationDraft,
	PlanUpdatePreviewSchema,
	planUpdatePreviewHasDiff,
	planDiffHasBillingChanges,
} from "@autumn/shared";
import { scopeExpandForCtx } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import {
	deriveReplaceFeatureIds,
	deriveReplacePlanIds,
} from "../deriveReplaceRemovals.js";
import { sortRemoveFeatureIds } from "../featureRemovalOrder.js";
import {
	previewFeature,
	previewRemoveFeature,
	previewSkippedFeature,
} from "./previewFeature.js";
import { previewCatalogPlanUpdate } from "./previewCatalogPlanUpdate.js";
import { setupPreviewCatalogContext } from "./setupPreviewCatalogContext.js";
import {
	validateCatalogVariantUpdates,
	validateCatalogVariantVersionTargets,
} from "../validateCatalogVariantUpdates.js";

const productUsesFeature = ({
	product,
	featureId,
}: {
	product: FullProduct;
	featureId: string;
}) =>
	product.entitlements.some(
		(entitlement) => entitlement.feature.id === featureId,
	) || product.prices.some((price) => price.config?.feature_id === featureId);

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
		const planVersions = planResultById.get(product.id)?.versionable ?? false;

		return !(removesFeature && !planVersions);
	});
};

const previewRemovePlan = ({
	product,
	hasCustomers,
}: {
	product: FullProduct;
	hasCustomers: boolean;
}): CatalogPlanPreview => ({
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
	action: "deleted",
	will_archive: hasCustomers,
});

const previewSkippedPlan = ({
	planId,
}: {
	planId: string;
}): CatalogPlanPreview => ({
	...PlanUpdatePreviewSchema.parse({
		plan_id: planId,
		has_customers: false,
		versionable: false,
		customize: null,
		previous_attributes: null,
		item_changes: [],
		variants: [],
	}),
	action: "skipped",
	will_archive: false,
});

const planPreviewAction = ({
	current,
	preview,
}: {
	current: FullProduct | null;
	preview: PlanUpdatePreview;
}): CatalogPlanPreview["action"] => {
	if (!current) return "created";
	return planUpdatePreviewHasDiff(preview) ? "updated" : "none";
};

const previewMigrationForInPlaceUpdate = async ({
	allVersions = false,
	ctx,
	current,
	includeCustom = false,
	preview,
}: {
	allVersions?: boolean;
	ctx: AutumnContext;
	current: FullProduct | null;
	includeCustom?: boolean;
	preview: PlanUpdatePreview;
}): Promise<CatalogMigrationPreview | undefined> => {
	if (!current || !preview.customize) return undefined;

	const fromPlan = await getPlanResponse({
		ctx,
		product: current,
		features: ctx.features,
	});

	if (allVersions) {
		const latestVariantById = new Map<
			string,
			PlanUpdatePreview["variants"][number]
		>();
		for (const variant of preview.variants) {
			const latest = latestVariantById.get(variant.plan_id);
			if (!latest || variant.version > latest.version) {
				latestVariantById.set(variant.plan_id, variant);
			}
		}
		const targets = [
			...(preview.has_customers ||
			preview.other_versions.some((version) => version.has_customers)
				? [{ id: current.id, customize: preview.customize }]
				: []),
			...[...latestVariantById.values()]
				.filter(
					(variant) =>
						preview.variants.some(
							(row) => row.plan_id === variant.plan_id && row.will_apply,
						) &&
						preview.variants.some(
							(row) => row.plan_id === variant.plan_id && row.has_customers,
						),
				)
				.map((variant) => ({
					id: variant.plan_id,
					customize: variant.customize,
				})),
		];
		const draft = buildAllVersionsUpdateMigrationDraft({
			targets,
			hasBillingChanges: planDiffHasBillingChanges(preview.customize, fromPlan),
			includeCustom,
		});
		if (!draft) return undefined;

		return {
			draft,
			plan_ids: targets.map((target) => target.id),
			include_custom: includeCustom,
			has_billing_changes: !draft.no_billing_changes,
		};
	}

	const targets = [
		...(preview.versionable
			? [{ id: current.id, version: current.version, customize: preview.customize }]
			: []),
		...preview.variants
			.filter((variant) => variant.will_apply && variant.has_customers)
			.map((variant) => ({
				id: variant.plan_id,
				version: variant.version,
				customize: preview.customize,
			})),
	];
	const draft = buildCombinedVariantMigrationDraft({
		targets,
		hasBillingChanges: planDiffHasBillingChanges(preview.customize, fromPlan),
		includeCustom,
	});
	if (!draft) return undefined;

	return {
		draft,
		plan_ids: targets.map((target) => target.id),
		include_custom: includeCustom,
		has_billing_changes: !draft.no_billing_changes,
	};
};

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
	validateCatalogVariantUpdates({ params });

	const { plans, features, skip_deletions } = params;
	const currency = ctx.org.default_currency ?? "usd";
	const skipFeatureIds = new Set(params.skip_feature_ids);
	const skipPlanIds = new Set(params.skip_plan_ids);
	const activePlans = plans.filter(
		(plan) =>
			!skipPlanIds.has(plan.plan_id) &&
			(!plan.new_plan_id || !skipPlanIds.has(plan.new_plan_id)),
	);
	const activeFeatures = features.filter(
		(feature) => !skipFeatureIds.has(feature.feature_id),
	);

	const {
		products,
		currents,
		withCustomers,
		customerCountByInternalId,
		proposedFeatures,
		planCtx,
	} =
		await setupPreviewCatalogContext({
			ctx,
			params: { ...params, plans: activePlans, features: activeFeatures },
		});
	validateCatalogVariantVersionTargets({
		params: { ...params, plans: activePlans },
		products,
	});
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
		: deriveReplacePlanIds({ products, plans }).filter(
				(planId) => !skipPlanIds.has(planId),
			);
	const missingFeatureIds = skip_deletions
		? []
		: deriveReplaceFeatureIds({
				features: ctx.features,
				desiredFeatures: features,
			}).filter((featureId) => !skipFeatureIds.has(featureId));
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
			.filter(
				(_, index) => Number(missingPlanCustomerCounts[index]?.all ?? 0) > 0,
			)
			.map((product) => product.id),
	);

	const [planResults, featureResults] = await Promise.all([
		Promise.all(
			activePlans.map((planParams, index) => {
				const current = currents[index];
				return previewCatalogPlanUpdate({
					ctx: planChangesCtx,
					planParams,
					current,
					hasCustomers: current
						? withCustomers.has(current.internal_id)
						: false,
					customerCount: current
						? (customerCountByInternalId.get(current.internal_id) ?? 0)
						: 0,
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
	const planChanges = await Promise.all(
		planResults.map(async (planResult, index) => {
			const action = planPreviewAction({
				current: currents[index],
				preview: planResult,
			});
			const migration =
				action === "updated"
					? await previewMigrationForInPlaceUpdate({
							allVersions: activePlans[index]?.all_versions,
							ctx: planChangesCtx,
							current: currents[index],
							includeCustom:
								activePlans[index]?.migration?.include_custom ??
								params.migration?.include_custom,
							preview: planResult,
						})
					: undefined;
			return {
				...planResult,
				action,
				will_archive: false,
				...(migration ? { migration } : {}),
			};
		}),
	);
	const skippedPlanResults = [
		...plans
			.filter(
				(plan) =>
					skipPlanIds.has(plan.plan_id) ||
					(Boolean(plan.new_plan_id) && skipPlanIds.has(plan.new_plan_id!)),
			)
			.map((plan) => previewSkippedPlan({ planId: plan.plan_id })),
		...products
			.filter(
				(product) =>
					skipPlanIds.has(product.id) &&
					!plans.some(
						(plan) =>
							plan.plan_id === product.id || plan.new_plan_id === product.id,
					),
			)
			.map((product) => previewSkippedPlan({ planId: product.id })),
	];

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
					plans: activePlans,
					planResults: [...planChanges, ...removePlanResults],
					removePlanIds: new Set(missingPlanIds),
				}),
			}),
		);
		removedFeatureIds.add(featureId);
	}
	const skippedFeatureResults = [
		...features
			.filter((feature) => skipFeatureIds.has(feature.feature_id))
			.map((feature) =>
				previewSkippedFeature({
					ctx: featureChangesCtx,
					featureId: feature.feature_id,
					existing:
						ctx.features.find(
							(candidate) => candidate.id === feature.feature_id,
						) ?? null,
				}),
			),
		...ctx.features
			.filter(
				(feature) =>
					skipFeatureIds.has(feature.id) &&
					!features.some((incoming) => incoming.feature_id === feature.id),
			)
			.map((feature) =>
				previewSkippedFeature({
					ctx: featureChangesCtx,
					featureId: feature.id,
					existing: feature,
				}),
			),
	];

	return {
		plan_changes: [...planChanges, ...removePlanResults, ...skippedPlanResults],
		feature_changes: [
			...featureResults,
			...removeFeatureResults,
			...skippedFeatureResults,
		],
	};
};
