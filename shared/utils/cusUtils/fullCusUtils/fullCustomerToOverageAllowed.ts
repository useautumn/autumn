import type { DbOverageAllowed } from "@models/cusModels/billingControls/customerBillingControls.js";
import type { FullCustomer } from "@models/cusModels/fullCusModel.js";
import {
	fullCustomerToPlanProducts,
	resolveBillingControl,
} from "../../fullSubjectUtils/planBillingControlUtils.js";

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
	const entityOverageAllowed = entity?.overage_allowed ?? [];
	const customerOverageAllowed = fullCustomer.overage_allowed ?? [];
	const overageAllowedByFeatureId: Record<string, DbOverageAllowed> = {};
	const uniqueFeatureIds = [...new Set(featureIds)];

	for (const featureId of uniqueFeatureIds) {
		const overageAllowed = resolveBillingControl({
			controlLists: [entityOverageAllowed, customerOverageAllowed],
			customerProducts: fullCustomerToPlanProducts({ fullCustomer }),
			controlKey: "overage_allowed",
			matches: (candidate) => candidate.feature_id === featureId,
		});

		if (overageAllowed) {
			overageAllowedByFeatureId[featureId] = overageAllowed;
		}
	}

	return overageAllowedByFeatureId;
};
