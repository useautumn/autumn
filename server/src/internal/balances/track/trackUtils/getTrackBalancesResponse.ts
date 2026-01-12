import {
	type ApiBalance,
	CheckExpand,
	expandIncludes,
	type Feature,
	getRelevantFeatures,
} from "@autumn/shared";
import type { FeatureDeduction } from "../../utils/types/featureDeduction";

export const getTrackBalancesResponse = ({
	featureDeductions,
	features,
	balances,
	expand,
}: {
	featureDeductions: FeatureDeduction[];
	features: Feature[];
	balances?: Record<string, ApiBalance>;
	expand?: CheckExpand[];
}) => {
	if (!balances) {
		return {
			balance: null,
			balances: undefined,
		};
	}
	// For each feature deduction
	const finalBalances: Record<string, ApiBalance> = {};
	for (const deduction of featureDeductions) {
		let finalBalance: ApiBalance | undefined;
		const relevantFeatures = getRelevantFeatures({
			features,
			featureId: deduction.feature.id,
		});

		for (const feature of relevantFeatures) {
			if (balances[feature.id]) {
				finalBalance = balances[feature.id];
			}
		}

		if (finalBalance) {
			finalBalances[finalBalance.feature_id] = finalBalance;
		}
	}

	if (
		!expandIncludes({
			expand: expand || [],
			includes: [CheckExpand.BalanceFeature],
		})
	) {
		for (const featureId in finalBalances) {
			finalBalances[featureId].feature = undefined;
		}
	}

	if (Object.keys(finalBalances).length === 0) {
		return {
			balance: null,
			balances: undefined,
		};
	} else if (Object.keys(finalBalances).length === 1) {
		return {
			balance: Object.values(finalBalances)[0],
			balances: undefined,
		};
	} else {
		return {
			balance: null,
			balances: finalBalances,
		};
	}
};
