import type { SpendLimitResponse } from "../../models/cusModels/billingControls/spendLimit.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { fullSubjectToUsageWindowLimits } from "./fullSubjectToUsageWindowLimits.js";

const fullSubjectToAllCustomerEntitlements = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): FullCustomerEntitlement[] => [
	...fullSubject.customer_products.flatMap(
		(customerProduct) => customerProduct.customer_entitlements,
	),
	...(fullSubject.extra_customer_entitlements ?? []),
];

/**
 * Response decorator for customer spend limits. `usage_limit_used` is runtime
 * state read from the current usage-window counter, not stored billing config.
 */
export const fullSubjectToApiSpendLimits = ({
	fullSubject,
	features,
	now = Date.now(),
	inStatuses,
}: {
	fullSubject: FullSubject;
	features: Feature[];
	now?: number;
	inStatuses?: CusProductStatus[];
}): SpendLimitResponse[] | undefined => {
	const spendLimits = fullSubject.customer.spend_limits;
	if (spendLimits == null) return undefined;

	const usageLimitFeatureIds = spendLimits
		.filter(
			(spendLimit) =>
				spendLimit.feature_id != null && spendLimit.usage_limit != null,
		)
		.map((spendLimit) => spendLimit.feature_id!);

	const usageWindowLimits =
		usageLimitFeatureIds.length > 0
			? fullSubjectToUsageWindowLimits({
					fullSubject,
					featureIds: usageLimitFeatureIds,
					features,
					now,
					inStatuses,
				})
			: [];

	const allCustomerEntitlements = fullSubjectToAllCustomerEntitlements({
		fullSubject,
	});
	const usageLimitUsedByFeatureId = new Map<string, number>();

	for (const limit of usageWindowLimits) {
		if (limit.anchor_customer_entitlement_id == null) continue;

		const anchorCustomerEntitlement = allCustomerEntitlements.find(
			(customerEntitlement) =>
				customerEntitlement.id === limit.anchor_customer_entitlement_id,
		);
		const usageWindow = anchorCustomerEntitlement?.usage_windows?.find(
			(window) =>
				window.feature_id === limit.feature_id &&
				Number(window.window_start_at) === limit.window_start_at,
		);
		const usage = Number(usageWindow?.usage ?? 0);

		usageLimitUsedByFeatureId.set(
			limit.feature_id,
			Number.isFinite(usage) ? Math.max(0, usage) : 0,
		);
	}

	return spendLimits.map((spendLimit) => {
		if (spendLimit.usage_limit == null) return spendLimit;

		return {
			...spendLimit,
			usage_limit_used:
				spendLimit.feature_id == null
					? 0
					: (usageLimitUsedByFeatureId.get(spendLimit.feature_id) ?? 0),
		};
	});
};
