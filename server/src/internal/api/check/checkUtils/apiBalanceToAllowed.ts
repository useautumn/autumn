import { type ApiBalanceV0, type Feature, FeatureType } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const apiBalanceToAllowed = ({
	apiBalance,
	feature,
	requiredBalance,
}: {
	apiBalance: ApiBalanceV0;
	feature: Feature;
	requiredBalance: number;
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
			.sub(apiBalance.purchased_balance)
			.minus(apiBalance.current_balance);

		if (availableBalance.gte(requiredBalance)) {
			return true;
		}
	}

	// 4. Balance >= required balance

	if (new Decimal(apiBalance.current_balance).gte(requiredBalance)) {
		return true;
	}

	return false;
};
