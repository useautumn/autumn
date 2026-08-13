import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	CatalogComputeStep,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { RemoveFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";

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
	const removeFeatures: RemoveFeaturePlan[] = params.remove_features.map(
		(entry) => {
			const current =
				ctx.features.find((feature) => feature.id === entry.feature_id) ??
				null;
			const state = catalogContext.featureStatesContext[entry.feature_id];

			return {
				featureId: entry.feature_id,
				current,
				willArchive: false,
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
