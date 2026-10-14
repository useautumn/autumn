import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	CatalogComputeStep,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type {
	ProductStatesContext,
	UpdateCatalogContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RemoveFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { resolveAbsenteeFeatureIds } from "./resolveAbsenteeFeatureIds";

const planIdsCurrentlyReferencingFeature = ({
	internalFeatureId,
	productStatesContext,
}: {
	internalFeatureId: string;
	productStatesContext: ProductStatesContext;
}): string[] =>
	Object.entries(productStatesContext.versionsByPlanId).flatMap(
		([planId, products]) =>
			products.some((product) =>
				product.entitlements.some(
					(entitlement) =>
						entitlement.internal_feature_id === internalFeatureId,
				),
			)
				? [planId]
				: [],
	);

const statedItemNamesFeature = ({
	featureId,
	params,
}: {
	featureId: string;
	params: UpdateCatalogParams;
}): boolean =>
	(params.plans ?? []).some((plan) =>
		(plan.items ?? []).some((item) => item.feature_id === featureId),
	);

const planIsPartOfThisPush = ({
	planId,
	params,
}: {
	planId: string;
	params: UpdateCatalogParams;
}): boolean => (params.plans ?? []).some((plan) => plan.plan_id === planId);

export const computeRemoveFeaturesPlan = ({
	ctx,
	catalogContext,
	params,
	projected,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	params: UpdateCatalogParams;
	projected: ProjectedCatalog;
}): CatalogComputeStep => {
	const absenteeFeatureIds = resolveAbsenteeFeatureIds({ ctx, params });
	const removeFeatureIds = [
		...params.remove_features.map((entry) => entry.feature_id),
		...absenteeFeatureIds,
	];
	const absentees = new Set(absenteeFeatureIds);

	const removeFeatures: RemoveFeaturePlan[] = removeFeatureIds.map(
		(featureId) => {
			const current =
				ctx.features.find((feature) => feature.id === featureId) ?? null;
			const state = catalogContext.featureStatesContext[featureId];

			return {
				featureId,
				current,
				willArchive: false,
				byOmission: absentees.has(featureId),
				hasCustomerEntitlements: state?.has_customers ?? false,
				hasSurvivingCatalogReference: false,
			};
		},
	);

	const removedIds = new Set(
		removeFeatures.map((removeFeaturePlan) => removeFeaturePlan.featureId),
	);
	const survivingFeatures = projected.features.filter(
		(feature) => !removedIds.has(feature.id),
	);

	return {
		removeFeatures: removeFeatures.map((removeFeaturePlan) => {
			if (!removeFeaturePlan.current) {
				return removeFeaturePlan;
			}

			const state =
				catalogContext.featureStatesContext[removeFeaturePlan.featureId];
			const referencingPlanIds = planIdsCurrentlyReferencingFeature({
				internalFeatureId: removeFeaturePlan.current.internal_id,
				productStatesContext: catalogContext.productStatesContext,
			});
			const fullState = params.skip_deletions === false;
			const skippedPlanIds = new Set(params.skip_plan_ids ?? []);
			const hasUnclearedPlanItem = fullState
				? statedItemNamesFeature({
						featureId: removeFeaturePlan.featureId,
						params,
					}) || referencingPlanIds.some((planId) => skippedPlanIds.has(planId))
				: referencingPlanIds.some(
						(planId) => !planIsPartOfThisPush({ planId, params }),
					);
			const hasSurvivingCreditSystem =
				getCreditSystemsFromFeature({
					featureId: removeFeaturePlan.featureId,
					features: survivingFeatures,
				}).length > 0;
			const hasSurvivingCatalogReference =
				hasUnclearedPlanItem || hasSurvivingCreditSystem;
			const hasAnyCatalogReference = Boolean(
				referencingPlanIds.length > 0 ||
					state?.has_entitlements ||
					state?.has_loose_entitlements ||
					state?.has_entity_feature_entitlements ||
					state?.has_loose_entity_feature_entitlements ||
					state?.has_prices,
			);

			return {
				...removeFeaturePlan,
				willArchive:
					removeFeaturePlan.hasCustomerEntitlements ||
					hasSurvivingCatalogReference ||
					hasAnyCatalogReference,
				hasSurvivingCatalogReference,
			};
		}),
	};
};
