import type { ApiBalanceV1 } from "@autumn/shared";
import type { BalanceBasis } from "../types/balanceBasis.js";
import type { BeforeAfter } from "../types/beforeAfter.js";
import type { UsageAlertMeasurement } from "../types/usageAlertMeasurement.js";
import { apiBalanceToUsageAlertMeasurement } from "./apiBalanceToUsageAlertMeasurement.js";

export const measureBalanceAlert = ({
	basis,
	apiBalances,
}: {
	basis: BalanceBasis;
	apiBalances: BeforeAfter<ApiBalanceV1>;
}): BeforeAfter<UsageAlertMeasurement> | null => {
	const before = apiBalanceToUsageAlertMeasurement({
		basis,
		apiBalance: apiBalances.before,
	});
	const after = apiBalanceToUsageAlertMeasurement({
		basis,
		apiBalance: apiBalances.after,
	});
	const measuredBothSides = before !== null && after !== null;
	return measuredBothSides ? { before, after } : null;
};
