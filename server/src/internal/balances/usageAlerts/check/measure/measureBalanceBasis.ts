import {
	type ApiBalanceV1,
	apiBalanceV1ToIncludedGrant,
	apiBalanceV1ToRecurringGrant,
	subtractSafe,
	type UsageAlertBasis,
} from "@autumn/shared";
import type { UsageAlertMeasurement } from "../types/usageAlertMeasurement.js";

export type BalanceBasis = Exclude<UsageAlertBasis, "usage_limit">;

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

// Unlimited features never fire balance-backed alerts.
export const measureBalanceBasis = ({
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
