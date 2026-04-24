import type { ApiCustomerV5 } from "../../api/customers/apiCustomerV5.js";
import type { ApiEntityV2 } from "../../api/entities/apiEntityV2.js";

/**
 * Build a new entity apiSubject whose billing_controls inherit the customer's
 * spend_limits and overage_allowed entries per feature_id. Entity's own entry
 * always wins per feature; customer's entries fill any gaps.
 *
 * Used at check time so `apiSubjectToSpendLimit` / `apiSubjectToOverageAllowedControl`
 * (which read from `subject.billing_controls`) see the inherited controls
 * without needing to know about the customer separately.
 *
 * Pure — does not mutate inputs.
 */
export const mergeCustomerBillingControlsForCheck = ({
	entityApiSubject,
	customerApiSubject,
}: {
	entityApiSubject: ApiEntityV2;
	customerApiSubject: ApiCustomerV5;
}): ApiEntityV2 => {
	const entitySpendLimits = entityApiSubject.billing_controls?.spend_limits ?? [];
	const entityOverageAllowed =
		entityApiSubject.billing_controls?.overage_allowed ?? [];
	const customerSpendLimits =
		customerApiSubject.billing_controls?.spend_limits ?? [];
	const customerOverageAllowed =
		customerApiSubject.billing_controls?.overage_allowed ?? [];

	const entitySpendLimitFeatureIds = new Set(
		entitySpendLimits
			.map((entry) => entry.feature_id)
			.filter((id): id is string => !!id),
	);
	const entityOverageAllowedFeatureIds = new Set(
		entityOverageAllowed.map((entry) => entry.feature_id),
	);

	const inheritedSpendLimits = customerSpendLimits.filter(
		(entry) =>
			!!entry.feature_id && !entitySpendLimitFeatureIds.has(entry.feature_id),
	);
	const inheritedOverageAllowed = customerOverageAllowed.filter(
		(entry) => !entityOverageAllowedFeatureIds.has(entry.feature_id),
	);

	if (
		inheritedSpendLimits.length === 0 &&
		inheritedOverageAllowed.length === 0
	) {
		return entityApiSubject;
	}

	return {
		...entityApiSubject,
		billing_controls: {
			...entityApiSubject.billing_controls,
			spend_limits: [...entitySpendLimits, ...inheritedSpendLimits],
			overage_allowed: [...entityOverageAllowed, ...inheritedOverageAllowed],
		},
	};
};
