import type { DbSpendLimit, FullCustomer } from "@autumn/shared";

/** Extract the enabled spend limit for a given feature from a FullCustomer. Returns undefined if none found. */
export const fullCustomerToSpendLimit = ({
	fullCustomer,
	featureId,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	featureId: string;
	internalEntityId?: string;
}): DbSpendLimit | undefined => {
	if (internalEntityId) {
		fullCustomer.entity = fullCustomer.entities.find(
			(entity) => entity.id === internalEntityId,
		);
	}

	if (fullCustomer.entity) {
		return fullCustomer.entity.spend_limits?.find(
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
