import type { DbOverageAllowed } from "@models/cusModels/billingControls/customerBillingControls.js";
import type { FullCustomer } from "@models/cusModels/fullCusModel.js";

/** Extract enabled overage_allowed entries for the requested features from a FullCustomer. */
export const fullCustomerToOverageAllowedByFeatureId = ({
	fullCustomer,
	featureIds,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	featureIds: string[];
	internalEntityId?: string;
}): Record<string, DbOverageAllowed> => {
	const entity = internalEntityId
		? fullCustomer.entities?.find(
				(candidate) => candidate.internal_id === internalEntityId,
			)
		: fullCustomer.entity;
	const scopedOverageAllowed = internalEntityId
		? entity?.overage_allowed
		: (entity?.overage_allowed ?? fullCustomer.overage_allowed);
	const overageAllowedByFeatureId: Record<string, DbOverageAllowed> = {};
	const uniqueFeatureIds = [...new Set(featureIds)];

	for (const featureId of uniqueFeatureIds) {
		const overageAllowed = scopedOverageAllowed?.find(
			(candidate) => candidate.feature_id === featureId && candidate.enabled,
		);

		if (overageAllowed) {
			overageAllowedByFeatureId[featureId] = overageAllowed;
		}
	}

	return overageAllowedByFeatureId;
};
