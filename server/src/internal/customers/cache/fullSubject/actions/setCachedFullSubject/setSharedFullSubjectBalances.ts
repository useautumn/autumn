import type {
	AggregatedFeatureBalance,
	NormalizedFullSubject,
} from "@autumn/shared";
import { featureBalancesToHashFields } from "../../balances/featureBalancesToHashFields.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import { AGGREGATED_BALANCE_FIELD } from "../../config/fullSubjectCacheConfig.js";

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
}: {
	orgId: string;
	env: string;
	customerId: string;
	customerEntitlements: NormalizedFullSubject["customer_entitlements"];
	aggregatedCustomerEntitlements: AggregatedFeatureBalance[];
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

	const allFeatureIds = new Set([
		...balancesByFeatureId.keys(),
		...aggregatedByFeatureId.keys(),
	]);

	return Array.from(allFeatureIds).map((featureId) => {
		const balances = balancesByFeatureId.get(featureId) ?? [];
		const fields = featureBalancesToHashFields({ balances });

		const aggregated = aggregatedByFeatureId.get(featureId);
		if (aggregated) {
			fields[AGGREGATED_BALANCE_FIELD] = JSON.stringify(aggregated);
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
