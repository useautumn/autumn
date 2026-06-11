import { describe, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { buildUsageLimitItem } from "@/views/customers2/components/sheets/BillingUsageLimitSheet";

describe("buildUsageLimitItem", () => {
	test("builds a usage_limits entry (feature, limit, interval)", () => {
		const item = buildUsageLimitItem({
			featureId: "credits",
			limit: 5,
			window: ResetInterval.Month,
		});
		expect(item.feature_id).toBe("credits");
		expect(item.limit).toBe(5);
		expect(item.interval).toBe(ResetInterval.Month);
	});

	test("window selection carries through as the interval", () => {
		const item = buildUsageLimitItem({
			featureId: "credits",
			limit: 10,
			window: ResetInterval.Day,
		});
		expect(item.interval).toBe(ResetInterval.Day);
	});
});
