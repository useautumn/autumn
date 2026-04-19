import {
	type AnchorResetRefund,
	type BillingBehavior,
	EntInterval,
	type FullCusProduct,
	featureUtils,
	isBooleanCusEnt,
	isUnlimitedCusEnt,
} from "@autumn/shared";

const INTERVAL_RANK: Record<string, number> = {
	[EntInterval.Minute]: 0,
	[EntInterval.Hour]: 1,
	[EntInterval.Day]: 2,
	[EntInterval.Week]: 3,
	[EntInterval.Month]: 4,
	[EntInterval.Quarter]: 5,
	[EntInterval.SemiAnnual]: 6,
	[EntInterval.Year]: 7,
	[EntInterval.Lifetime]: 8,
};

/**
 * Determines anchor-reset refund config when `billing_cycle_anchor: "now"` + `proration_behavior: "none"`.
 *
 * - Without carry_over_balances: strip all refund line items (no credit for outgoing plan).
 * - With carry_over_balances: refund full entitlement-reset periods only.
 *   The rounding granularity is the longest entitlement reset interval
 *   among the carried-over features.
 */
export const setupAnchorResetRefund = ({
	billingCycleAnchor,
	prorationBehavior,
	outgoingCustomerProduct,
	carryOverBalances,
}: {
	billingCycleAnchor?: "now" | number;
	prorationBehavior?: BillingBehavior;
	outgoingCustomerProduct?: FullCusProduct;
	carryOverBalances?: { enabled: boolean; feature_ids?: string[] };
}): AnchorResetRefund | undefined => {
	if (billingCycleAnchor !== "now" || prorationBehavior !== "none")
		return undefined;

	const refundCycle = getLongestEntitlementResetCycle({
		customerProduct: outgoingCustomerProduct,
		carryOverBalances,
	});

	return {
		noPartialRefund: true,
		refundCycle: refundCycle ?? undefined,
	};
};

const getLongestEntitlementResetCycle = ({
	customerProduct,
	carryOverBalances,
}: {
	customerProduct?: FullCusProduct;
	carryOverBalances?: { enabled: boolean; feature_ids?: string[] };
}): { interval: EntInterval; intervalCount: number } | null => {
	if (!carryOverBalances?.enabled) return null;
	if (!customerProduct) return null;

	const featureIds = carryOverBalances.feature_ids;
	let longestInterval: EntInterval | null = null;
	let longestIntervalCount = 1;

	for (const cusEnt of customerProduct.customer_entitlements) {
		if (isBooleanCusEnt({ cusEnt })) continue;
		if (isUnlimitedCusEnt(cusEnt)) continue;
		if (featureUtils.isAllocated(cusEnt.entitlement.feature)) continue;
		if (featureIds && !featureIds.includes(cusEnt.entitlement.feature.id))
			continue;

		const entInterval = cusEnt.entitlement.interval;
		if (!entInterval || entInterval === EntInterval.Lifetime) continue;

		const entIntervalCount = cusEnt.entitlement.interval_count ?? 1;

		if (!longestInterval) {
			longestInterval = entInterval;
			longestIntervalCount = entIntervalCount;
			continue;
		}

		const currentRank =
			(INTERVAL_RANK[longestInterval] ?? 0) * 1000 + longestIntervalCount;
		const candidateRank =
			(INTERVAL_RANK[entInterval] ?? 0) * 1000 + entIntervalCount;

		if (candidateRank > currentRank) {
			longestInterval = entInterval;
			longestIntervalCount = entIntervalCount;
		}
	}

	if (!longestInterval) return null;

	return { interval: longestInterval, intervalCount: longestIntervalCount };
};
