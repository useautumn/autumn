import type {
	ApiBalanceV1,
	FullAggregatedFeatureBalance,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

type FullAggregatedFeatureBalanceWithOptionsPrepaid =
	FullAggregatedFeatureBalance & {
		prepaid_grant_from_options?: number;
	};

export const mergeAggregatedBalanceIntoApiBalanceV2 = ({
	apiBalance,
	aggregatedFeatureBalance,
}: {
	apiBalance: ApiBalanceV1;
	aggregatedFeatureBalance?: FullAggregatedFeatureBalanceWithOptionsPrepaid;
}): ApiBalanceV1 => {
	if (!aggregatedFeatureBalance) return apiBalance;

	if (apiBalance.unlimited || aggregatedFeatureBalance.unlimited) {
		return {
			...apiBalance,
			granted: 0,
			remaining: 0,
			usage: 0,
			unlimited: true,
			overage_allowed: false,
			breakdown: apiBalance.breakdown ?? [],
		};
	}
	const aggregatedAllowance = aggregatedFeatureBalance.allowance_total ?? 0;
	const aggregatedPrepaidGrantFromOptions =
		aggregatedFeatureBalance.prepaid_grant_from_options ?? 0;
	const aggregatedAdjustment = aggregatedFeatureBalance.adjustment ?? 0;
	const aggregatedBalance = aggregatedFeatureBalance.balance ?? 0;
	const aggregatedRolloverBalance =
		aggregatedFeatureBalance.rollover_balance ?? 0;
	const aggregatedRolloverUsage = aggregatedFeatureBalance.rollover_usage ?? 0;

	// Aggregate rows do not retain the full per-entity/per-product breakdown, so
	// the top-level summary is merged from the coarse aggregate values only.
	const granted = new Decimal(aggregatedAllowance)
		.add(aggregatedPrepaidGrantFromOptions)
		.add(aggregatedAdjustment)
		.toNumber();

	// Main remaining is floored at 0 (matches legacy behaviour). Rollover
	// remaining is added on top, since rollover balances are independent of
	// main balance sign.
	const mainRemaining = Decimal.max(
		0,
		new Decimal(aggregatedBalance),
	).toNumber();
	const remaining = new Decimal(mainRemaining)
		.add(aggregatedRolloverBalance)
		.toNumber();

	// Usage mirrors the entity-view formula: (granted - main balance) + rollover usage.
	const usage = new Decimal(granted)
		.sub(aggregatedBalance)
		.add(aggregatedRolloverUsage);

	return {
		...apiBalance,
		granted: new Decimal(apiBalance.granted).add(granted).toNumber(),
		remaining: new Decimal(apiBalance.remaining).add(remaining).toNumber(),
		usage: new Decimal(apiBalance.usage).add(usage).toNumber(),
		unlimited: apiBalance.unlimited || aggregatedFeatureBalance.unlimited,
		overage_allowed:
			apiBalance.overage_allowed ||
			aggregatedFeatureBalance.usage_allowed ||
			false,
		breakdown: apiBalance.breakdown ?? [],
	};
};

export const getEmptyApiBalanceV2 = ({
	featureId,
	feature,
}: {
	featureId: string;
	feature?: ApiBalanceV1["feature"];
}): ApiBalanceV1 => {
	return {
		object: "balance",
		feature_id: featureId,
		feature,
		granted: 0,
		remaining: 0,
		usage: 0,
		unlimited: false,
		overage_allowed: false,
		max_purchase: null,
		next_reset_at: null,
		breakdown: [],
		rollovers: undefined,
	};
};
