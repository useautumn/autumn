import {
	type ApiBalanceV1,
	apiBalanceV1ToIncludedGrant,
	apiBalanceV1ToRecurringGrant,
	subtractSafe,
} from "@autumn/shared";
import type { BalanceBasis } from "../types/balanceBasis.js";
import type { UsageAlertMeasurement } from "../types/usageAlertMeasurement.js";

const basisToDenominator = ({
	basis,
	apiBalance,
}: {
	basis: BalanceBasis;
	apiBalance: ApiBalanceV1;
}): number => {
	if (basis === "included") return apiBalanceV1ToIncludedGrant({ apiBalance });
	if (basis === "recurring")
		return apiBalanceV1ToRecurringGrant({ apiBalance });
	return apiBalance.granted;
};

// Unlimited masks usage, so no threshold can be read off it.
export const apiBalanceToUsageAlertMeasurement = ({
	basis,
	apiBalance,
}: {
	basis: BalanceBasis;
	apiBalance: ApiBalanceV1;
}): UsageAlertMeasurement | null => {
	if (apiBalance.unlimited) return null;

	const denominator = basisToDenominator({ basis, apiBalance });
	const remaining =
		basis === "balance"
			? apiBalance.remaining
			: Math.max(
					0,
					subtractSafe({ left: denominator, right: apiBalance.usage }),
				);

	return {
		usage: apiBalance.usage,
		denominator: denominator > 0 ? denominator : null,
		remaining,
		periodStartAt: null,
		payloadBlock: {
			basis,
			balance: {
				usage: apiBalance.usage,
				granted: apiBalance.granted,
				included: apiBalanceV1ToIncludedGrant({ apiBalance }),
				remaining,
			},
		},
	};
};
