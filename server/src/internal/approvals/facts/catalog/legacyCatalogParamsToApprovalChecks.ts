import type { CatalogApprovalCheck } from "./catalogApprovalCheck";
import {
	type PlanUpdateIds,
	planUpdateToEditedPlanIds,
} from "./planUpdateToEditedPlanIds";

/** A legacy catalog update: a stated id that exists is updated, otherwise created; replaced ones are deleted. */
export const legacyCatalogParamsToApprovalChecks = ({
	params,
	existingPlanIds,
	existingFeatureIds,
	removedPlanIds,
	removedFeatureIds,
}: {
	params: { plans?: PlanUpdateIds[]; features?: { feature_id: string }[] };
	existingPlanIds: string[];
	existingFeatureIds: string[];
	removedPlanIds: string[];
	removedFeatureIds: string[];
}): CatalogApprovalCheck[] => [
	...(params.plans ?? []).flatMap((plan): CatalogApprovalCheck[] => {
		const [planId, ...propagatedIds] = planUpdateToEditedPlanIds({
			params: plan,
		});
		return [
			{
				action: existingPlanIds.includes(planId)
					? "plans.update"
					: "plans.create",
				planId,
			},
			...propagatedIds.map(
				(id): CatalogApprovalCheck => ({ action: "plans.update", planId: id }),
			),
		];
	}),
	...removedPlanIds.map(
		(planId): CatalogApprovalCheck => ({ action: "plans.delete", planId }),
	),
	...(params.features ?? []).map(
		({ feature_id }): CatalogApprovalCheck => ({
			action: existingFeatureIds.includes(feature_id)
				? "features.update"
				: "features.create",
			featureId: feature_id,
		}),
	),
	...removedFeatureIds.map(
		(featureId): CatalogApprovalCheck => ({
			action: "features.delete",
			featureId,
		}),
	),
];
