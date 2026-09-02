import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	CatalogComputeStep,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RemoveFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { resolveAbsenteeFeatureIds } from "./resolveAbsenteeFeatureIds";

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
			const hasSurvivingReferences = Boolean(
				state?.has_customers ||
					state?.has_entitlements ||
					state?.has_loose_entitlements ||
					state?.has_entity_feature_entitlements ||
					state?.has_loose_entity_feature_entitlements ||
					state?.has_prices ||
					getCreditSystemsFromFeature({
						featureId: removeFeaturePlan.featureId,
						features: survivingFeatures,
					}).length,
			);

			return { ...removeFeaturePlan, willArchive: hasSurvivingReferences };
		}),
	};
};
