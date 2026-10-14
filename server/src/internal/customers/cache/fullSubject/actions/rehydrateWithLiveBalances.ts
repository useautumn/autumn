import type { NormalizedFullSubject } from "@autumn/shared";
import { type FullSubject, normalizedToFullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyLiveAggregatedBalances } from "../balances/applyLiveAggregatedBalances.js";
import { applyLiveUsageWindows } from "../balances/applyLiveUsageWindows.js";
import { getCachedFeatureBalancesBatch } from "../balances/getCachedFeatureBalances.js";
import { normalizedToUsageWindowFeatureIds } from "../fullSubjectCacheModel.js";

export const rehydrateWithLiveBalances = async ({
	ctx,
	normalized,
}: {
	ctx: AutumnContext;
	normalized: NormalizedFullSubject;
}): Promise<FullSubject | undefined> => {
	const { customerId, entityId } = normalized;

	const customerEntitlementIdsByFeatureId: Record<string, string[]> = {};
	for (const ce of normalized.customer_entitlements) {
		const list = customerEntitlementIdsByFeatureId[ce.feature_id] ?? [];
		list.push(ce.id);
		customerEntitlementIdsByFeatureId[ce.feature_id] = list;
	}
	const usageWindowFeatureIds = new Set(
		normalizedToUsageWindowFeatureIds({ normalized }),
	);
	const featureIds = [
		...new Set([
			...Object.keys(customerEntitlementIdsByFeatureId),
			...usageWindowFeatureIds,
		]),
	];

	const isCustomerSubject = !entityId;
	const outcome = await getCachedFeatureBalancesBatch({
		ctx,
		customerId,
		featureIds,
		customerEntitlementIdsByFeatureId,
		includeAggregated: isCustomerSubject,
		usageWindowFeatureIds,
	});

	if (outcome.kind !== "ok") return undefined;

	normalized.customer_entitlements = outcome.value.flatMap((b) => b.balances);

	if (isCustomerSubject) {
		applyLiveAggregatedBalances({
			normalized,
			featureBalances: outcome.value,
		});
	}

	applyLiveUsageWindows({
		normalized,
		featureBalances: outcome.value,
	});

	return normalizedToFullSubject({ normalized });
};
