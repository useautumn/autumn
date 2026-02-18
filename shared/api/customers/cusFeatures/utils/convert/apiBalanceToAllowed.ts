import { Decimal } from "decimal.js";
import { apiBalanceV1ToAvailableOverage } from "./apiBalanceV1ToAvailableOverage";

export type ApiBalanceBreakdownInput = {
	usage: number;
	included_grant: number;
	prepaid_grant: number;
	price?: {
		billing_method?: string;
		max_purchase: number | null;
	} | null;
	overage?: number;
};

export type ApiBalanceInput = {
	unlimited: boolean;
	overage_allowed: boolean;
	remaining: number;
	max_purchase: number | null;
	breakdown?: ApiBalanceBreakdownInput[];
};

export type FeatureInput = {
	type?: string;
};

export const apiBalanceToAllowed = ({
	apiBalance,
	feature,
	requiredBalance,
}: {
	apiBalance: ApiBalanceInput;
	feature: FeatureInput;
	requiredBalance: number;
}) => {
	if (!apiBalance) {
		return false;
	}

	// 1. Boolean
	if (feature.type === "boolean") {
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

		if (availableOverage !== null && availableOverage !== undefined) {
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
