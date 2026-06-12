import { expect } from "bun:test";
import type { ApiCustomerV5, DbUsageLimit } from "@autumn/shared";

const roundTo8Dp = (value: number) => Math.round(value * 1e8) / 1e8;

/** Asserts the customer's `billing_controls.usage_limits` entry for a feature. */
export const expectUsageLimitCorrect = ({
	customer,
	featureId,
	usage,
	limit,
	interval,
}: {
	customer: ApiCustomerV5;
	featureId: string;
	usage?: number;
	limit?: number;
	interval?: DbUsageLimit["interval"];
}) => {
	const usageLimit = customer.billing_controls?.usage_limits?.find(
		(entry) => entry.feature_id === featureId,
	);
	expect(
		usageLimit,
		`Missing usage_limits entry for ${featureId}`,
	).toBeDefined();

	if (typeof limit !== "undefined") {
		expect(usageLimit?.limit).toBe(limit);
	}

	if (typeof interval !== "undefined") {
		expect(usageLimit?.interval).toBe(interval);
	}

	if (typeof usage !== "undefined") {
		expect(roundTo8Dp(usageLimit?.usage ?? 0)).toBe(roundTo8Dp(usage));
	}
};
