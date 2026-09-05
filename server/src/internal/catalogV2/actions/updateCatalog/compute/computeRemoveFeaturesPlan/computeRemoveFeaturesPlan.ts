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

/** Plan ids whose CURRENT (pre-push) items still name this feature. Computed
 * from the original catalog, not `projected` — feature removal runs before
 * plan upserts fold in, so `projected.products` cannot see this push's own
 * item edits yet. */
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

/** True when this same push also names the plan — trusted to have reconciled
 * its own items, so a stale entitlement there is cleanup, not a forgotten ref. */
const planIsPartOfThisPush = ({
	planId,
	params,
}: {
	planId: string;
	params: UpdateCatalogParams;
}): boolean => (params.plans ?? []).some((plan) => plan.plan_id === planId);

/**
 * Remove intents with willArchive stamped against the post-upsert projection
 * minus features this batch removes (so co-removing a CS frees its members).
 */
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
	// Explicit removals, plus — under full state — the features the config
	// never mentioned, which is how omission asks for a deletion.
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
			// Under full state every plan is in the push, stated or removed, so a
			// plan item is never a forgotten reference there; only a partial push
			// can leave a plan outside itself.
			const fullState = params.skip_deletions === false;
			const hasUnclearedPlanItem =
				!fullState &&
				referencingPlanIds.some(
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
