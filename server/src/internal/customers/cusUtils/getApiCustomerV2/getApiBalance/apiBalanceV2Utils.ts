import type {
	ApiBalanceV1,
	FullAggregatedFeatureBalance,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

export const mergeAggregatedBalanceIntoApiBalanceV2 = ({
	apiBalance,
	aggregatedFeatureBalance,
}: {
	apiBalance: ApiBalanceV1;
	aggregatedFeatureBalance?: FullAggregatedFeatureBalance;
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
	const aggregatedAdjustment = aggregatedFeatureBalance.adjustment ?? 0;
	const aggregatedBalance = aggregatedFeatureBalance.balance ?? 0;

	// Aggregate rows do not retain the full per-entity/per-product breakdown, so
	// the top-level summary is merged from the coarse aggregate values only.
	const granted = new Decimal(aggregatedAllowance)
		.add(aggregatedAdjustment)
		.toNumber();

	const remaining = Decimal.max(0, new Decimal(aggregatedBalance)).toNumber();

	const usage = new Decimal(granted).sub(aggregatedBalance);

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
