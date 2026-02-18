import type { ApiBalanceV1 } from "@api/customers/cusFeatures/apiBalanceV1";
import { apiBalanceV1ToAvailableOverage } from "@api/customers/cusFeatures/utils/convert/apiBalanceV1ToAvailableOverage";
import type { Feature } from "@models/featureModels/featureModels";
import { isBooleanFeature, notNullish } from "@utils/index";
import { Decimal } from "decimal.js";

export const apiBalanceToAllowed = ({
	apiBalance,
	feature,
	requiredBalance,
}: {
	apiBalance: ApiBalanceV1;
	feature: Feature;
	requiredBalance: number;
}) => {
	if (!apiBalance) {
		return false;
	}

	// 1. Boolean
	if (isBooleanFeature({ feature })) {
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
		// 1. Available overage
		const availableOverage = apiBalanceV1ToAvailableOverage({ apiBalance });

		if (notNullish(availableOverage)) {
			return new Decimal(availableOverage)
				.add(apiBalance.remaining)
				.gte(requiredBalance);
		}

		return true;
	}

	// 4. Balance >= required balance (V1 uses 'remaining' instead of 'current_balance')
	if (new Decimal(apiBalance.remaining).gte(requiredBalance)) {
		return true;
	}

	return false;
};
