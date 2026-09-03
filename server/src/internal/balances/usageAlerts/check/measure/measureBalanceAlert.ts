import {
	type BalanceBasis,
	measureBalanceBasis,
} from "./measureBalanceBasis.js";
import type { UsageAlertMeasurer } from "./types/usageAlertMeasurer.js";

export const measureBalanceAlert =
	(basis: BalanceBasis): UsageAlertMeasurer =>
	({ apiBalances }) => {
		const before = measureBalanceBasis({
			basis,
			apiBalance: apiBalances.before,
		});
		const after = measureBalanceBasis({ basis, apiBalance: apiBalances.after });
		const measuredBothSides = before !== null && after !== null;
		return measuredBothSides ? { before, after } : null;
	};
