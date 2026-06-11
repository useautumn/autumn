import type {
	AggregatedFeatureBalance,
	NormalizedFullSubject,
	UsageWindow,
} from "@autumn/shared";
import { featureBalancesToHashFields } from "../../balances/featureBalancesToHashFields.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import {
	AGGREGATED_BALANCE_FIELD,
	USAGE_WINDOWS_FIELD,
} from "../../config/fullSubjectCacheConfig.js";

export type SharedBalanceWrite = {
	balanceKey: string;
	fields: Record<string, string>;
};

export const buildSharedBalanceWrites = ({
	orgId,
	env,
	customerId,
	customerEntitlements,
	aggregatedCustomerEntitlements,
	usageWindows = [],
	usageWindowFeatureIds = [],
}: {
	orgId: string;
	env: string;
	customerId: string;
	customerEntitlements: NormalizedFullSubject["customer_entitlements"];
	aggregatedCustomerEntitlements: AggregatedFeatureBalance[];
	usageWindows?: UsageWindow[];
	usageWindowFeatureIds?: string[];
}): SharedBalanceWrite[] => {
	const balancesByFeatureId = new Map<string, typeof customerEntitlements>();

	for (const customerEntitlement of customerEntitlements) {
		const existingBalances =
			balancesByFeatureId.get(customerEntitlement.feature_id) ?? [];
		existingBalances.push(customerEntitlement);
		balancesByFeatureId.set(customerEntitlement.feature_id, existingBalances);
	}

	const aggregatedByFeatureId = new Map<string, AggregatedFeatureBalance>();
	for (const aggregated of aggregatedCustomerEntitlements) {
		aggregatedByFeatureId.set(aggregated.feature_id, aggregated);
	}

	// Capped features get a `_usage_windows` field even with no rows and no
	// entitlements: a present-but-empty field means "fresh counter", a missing
	// field means "stale cache" and the deduction script fails closed on it.
	const usageWindowsByFeatureId = new Map<string, UsageWindow[]>();
	for (const featureId of usageWindowFeatureIds) {
		usageWindowsByFeatureId.set(featureId, []);
	}
	for (const usageWindow of usageWindows) {
		const existingWindows = usageWindowsByFeatureId.get(usageWindow.feature_id);
		// Rows for features whose cap is no longer armed are not re-cached.
		if (!existingWindows) continue;
		existingWindows.push(usageWindow);
	}

	const allFeatureIds = new Set([
		...balancesByFeatureId.keys(),
		...aggregatedByFeatureId.keys(),
		...usageWindowsByFeatureId.keys(),
	]);

	return Array.from(allFeatureIds).map((featureId) => {
		const balances = balancesByFeatureId.get(featureId) ?? [];
		const fields = featureBalancesToHashFields({ balances });

		const aggregated = aggregatedByFeatureId.get(featureId);
		if (aggregated) {
			fields[AGGREGATED_BALANCE_FIELD] = JSON.stringify(aggregated);
		}

		const featureUsageWindows = usageWindowsByFeatureId.get(featureId);
		if (featureUsageWindows) {
			fields[USAGE_WINDOWS_FIELD] = JSON.stringify(featureUsageWindows);
		}

		return {
			balanceKey: buildSharedFullSubjectBalanceKey({
				orgId,
				env,
				customerId,
				featureId,
			}),
			fields,
		};
	});
};
