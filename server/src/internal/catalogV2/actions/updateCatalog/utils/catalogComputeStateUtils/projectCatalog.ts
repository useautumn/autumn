import type { Feature } from "@autumn/shared";
import type {
	CatalogPlanDraft,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";

/**
 * Pure projection: what the feature catalog looks like after `plan` applies.
 * Always derived from `originalFeatures` + the full draft (billing's applyPlan analogue).
 */
export const projectCatalog = ({
	originalFeatures,
	plan,
}: {
	originalFeatures: Feature[];
	plan: CatalogPlanDraft;
}): ProjectedCatalog => {
	const nextByInternalId = new Map(
		plan.updateFeatures.flatMap((updateFeaturePlan) =>
			updateFeaturePlan.current.internal_id
				? [
						[
							updateFeaturePlan.current.internal_id,
							updateFeaturePlan.next,
						] as const,
					]
				: [],
		),
	);
	const removedInternalIds = new Set(
		plan.removeFeatures.flatMap((removeFeaturePlan) =>
			removeFeaturePlan.current?.internal_id
				? [removeFeaturePlan.current.internal_id]
				: [],
		),
	);

	return {
		features: [
			...originalFeatures
				.filter(
					(feature) =>
						!feature.internal_id ||
						!removedInternalIds.has(feature.internal_id),
				)
				.map(
					(feature) =>
						(feature.internal_id && nextByInternalId.get(feature.internal_id)) ||
						feature,
				),
			...plan.insertFeatures,
		],
	};
};
