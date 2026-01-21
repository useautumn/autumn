import { type ApiBalanceV1, type CusFeatureLegacyData, type Feature, FeatureType } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const apiBalanceToAllowed = ({
	apiBalance,
	feature,
	requiredBalance,
	legacyData,
}: {
	apiBalance: ApiBalanceV1;
	feature: Feature;
	requiredBalance: number;
	legacyData?: CusFeatureLegacyData;
}) => {
	if (!apiBalance) {
		return false;
	}

	// 1. Boolean
	if (feature.type === FeatureType.Boolean) {
		return true;
	}

	// 2. Unlimited
	if (apiBalance.unlimited) {
		return true;
	}

	// 2. Required balance is negative
	if (requiredBalance < 0) {
		return true;
	}

	// 3. Overage allowed
	if (apiBalance.overage_allowed) {
		// No max purchase, allow overage
		if (!apiBalance.max_purchase) {
			return true;
		}

		// Check if purchase_balance < max_purchase
		const availableBalance = new Decimal(apiBalance.max_purchase)
			.sub(legacyData?.purchased_balance ?? 0)
			.minus(apiBalance.remaining);

		if (availableBalance.gte(requiredBalance)) {
			return true;
		}
	}

	// 4. Balance >= required balance

	if (new Decimal(apiBalance.remaining).gte(requiredBalance)) {
		return true;
	}

	return false;
};
