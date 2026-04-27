import type { DbOverageAllowed } from "../../models/cusModels/billingControls/customerBillingControls.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";

/**
 * Extract overage_allowed entries for the requested features from a FullSubject.
 *
 * Entity inherits from the customer per feature_id: entity's entry wins when
 * present, customer's entry fills any gaps.
 */
export const fullSubjectToOverageAllowedByFeatureId = ({
	fullSubject,
	featureIds,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
}): Record<string, DbOverageAllowed> => {
	const entityOverageAllowed = fullSubject.entity?.overage_allowed ?? [];
	const customerOverageAllowed = fullSubject.customer.overage_allowed ?? [];
	const overageAllowedByFeatureId: Record<string, DbOverageAllowed> = {};
	const uniqueFeatureIds = [...new Set(featureIds)];

	for (const featureId of uniqueFeatureIds) {
		const overageAllowed =
			entityOverageAllowed.find(
				(candidate) => candidate.feature_id === featureId,
			) ??
			customerOverageAllowed.find(
				(candidate) => candidate.feature_id === featureId,
			);

		if (overageAllowed) {
			overageAllowedByFeatureId[featureId] = overageAllowed;
		}
	}

	return overageAllowedByFeatureId;
};
