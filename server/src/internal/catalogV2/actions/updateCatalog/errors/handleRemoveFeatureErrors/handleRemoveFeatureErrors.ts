import {
	ErrCode,
	FeatureNotFoundError,
	RecaseError,
} from "@autumn/shared";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** Throws when a removal is unknown, or contradicted by the same request. */
export const handleRemoveFeatureErrors = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	const upsertedFeatureIds = new Set([
		...updateCatalogPlan.insertFeatures.map((feature) => feature.id),
		...updateCatalogPlan.updateFeatures.flatMap((updateFeaturePlan) => [
			updateFeaturePlan.current.id,
			updateFeaturePlan.next.id,
		]),
	]);

	for (const removeFeaturePlan of updateCatalogPlan.removeFeatures) {
		if (!removeFeaturePlan.current) {
			throw new FeatureNotFoundError({
				featureId: removeFeaturePlan.featureId,
			});
		}
		if (upsertedFeatureIds.has(removeFeaturePlan.featureId)) {
			throw new RecaseError({
				message: `Cannot update and remove feature ${removeFeaturePlan.featureId} in the same call`,
				code: ErrCode.InvalidFeature,
				statusCode: 400,
			});
		}
	}
};
