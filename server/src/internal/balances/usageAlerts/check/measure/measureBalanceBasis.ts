import {
	type ApiBalanceV1,
	apiBalanceV1ToIncludedGrant,
	apiBalanceV1ToRecurringGrant,
	type UsageAlertBasis,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { UsageAlertMeasurement } from "../types/usageAlertMeasurement.js";

export type BalanceBasis = Exclude<UsageAlertBasis, "usage_limit">;

const denominatorFor = ({
	basis,
	apiBalance,
}: {
	basis: BalanceBasis;
	apiBalance: ApiBalanceV1;
}): number => {
	if (basis === "included") return apiBalanceV1ToIncludedGrant({ apiBalance });
	if (basis === "recurring") return apiBalanceV1ToRecurringGrant({ apiBalance });
	return apiBalance.granted;
};

/** Null when the feature is unlimited: balance-backed alerts never fire there. */
export const measureBalanceBasis = ({
	basis,
	apiBalance,
}: {
	basis: BalanceBasis;
	apiBalance: ApiBalanceV1;
}): UsageAlertMeasurement | null => {
	if (apiBalance.unlimited) return null;

	const denominator = denominatorFor({ basis, apiBalance });
	const remaining =
		basis === "balance"
			? apiBalance.remaining
			: Math.max(0, new Decimal(denominator).sub(apiBalance.usage).toNumber());

	return {
		usage: apiBalance.usage,
		denominator: denominator > 0 ? denominator : null,
		remaining,
		periodStartAt: null,
		payloadBlock: {
			balance: {
				usage: apiBalance.usage,
				granted: apiBalance.granted,
				included: apiBalanceV1ToIncludedGrant({ apiBalance }),
				remaining,
			},
		},
	};
};
