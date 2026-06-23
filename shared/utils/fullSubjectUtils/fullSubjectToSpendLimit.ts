import type { DbSpendLimit } from "../../models/cusModels/billingControls/customerBillingControls.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import { cusEntToCusPrice } from "../cusEntUtils/index.js";
import { isPayPerUsePrice } from "../productUtils/priceUtils/index.js";
import { fullSubjectToCustomerEntitlements } from "./fullSubjectToCustomerEntitlements.js";
import {
	fullSubjectToPlanProducts,
	resolveBillingControl,
} from "./planBillingControlUtils.js";

/**
 * Extract enabled spend limits for the requested features from a FullSubject.
 *
 * Entity inherits from the customer per feature_id: entity's entry wins when
 * present, customer's entry fills any gaps.
 */
export const fullSubjectToSpendLimitByFeatureId = ({
	fullSubject,
	featureIds,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
}): Record<string, DbSpendLimit> => {
	const entitySpendLimits = fullSubject.entity?.spend_limits ?? [];
	const customerSpendLimits = fullSubject.customer.spend_limits ?? [];
	const spendLimitByFeatureId: Record<string, DbSpendLimit> = {};
	const uniqueFeatureIds = [...new Set(featureIds)];

	for (const featureId of uniqueFeatureIds) {
		const isMatch = (candidate: DbSpendLimit) =>
			candidate.feature_id === featureId && candidate.overage_limit !== undefined;

		const spendLimit = resolveBillingControl<DbSpendLimit, "spend_limits">({
			controlLists: [entitySpendLimits, customerSpendLimits],
			customerProducts: fullSubjectToPlanProducts({ fullSubject }),
			controlKey: "spend_limits",
			matches: isMatch,
		});

		if (spendLimit?.enabled) {
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
