import { describe, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { buildUsageLimitItem } from "@/views/customers2/components/sheets/BillingUsageLimitSheet";

describe("buildUsageLimitItem", () => {
	test("builds a usage_limits entry (feature, limit, interval)", () => {
		const item = buildUsageLimitItem({
			featureId: "credits",
			enabled: true,
			limit: 5,
			interval: ResetInterval.Month,
		});
		expect(item.feature_id).toBe("credits");
		expect(item.enabled).toBe(true);
		expect(item.limit).toBe(5);
		expect(item.interval).toBe(ResetInterval.Month);
	});

	test("the selected interval carries through to the cap interval", () => {
		const item = buildUsageLimitItem({
			featureId: "credits",
			enabled: false,
			limit: 10,
			interval: ResetInterval.Day,
		});
		expect(item.enabled).toBe(false);
		expect(item.interval).toBe(ResetInterval.Day);
	});
});
