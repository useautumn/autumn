import type { DbSpendLimit } from "@models/cusModels/billingControls/customerBillingControls.js";
import type { FullCustomer } from "@models/cusModels/fullCusModel.js";
import { cusEntToCusPrice } from "@utils/cusEntUtils";
import { isPayPerUsePrice } from "@utils/productUtils/priceUtils/index";
import { fullCustomerToCustomerEntitlements } from "./fullCustomerToCustomerEntitlements";

/** Extract enabled spend limits for the requested features from a FullCustomer. */
export const fullCustomerToSpendLimitByFeatureId = ({
	fullCustomer,
	featureIds,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	featureIds: string[];
	internalEntityId?: string;
}): Record<string, DbSpendLimit> => {
	const entity = internalEntityId
		? fullCustomer.entities?.find(
				(candidate) => candidate.internal_id === internalEntityId,
			)
		: fullCustomer.entity;
	const scopedSpendLimits = internalEntityId
		? entity?.spend_limits
		: (entity?.spend_limits ?? fullCustomer.spend_limits);
	const spendLimitByFeatureId: Record<string, DbSpendLimit> = {};
	const uniqueFeatureIds = [...new Set(featureIds)];

	for (const featureId of uniqueFeatureIds) {
		const spendLimit = scopedSpendLimits?.find(
			(candidate) =>
				candidate.feature_id === featureId &&
				candidate.enabled &&
				candidate.overage_limit !== undefined,
		);

		if (spendLimit) {
			spendLimitByFeatureId[featureId] = spendLimit;
		}
	}

	return spendLimitByFeatureId;
};

export const fullCustomerToUsageBasedCusEntsByFeatureId = ({
	fullCustomer,
	featureIds,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	featureIds: string[];
	internalEntityId?: string;
}): Record<string, string[]> => {
	const entity = internalEntityId
		? fullCustomer.entities?.find(
				(candidate) => candidate.internal_id === internalEntityId,
			)
		: fullCustomer.entity;

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureIds,
		entity,
	});
	const usageBasedCusEntsByFeatureId: Record<string, string[]> = {};

	for (const cusEnt of cusEnts) {
		const cusPrice = cusEntToCusPrice({ cusEnt });

		if (!cusPrice || !isPayPerUsePrice({ price: cusPrice.price })) {
			continue;
		}

		if (!usageBasedCusEntsByFeatureId[cusEnt.feature_id]) {
			usageBasedCusEntsByFeatureId[cusEnt.feature_id] = [];
		}

		usageBasedCusEntsByFeatureId[cusEnt.feature_id].push(cusEnt.id);
	}

	return usageBasedCusEntsByFeatureId;
};
