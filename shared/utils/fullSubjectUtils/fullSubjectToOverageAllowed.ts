import type { DbOverageAllowed } from "../../models/cusModels/billingControls/customerBillingControls.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";

/** Extract overage_allowed entries for the requested features from a FullSubject. */
export const fullSubjectToOverageAllowedByFeatureId = ({
	fullSubject,
	featureIds,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
}): Record<string, DbOverageAllowed> => {
	const scopedOverageAllowed =
		fullSubject.entity?.overage_allowed ?? fullSubject.customer.overage_allowed;
	const overageAllowedByFeatureId: Record<string, DbOverageAllowed> = {};
	const uniqueFeatureIds = [...new Set(featureIds)];

	for (const featureId of uniqueFeatureIds) {
		const overageAllowed = scopedOverageAllowed?.find(
			(candidate) => candidate.feature_id === featureId,
		);

		if (overageAllowed) {
			overageAllowedByFeatureId[featureId] = overageAllowed;
		}
	}

	return overageAllowedByFeatureId;
};
