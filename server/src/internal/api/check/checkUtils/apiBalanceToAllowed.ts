import {
	type ApiBalanceV1,
	apiBalanceV1ToPurchasedBalance,
	type CusFeatureLegacyData,
	type Feature,
	FeatureType,
} from "@autumn/shared";
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
		const totalPurchased = apiBalanceV1ToPurchasedBalance({ apiBalance });

		const availableOverage = new Decimal(apiBalance.max_purchase).sub(
			totalPurchased,
		);

		// write test for this please... (especially in overage cases, etc.)
		if (availableOverage.add(apiBalance.remaining).gte(requiredBalance)) {
			return true;
		}
	}

	// 4. Balance >= required balance

	if (new Decimal(apiBalance.remaining).gte(requiredBalance)) {
		return true;
	}

	return false;
};
