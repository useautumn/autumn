import type { DbSpendLimit } from "../../models/cusModels/billingControls/customerBillingControls.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import { resolveSpendLimitOverageLimit } from "../cusEntUtils/index.js";
import { fullSubjectToCustomerEntitlements } from "./fullSubjectToCustomerEntitlements.js";

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
			candidate.feature_id === featureId &&
			candidate.enabled &&
			candidate.overage_limit !== undefined;

		const spendLimit =
			entitySpendLimits.find(isMatch) ?? customerSpendLimits.find(isMatch);

		if (spendLimit) {
			const cusEnts = fullSubjectToCustomerEntitlements({
				fullSubject,
				featureIds: [featureId],
			});
			const entityId = fullSubject.entity?.id ?? undefined;
			const resolved = resolveSpendLimitOverageLimit({
				spendLimit,
				cusEnts,
				entityId,
			});

			// Resolve to absolute so Lua deduction reads overage_limit as absolute units.
			if (resolved !== undefined) {
				spendLimitByFeatureId[featureId] = {
					...spendLimit,
					overage_limit: resolved,
					limit_type: "absolute",
				};
			}
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
	// Every ent for the feature counts toward the overage limit: control-based
	// (overage_allowed) overage has no price, so it isn't pay-per-use.
	const overageCusEntsByFeatureId: Record<string, string[]> = {};

	for (const customerEntitlement of customerEntitlements) {
		if (!overageCusEntsByFeatureId[customerEntitlement.feature_id]) {
			overageCusEntsByFeatureId[customerEntitlement.feature_id] = [];
		}
		overageCusEntsByFeatureId[customerEntitlement.feature_id].push(
			customerEntitlement.id,
		);
	}

	return overageCusEntsByFeatureId;
};
