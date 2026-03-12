import type { DbSpendLimit } from "@models/cusModels/billingControls/customerBillingControls.js";
import type { FullCustomer } from "@models/cusModels/fullCusModel.js";

/** Extract the enabled spend limit for a given feature from a FullCustomer. */
export const fullCustomerToSpendLimit = ({
	fullCustomer,
	featureId,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	featureId: string;
	internalEntityId?: string;
}): DbSpendLimit | undefined => {
	const entity = internalEntityId
		? fullCustomer.entities?.find(
				(candidate) => candidate.internal_id === internalEntityId,
			)
		: fullCustomer.entity;

	if (internalEntityId) {
		return entity?.spend_limits?.find(
			(spendLimit) =>
				spendLimit.feature_id === featureId &&
				spendLimit.enabled &&
				spendLimit.overage_limit !== undefined,
		);
	}

	if (entity) {
		return entity.spend_limits?.find(
			(spendLimit) =>
				spendLimit.feature_id === featureId &&
				spendLimit.enabled &&
				spendLimit.overage_limit !== undefined,
		);
	}

	return fullCustomer.spend_limits?.find(
		(spendLimit) =>
			spendLimit.feature_id === featureId &&
			spendLimit.enabled &&
			spendLimit.overage_limit !== undefined,
	);
};
