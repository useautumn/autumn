import type { DbSpendLimit } from "../../models/cusModels/billingControls/customerBillingControls.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import { cusEntToCusPrice } from "../cusEntUtils/index.js";
import { isPayPerUsePrice } from "../productUtils/priceUtils/index.js";
import { fullSubjectToCustomerEntitlements } from "./fullSubjectToCustomerEntitlements.js";

/** Extract enabled spend limits for the requested features from a FullSubject. */
export const fullSubjectToSpendLimitByFeatureId = ({
	fullSubject,
	featureIds,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
}): Record<string, DbSpendLimit> => {
	const scopedSpendLimits =
		fullSubject.entity?.spend_limits ?? fullSubject.customer.spend_limits;
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

export const fullSubjectToUsageBasedCusEntsByFeatureId = ({
	fullSubject,
	featureIds,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
}): Record<string, string[]> => {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds,
	});
	const usageBasedCusEntsByFeatureId: Record<string, string[]> = {};

	for (const customerEntitlement of customerEntitlements) {
		const customerPrice = cusEntToCusPrice({
			cusEnt: customerEntitlement,
		});

		if (!customerPrice || !isPayPerUsePrice({ price: customerPrice.price })) {
			continue;
		}

		if (!usageBasedCusEntsByFeatureId[customerEntitlement.feature_id]) {
			usageBasedCusEntsByFeatureId[customerEntitlement.feature_id] = [];
		}

		usageBasedCusEntsByFeatureId[customerEntitlement.feature_id].push(
			customerEntitlement.id,
		);
	}

	return usageBasedCusEntsByFeatureId;
};
